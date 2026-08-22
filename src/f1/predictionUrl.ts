export function resolvePredictionUrl(
  guildUrl: string | null | undefined,
  envUrl?: string | null
): string | null {
  const raw = guildUrl?.trim() || envUrl?.trim() || "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return null;
    return url.toString();
  } catch {
    return null;
  }
}
