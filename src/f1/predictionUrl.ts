function ipv4ToInt(parts: readonly number[]): number {
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function parseIpv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

function stripIpv6ZoneAndBrackets(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  const zone = h.indexOf("%");
  if (zone !== -1) h = h.slice(0, zone);
  return h;
}

/**
 * Expand an IPv6 literal into 8 groups. Supports :: compression and
 * trailing dotted-quad IPv4 (mapped/compatible forms).
 */
function expandIpv6(addr: string): number[] | null {
  let input = stripIpv6ZoneAndBrackets(addr);
  if (!input.includes(":")) return null;

  // Convert trailing IPv4 dotted quad into two hex groups.
  const lastColon = input.lastIndexOf(":");
  const maybeV4 = input.slice(lastColon + 1);
  const v4 = parseIpv4(maybeV4);
  if (v4) {
    const hi = ((v4[0]! << 8) | v4[1]!) & 0xffff;
    const lo = ((v4[2]! << 8) | v4[3]!) & 0xffff;
    input = `${input.slice(0, lastColon)}:${hi.toString(16)}:${lo.toString(16)}`;
  }

  const sides = input.split("::");
  if (sides.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const groups = side.split(":");
    const out: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  if (sides.length === 1) {
    const all = parseSide(sides[0]!);
    if (!all || all.length !== 8) return null;
    return all;
  }

  const head = parseSide(sides[0]!);
  const tail = parseSide(sides[1]!);
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  return [...head, ...Array(missing).fill(0), ...tail];
}

function isNonPublicIpv4(parts: readonly number[]): boolean {
  // Force unsigned 32-bit arithmetic. JS bitwise ops use signed int32; comparing
  // masks with the high bit set (e.g. 0xac100000) fails without >>> 0.
  const n = ipv4ToInt(parts) >>> 0;
  const inNet = (mask: number, net: number) => ((n & (mask >>> 0)) >>> 0) === (net >>> 0);
  // 0.0.0.0/8 unspecified
  if (inNet(0xff000000, 0x00000000)) return true;
  // 127.0.0.0/8 loopback
  if (inNet(0xff000000, 0x7f000000)) return true;
  // 10.0.0.0/8
  if (inNet(0xff000000, 0x0a000000)) return true;
  // 172.16.0.0/12
  if (inNet(0xfff00000, 0xac100000)) return true;
  // 192.168.0.0/16
  if (inNet(0xffff0000, 0xc0a80000)) return true;
  // 169.254.0.0/16 link-local (covers 169.254.169.254)
  if (inNet(0xffff0000, 0xa9fe0000)) return true;
  return false;
}

function mappedIpv4FromGroups(groups: readonly number[]): number[] | null {
  // ::ffff:a.b.c.d
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    return [
      (groups[6]! >> 8) & 0xff,
      groups[6]! & 0xff,
      (groups[7]! >> 8) & 0xff,
      groups[7]! & 0xff,
    ];
  }
  // deprecated IPv4-compatible ::a.b.c.d (excluding :: and ::1)
  if (groups.slice(0, 6).every((g) => g === 0)) {
    const a = (groups[6]! >> 8) & 0xff;
    const b = groups[6]! & 0xff;
    const c = (groups[7]! >> 8) & 0xff;
    const d = groups[7]! & 0xff;
    if (!(a === 0 && b === 0 && c === 0 && (d === 0 || d === 1))) {
      return [a, b, c, d];
    }
  }
  return null;
}

function isNonPublicIpv6(groups: readonly number[]): boolean {
  if (groups.every((g) => g === 0)) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  if ((groups[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((groups[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7

  const mapped = mappedIpv4FromGroups(groups);
  if (mapped) return isNonPublicIpv4(mapped);
  return false;
}

function isForbiddenHostname(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost");
}

function isForbiddenHost(hostname: string): boolean {
  // Node may leave brackets on IPv6 hostnames (e.g. "[::ffff:c0a8:1]").
  const host = stripIpv6ZoneAndBrackets(hostname.toLowerCase());
  if (isForbiddenHostname(host)) return true;

  const v4 = parseIpv4(host);
  if (v4) return isNonPublicIpv4(v4);

  if (host.includes(":")) {
    const groups = expandIpv6(host);
    if (!groups) return true;
    return isNonPublicIpv6(groups);
  }

  return false;
}

export function resolvePredictionUrl(
  guildUrl: string | null | undefined,
  envUrl?: string | null
): string | null {
  const raw = guildUrl?.trim() || envUrl?.trim() || "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (isForbiddenHost(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
