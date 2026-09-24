import dns from "node:dns/promises";
import net from "node:net";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
/** Fresh cache window; expired entries are still kept for stale-on-error fallback. */
const CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_REDIRECTS = 5;
const MAX_FETCH_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;
/** Cap parallel ICS pulls per origin — TimeEdit and similar choke under stampedes. */
const MAX_CONCURRENT_PER_HOST = 2;

type CacheEntry = {
  body: string;
  expiresAt: number;
};

type HostGate = {
  active: number;
  waiters: Array<() => void>;
};

const cache = new Map<string, CacheEntry>();
const hostGates = new Map<string, HostGate>();

type LookupFn = typeof dns.lookup;
type FetchFn = typeof fetch;
type SleepFn = (ms: number) => Promise<void>;

let lookupImpl: LookupFn = dns.lookup.bind(dns);
let fetchImpl: FetchFn = globalThis.fetch.bind(globalThis);
let sleepImpl: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let nowImpl = () => Date.now();
let timeoutMs = FETCH_TIMEOUT_MS;
let maxAttempts = MAX_FETCH_ATTEMPTS;
let retryDelayMs = RETRY_DELAY_MS;
let maxConcurrentPerHost = MAX_CONCURRENT_PER_HOST;

/** Test-only hooks — do not use from production code. */
export function configureIcsFetcherForTests(options: {
  lookup?: LookupFn;
  fetch?: FetchFn;
  sleep?: SleepFn;
  now?: () => number;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  maxConcurrentPerHost?: number;
}): void {
  if (options.lookup) lookupImpl = options.lookup;
  if (options.fetch) fetchImpl = options.fetch;
  if (options.sleep) sleepImpl = options.sleep;
  if (options.now) nowImpl = options.now;
  if (options.timeoutMs != null) timeoutMs = options.timeoutMs;
  if (options.maxAttempts != null) maxAttempts = options.maxAttempts;
  if (options.retryDelayMs != null) retryDelayMs = options.retryDelayMs;
  if (options.maxConcurrentPerHost != null) maxConcurrentPerHost = options.maxConcurrentPerHost;
}

/** Test-only reset of cache, gates, and default hooks. */
export function resetIcsFetcherForTests(): void {
  cache.clear();
  hostGates.clear();
  lookupImpl = dns.lookup.bind(dns);
  fetchImpl = globalThis.fetch.bind(globalThis);
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  nowImpl = () => Date.now();
  timeoutMs = FETCH_TIMEOUT_MS;
  maxAttempts = MAX_FETCH_ATTEMPTS;
  retryDelayMs = RETRY_DELAY_MS;
  maxConcurrentPerHost = MAX_CONCURRENT_PER_HOST;
}

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

function hostnameOf(urlString: string): string {
  return new URL(urlString).hostname.toLowerCase();
}

function getHostGate(hostname: string): HostGate {
  let gate = hostGates.get(hostname);
  if (!gate) {
    gate = { active: 0, waiters: [] };
    hostGates.set(hostname, gate);
  }
  return gate;
}

async function withHostSlot<T>(hostname: string, fn: () => Promise<T>): Promise<T> {
  const gate = getHostGate(hostname);
  while (gate.active >= maxConcurrentPerHost) {
    await new Promise<void>((resolve) => {
      gate.waiters.push(resolve);
    });
  }
  gate.active += 1;
  try {
    return await fn();
  } finally {
    gate.active -= 1;
    const next = gate.waiters.shift();
    if (next) next();
  }
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

  const addresses = await lookupImpl(url.hostname, { all: true, verbatim: true });
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
    const res = await fetchImpl(currentUrl, {
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

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.message === "ICS fetch timed out");
}

async function fetchOnce(urlString: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchWithSafeRedirects(urlString, controller.signal);

    if (!res.ok) {
      throw new Error(`ICS fetch failed (${res.status})`);
    }

    return await readResponseBody(res);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("ICS fetch timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(urlString: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchOnce(urlString);
    } catch (err) {
      lastError = err;
      if (!isTimeoutError(err) || attempt >= maxAttempts) {
        throw err;
      }
      await sleepImpl(retryDelayMs);
    }
  }
  throw lastError;
}

export async function fetchIcsContent(
  urlString: string,
  options?: { skipCache?: boolean }
): Promise<string> {
  const now = nowImpl();
  const cached = cache.get(urlString);
  if (!options?.skipCache && cached && cached.expiresAt > now) {
    return cached.body;
  }

  try {
    const body = await withHostSlot(hostnameOf(urlString), () => fetchWithRetry(urlString));
    cache.set(urlString, { body, expiresAt: nowImpl() + CACHE_TTL_MS });
    return body;
  } catch (err) {
    // Prefer last-good body over empty calendars when the upstream times out or flakes.
    if (cached) {
      return cached.body;
    }
    throw err;
  }
}
