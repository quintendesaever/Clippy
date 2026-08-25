export type ApproximateGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
};

const UNKNOWN_COUNTRIES = new Set(["", "XX", "T1", "A1", "A2"]);

function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  for (const [key, raw] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

function cleanPlace(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "?" || UNKNOWN_COUNTRIES.has(trimmed.toUpperCase())) return null;
  if (trimmed.length > 80) return trimmed.slice(0, 80);
  return trimmed;
}

/** Read approximate location from Cloudflare visitor headers. Never uses IP. */
export function geoFromRequestHeaders(
  headers: Record<string, string | string[] | undefined> | undefined
): ApproximateGeo {
  const countryRaw = headerValue(headers, "cf-ipcountry");
  const country =
    countryRaw && !UNKNOWN_COUNTRIES.has(countryRaw.toUpperCase())
      ? countryRaw.toUpperCase().slice(0, 8)
      : null;
  const region = cleanPlace(headerValue(headers, "cf-region") ?? headerValue(headers, "cf-ipregion"));
  const city = cleanPlace(headerValue(headers, "cf-ipcity"));
  return { country, region, city };
}

export function formatApproximateLocation(geo: ApproximateGeo | null | undefined): string | null {
  if (!geo) return null;
  const parts: string[] = [];
  if (geo.city) parts.push(geo.city);
  if (geo.region && geo.region !== geo.city) parts.push(geo.region);
  if (geo.country && geo.country !== geo.region && geo.country !== geo.city) parts.push(geo.country);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function sanitizeReferrer(referrer: string | undefined | null, dashboardOrigin: string): string | null {
  if (!referrer?.trim()) return null;
  try {
    const url = new URL(referrer);
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    if (url.origin === dashboardOrigin) return null;
    const href = url.toString();
    return href.length > 256 ? href.slice(0, 256) : href;
  } catch {
    return null;
  }
}
