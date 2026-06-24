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

const TYPE_PATTERNS: { pattern: RegExp; badge: string }[] = [
  { pattern: /\bhoorcollege\b/i, badge: "H" },
  { pattern: /\bpracticum\b/i, badge: "P" },
  { pattern: /\bwerkcollege\b/i, badge: "W" },
  { pattern: /\bles\b(?=\s|$|[-,)])/i, badge: "L" },
  { pattern: /\bgroepswerk\b/i, badge: "G" },
  { pattern: /\bexercise\b/i, badge: "E" },
  { pattern: /\blecture\b/i, badge: "H" },
  { pattern: /\blab\b/i, badge: "P" },
  { pattern: /\bseminar\b/i, badge: "S" },
];

export function parseActivitySummary(raw: string): { title: string; typeBadges: string[] } {
  let s = (raw || "").trim();
  s = s.replace(/^\s*[A-Z]+\d+[A-Z0-9]*\s*[.\-:\s]\s*/i, "").trim();
  const typeBadges: string[] = [];
  for (const { pattern, badge } of TYPE_PATTERNS) {
    if (pattern.test(s)) {
      s = s.replace(pattern, " ");
      if (!typeBadges.includes(badge)) typeBadges.push(badge);
    }
  }
  s = s
    .replace(/\s*[-\–—]\s*$/i, "")
    .replace(/^\s*[-\–—]\s*/i, "")
    .replace(/\s*[(\[]\s*[A-Z0-9]{4,}\s*[)\]]\s*/gi, " ")
    .replace(/\b[A-Z]+\d+[A-Z0-9]*\b/gi, " ")
    .replace(/\s*[(\[]\s*[A-Za-z]+\s*[)\]]\s*$/i, " ")
    .replace(/\s*\(\s*\)\s*/g, " ")
    .replace(/\s*\[\s*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const title = s || "(geen titel)";
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
