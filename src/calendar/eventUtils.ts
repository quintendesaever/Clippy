export const MEMBER_COLORS = [
  "#a855f7",
  "#eab308",
  "#22c55e",
  "#0ea5e9",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#3b82f6",
  "#f97316",
  "#14b8a6",
  "#8b5cf6",
];

const TYPE_PATTERNS: { pattern: RegExp; badge: string; titleLabel: string }[] = [
  { pattern: /\bschriftelijke\s+evaluatie\b/i, badge: "V", titleLabel: "Evaluatie" },
  { pattern: /\bmondelinge\s+evaluatie\b/i, badge: "V", titleLabel: "Evaluatie" },
  { pattern: /\bevaluatie\b/i, badge: "V", titleLabel: "Evaluatie" },
  { pattern: /\bexamen\b/i, badge: "V", titleLabel: "Evaluatie" },
  { pattern: /\bexam\b/i, badge: "V", titleLabel: "Evaluatie" },
  { pattern: /\bhoorcollege\b/i, badge: "H", titleLabel: "Hoorcollege" },
  { pattern: /\bpracticum\b/i, badge: "P", titleLabel: "Practicum" },
  { pattern: /\bwerkcollege\b/i, badge: "W", titleLabel: "Werkcollege" },
  { pattern: /\bles\b(?=\s|$|[-,)])/i, badge: "L", titleLabel: "Les" },
  { pattern: /\bgroepswerk\b/i, badge: "G", titleLabel: "Groepswerk" },
  { pattern: /\bexercise\b/i, badge: "E", titleLabel: "Exercise" },
  { pattern: /\blecture\b/i, badge: "H", titleLabel: "Lecture" },
  { pattern: /\bproject\b/i, badge: "J", titleLabel: "Project" },
  { pattern: /\blab\b/i, badge: "P", titleLabel: "Lab" },
  { pattern: /\bseminar\b/i, badge: "S", titleLabel: "Seminar" },
];

/** Only safe to scan whole description (avoid false hits like "Lecture Hall"). */
const DESCRIPTION_HINT_PATTERNS: { pattern: RegExp; badge: string; titleLabel: string }[] = [
  { pattern: /\bexamen\b/i, badge: "V", titleLabel: "Evaluatie" },
  { pattern: /\bevaluatie\b/i, badge: "V", titleLabel: "Evaluatie" },
  { pattern: /\bexam\b/i, badge: "V", titleLabel: "Evaluatie" },
];

function matchType(text: string): { badge: string; titleLabel: string } | null {
  for (const { pattern, badge, titleLabel } of TYPE_PATTERNS) {
    if (pattern.test(text)) return { badge, titleLabel };
  }
  return null;
}

function extractTypeFromDescription(description?: string): { badge: string; titleLabel: string } | null {
  if (!description?.trim()) return null;
  const typeLine = description.match(/\bType:\s*([^\n\r]+)/i);
  if (typeLine) {
    const fromLine = matchType(typeLine[1].trim());
    if (fromLine) return fromLine;
  }
  for (const { pattern, badge, titleLabel } of DESCRIPTION_HINT_PATTERNS) {
    if (pattern.test(description)) return { badge, titleLabel };
  }
  return null;
}

export function parseActivitySummary(
  raw: string,
  description?: string
): { title: string; typeBadges: string[] } {
  let s = (raw || "").trim();
  // MyTimetable draft marker + leading course codes (incl. WI2180LR-II)
  s = s.replace(/^\s*\[DRAFT\]\s*/i, "").trim();
  s = s.replace(/^\s*[A-Z]+\d+[A-Z0-9]*(?:-[A-Z0-9]+)*\s*[.\-:\s]+\s*/i, "").trim();

  const typeBadges: string[] = [];
  let titleTypeLabel: string | undefined;

  for (const { pattern, badge, titleLabel } of TYPE_PATTERNS) {
    if (pattern.test(s)) {
      s = s.replace(pattern, " ");
      if (!typeBadges.includes(badge)) typeBadges.push(badge);
      if (!titleTypeLabel) titleTypeLabel = titleLabel;
    }
  }

  if (!titleTypeLabel) {
    const fromDesc = extractTypeFromDescription(description);
    if (fromDesc) {
      if (!typeBadges.includes(fromDesc.badge)) typeBadges.push(fromDesc.badge);
      titleTypeLabel = fromDesc.titleLabel;
    }
  }

  s = s
    .replace(/\s*[(\[]\s*[A-Z0-9]{4,}\s*[)\]]\s*/gi, " ")
    .replace(/\b[A-Z]+\d+[A-Z0-9]*(?:-[A-Z0-9]+)*\b/gi, " ")
    .replace(/\bGR\d+\b/gi, " ")
    .replace(/\s*[(\[]\s*[A-Za-z]+\s*[)\]]\s*$/i, " ")
    .replace(/\s*\(\s*\)\s*/g, " ")
    .replace(/\s*\[\s*\]\s*/g, " ")
    .replace(/\s*[-\–—]+\s*$/i, "")
    .replace(/^\s*[-\–—]+\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // Keep course name only (first comma segment) for compact cards everywhere
  const courseOnly = s.split(",")[0]?.trim() ?? "";
  const title = courseOnly || s || "(geen titel)";

  return { title, typeBadges };
}

export function colorForInitials(initials: string): string {
  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = (hash * 31 + initials.charCodeAt(i)) >>> 0;
  }
  return MEMBER_COLORS[hash % MEMBER_COLORS.length];
}

export const DISCORD_COLOR_EMOJIS = ["🟣", "🟡", "🟢", "🔵", "🔴", "🩷", "🩵", "🔷", "🟠", "🟩", "💜"];

export function emojiForInitials(initials: string): string {
  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = (hash * 31 + initials.charCodeAt(i)) >>> 0;
  }
  return DISCORD_COLOR_EMOJIS[hash % DISCORD_COLOR_EMOJIS.length];
}

export const HOUR_START = 8;
export const HOUR_END = 20;
export const TOTAL_HOURS = HOUR_END - HOUR_START;

export {
  colorForTypeBadge,
  descriptionPreview,
  labelForTypeBadge,
  shortLocation,
  truncateText,
} from "../../shared/timetable/eventMeta.js";
