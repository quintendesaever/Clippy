import dns from "node:dns/promises";
import net from "node:net";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const CACHE_TTL_MS = 20 * 60 * 1000;

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
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0") return true;

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIpv4(host);
  if (ipVersion === 6) {
    const normalized = host.toLowerCase();
    if (normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80")) return true;
  }
  return false;
}

async function assertUrlSafe(urlString: string): Promise<URL> {
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
    if (isBlockedHostname(addr.address)) {
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

export async function fetchIcsContent(urlString: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(urlString);
  if (cached && cached.expiresAt > now) {
    return cached.body;
  }

  const url = await assertUrlSafe(urlString);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "text/calendar, text/plain, */*" },
      redirect: "follow",
    });

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
