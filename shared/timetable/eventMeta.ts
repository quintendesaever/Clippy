const ROOM_CODE_PATTERN = /\b([A-Z]{3,6}\.\d+\.\d+)\b/g;

export function shortLocation(location: string | undefined | null): string | undefined {
  if (!location?.trim()) return undefined;
  const matches = [...location.matchAll(ROOM_CODE_PATTERN)].map((m) => m[1]);
  const unique = [...new Set(matches)];
  if (unique.length > 0) return unique.join(" + ");
  const trimmed = location.trim();
  if (trimmed.length <= 24) return trimmed;
  return `${trimmed.slice(0, 23)}…`;
}

export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

export function normalizeIcsDescription(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const text = raw
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\r\n/g, "\n")
    .trim();
  return text || undefined;
}

export function descriptionPreview(description: string, maxLen = 48): string {
  const singleLine = description.replace(/\s+/g, " ").trim();
  return truncateText(singleLine, maxLen);
}
