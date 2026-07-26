import dns from "node:dns/promises";
import net from "node:net";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_REDIRECTS = 5;

type CacheEntry = {
  body: string;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;

    // IPv4-mapped IPv6 (::ffff:a.b.c.d)
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]!);

    const firstHex = Number.parseInt(normalized.split(":")[0] || "0", 16);
    if (Number.isNaN(firstHex)) return true;
    // Unique local fc00::/7
    if ((firstHex & 0xfe00) === 0xfc00) return true;
    // Link-local fe80::/10
    if ((firstHex & 0xffc0) === 0xfe80) return true;
    return false;
  }
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0") return true;
  if (net.isIP(host)) return isBlockedIp(host);
  return false;
}

/** Validates scheme/host/DNS before storing or fetching an ICS URL. */
export async function assertIcsUrlSafe(urlString: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid ICS URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("ICS URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("ICS URL must not include credentials");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error("ICS URL host is not allowed");
  }

  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("ICS URL host could not be resolved");
  }
  for (const addr of addresses) {
    if (isBlockedIp(addr.address)) {
      throw new Error("ICS URL resolves to a blocked address");
    }
  }

  return url;
}

async function readResponseBody(res: Response): Promise<string> {
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error("ICS file is too large");
  }

  const reader = res.body?.getReader();
  if (!reader) {
    return await res.text();
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      throw new Error("ICS file is too large");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function fetchWithSafeRedirects(
  initialUrl: string,
  signal: AbortSignal
): Promise<Response> {
  let currentUrl = (await assertIcsUrlSafe(initialUrl)).toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(currentUrl, {
      signal,
      headers: { Accept: "text/calendar, text/plain, */*" },
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error("ICS fetch redirect missing Location");
      }
      // Drop redirect body so the connection can be reused.
      await res.body?.cancel().catch(() => undefined);

      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = (await assertIcsUrlSafe(nextUrl)).toString();
      continue;
    }

    return res;
  }

  throw new Error("ICS fetch too many redirects");
}

export async function fetchIcsContent(urlString: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(urlString);
  if (cached && cached.expiresAt > now) {
    return cached.body;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetchWithSafeRedirects(urlString, controller.signal);

    if (!res.ok) {
      throw new Error(`ICS fetch failed (${res.status})`);
    }

    const body = await readResponseBody(res);
    cache.set(urlString, { body, expiresAt: now + CACHE_TTL_MS });
    return body;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("ICS fetch timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
