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

/** MyTimetable / ICS notes often embed Location(s): on its own line + the room on the next. */
const LOCATION_HEADING_LINE =
  /(?:^|\n)[ \t]*(?:Location\(s\)|Locations?|Locatie(?:s)?)[ \t]*:/im;

export function descriptionContainsLocation(description: string | undefined | null): boolean {
  if (!description?.trim()) return false;
  return LOCATION_HEADING_LINE.test(description);
}

/** Strip location blocks from event notes so they cannot leak when location is hidden. */
export function redactLocationFromDescription(
  description: string | undefined | null
): string | undefined {
  if (!description?.trim()) return undefined;
  const redacted = description
    // Location(s):\nFlux Hall C ...
    .replace(/(?:^|\n)[ \t]*Location\(s\)[ \t]*:\s*\n[^\n]*/gi, "\n")
    // Single-line Location: / Locations: / Locatie:
    .replace(/(?:^|\n)[ \t]*(?:Locations?|Locatie(?:s)?)[ \t]*:[^\n]*/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return redacted || undefined;
}

export function descriptionPreview(description: string, maxLen = 48): string {
  const singleLine = description.replace(/\s+/g, " ").trim();
  return truncateText(singleLine, maxLen);
}

/** Dutch labels for activity type badges (H → hoorcollege, …). */
export const TYPE_BADGE_LABELS: Record<string, string> = {
  H: "hoorcollege",
  P: "practicum",
  W: "werkcollege",
  L: "les",
  G: "groepswerk",
  E: "exercise",
  S: "seminar",
  V: "evaluatie",
  J: "project",
  A: "activiteit",
};

export function labelForTypeBadge(badge: string): string {
  return TYPE_BADGE_LABELS[badge.toUpperCase()] ?? badge;
}
