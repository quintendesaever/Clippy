import sharp from "sharp";
import { truncateText } from "./eventUtils.js";
import type { GuildTimetable, TimetableMember } from "./types.js";

const WIDTH = 700;
const HOUR_START = 8;
const HOUR_END = 20;
const HOUR_COUNT = HOUR_END - HOUR_START;
const MEMBER_LABEL_WIDTH = 72;
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 80;
const FONT = "system-ui,-apple-system,sans-serif";

const CARD_RADIUS = 12;
const CARD_INNER_PAD = 16;
const ACCENT_WIDTH = 6;
const AVATAR_R = 16;
const AVATAR_OVERLAP = 8;
const AVATAR_BORDER = 2;

const THEME = {
  dark: "#0b0c10",
  sidebar: "#12141c",
  card: "#1a1d26",
  border: "#2d303e",
  accent: "#6366f1",
  text: "#d1d5db",
  textMuted: "#6b7280",
  white: "#ffffff",
} as const;

type CardBounds = { x: number; y: number; width: number; height: number };

type DemoCard = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  title: string;
  subtitle: string;
  accentColor: string;
  avatarColors: string[];
};

const HARDCODED_CARDS: Record<number, DemoCard[]> = {
  0: [
    {
      startHour: 10,
      startMinute: 0,
      endHour: 12,
      endMinute: 0,
      title: "Lineaire Algebra",
      subtitle: "Hoorcollege · AUD.D",
      accentColor: "#f97316",
      avatarColors: ["#6366f1", "#57f287", "#ec4899"],
    },
    {
      startHour: 13,
      startMinute: 0,
      endHour: 14,
      endMinute: 30,
      title: "Analyse",
      subtitle: "Werkcollege · S9",
      accentColor: "#eab308",
      avatarColors: ["#3b82f6", "#a855f7"],
    },
  ],
  1: [
    {
      startHour: 11,
      startMinute: 0,
      endHour: 14,
      endMinute: 0,
      title: "Physica",
      subtitle: "Practicum · Lab 3",
      accentColor: "#ef4444",
      avatarColors: ["#06b6d4", "#f97316", "#8b5cf6"],
    },
  ],
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function hourTickX(hourIndex: number, colWidth: number): number {
  return MEMBER_LABEL_WIDTH + hourIndex * colWidth;
}

function timeToX(hour: number, minute: number, colWidth: number): number {
  const minutesFromStart = (hour - HOUR_START) * 60 + minute;
  return MEMBER_LABEL_WIDTH + (minutesFromStart / 60) * colWidth;
}

function cardBounds(
  rowY: number,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
  colWidth: number
): CardBounds {
  const x = timeToX(startHour, startMinute, colWidth);
  const endX = timeToX(endHour, endMinute, colWidth);
  return {
    x,
    y: rowY,
    width: Math.max(endX - x, 2),
    height: ROW_HEIGHT,
  };
}

function buildDefs(): string {
  return `<defs>
    <filter id="cardShadow" x="-8%" y="-12%" width="116%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>`;
}

function buildHourHeader(colWidth: number): string[] {
  const parts: string[] = [
    `<rect x="0" y="0" width="${WIDTH}" height="${HEADER_HEIGHT}" fill="${THEME.dark}"/>`,
    `<line x1="0" y1="${HEADER_HEIGHT}" x2="${WIDTH}" y2="${HEADER_HEIGHT}" stroke="${THEME.border}" stroke-width="1"/>`,
    `<rect x="0" y="0" width="${MEMBER_LABEL_WIDTH}" height="${HEADER_HEIGHT}" fill="${THEME.sidebar}"/>`,
  ];

  for (let i = 0; i < HOUR_COUNT; i++) {
    const x = hourTickX(i, colWidth);
    const label = formatHourLabel(HOUR_START + i);
    parts.push(
      `<text x="${x}" y="${HEADER_HEIGHT / 2 + 4}" fill="${THEME.textMuted}" font-size="12" font-weight="500" text-anchor="middle" font-family="${FONT}">${label}</text>`
    );
  }

  return parts;
}

function buildHourGridLines(y: number, height: number, colWidth: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i <= HOUR_COUNT; i++) {
    const x = hourTickX(i, colWidth);
    parts.push(
      `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + height}" stroke="${THEME.border}" stroke-width="1" stroke-opacity="0.15"/>`
    );
  }
  return parts;
}

function buildAvatar(cx: number, cy: number, color: string): string[] {
  const outerR = AVATAR_R + AVATAR_BORDER;
  return [
    `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="${THEME.card}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${AVATAR_R}" fill="${color}"/>`,
  ];
}

function buildKebabIcon(x: number, y: number, size: number): string {
  const scale = size / 20;
  return `<g transform="translate(${x - size / 2}, ${y - size / 2}) scale(${scale})" fill="${THEME.textMuted}">
    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
  </g>`;
}

function buildActivityCard(
  bounds: CardBounds,
  title: string,
  subtitle: string,
  accentColor: string,
  avatarColors: string[]
): string[] {
  const { x, y, width, height } = bounds;
  const radius = Math.min(CARD_RADIUS, height / 2 - 1, width / 2 - 1);
  const clipId = `card-${Math.round(x)}-${Math.round(y)}`;
  const cy = y + height / 2;
  const showMenu = width >= 100;
  const showSubtitle = width >= 80;
  const menuSize = 20;
  const menuPad = showMenu ? menuSize + CARD_INNER_PAD : CARD_INNER_PAD;

  const contentX = x + ACCENT_WIDTH + CARD_INNER_PAD;
  let avatarEndX = contentX;

  const parts: string[] = [
    `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></clipPath>`,
    `<g filter="url(#cardShadow)" clip-path="url(#${clipId})">`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${THEME.card}"/>`,
    `<rect x="${x}" y="${y}" width="${ACCENT_WIDTH}" height="${height}" fill="${accentColor}"/>`,
    `</g>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="none" stroke="${THEME.border}" stroke-width="1"/>`,
  ];

  if (width >= 56 && avatarColors.length > 0) {
    const visibleAvatars = avatarColors.slice(0, Math.min(3, avatarColors.length));
    const avatarStep = AVATAR_R * 2 - AVATAR_OVERLAP;
    const avatarsWidth = AVATAR_R * 2 + avatarStep * (visibleAvatars.length - 1);
    avatarEndX = contentX + avatarsWidth + 12;

    visibleAvatars.forEach((color, index) => {
      const cx = contentX + AVATAR_R + index * avatarStep;
      parts.push(...buildAvatar(cx, cy, color));
    });
  } else {
    avatarEndX = contentX;
  }

  const textX = avatarColors.length > 0 && width >= 56 ? avatarEndX : contentX;
  const textMaxWidth = Math.max(0, x + width - textX - menuPad);
  const maxChars = Math.max(4, Math.floor(textMaxWidth / 6.5));
  const clippedTitle = truncateText(title, maxChars);
  const clippedSubtitle = truncateText(subtitle, maxChars);

  parts.push(
    `<text x="${textX}" y="${showSubtitle ? cy - 3 : cy + 4}" fill="${THEME.white}" font-size="14" font-weight="600" font-family="${FONT}">${escapeXml(clippedTitle)}</text>`
  );

  if (showSubtitle) {
    parts.push(
      `<text x="${textX}" y="${cy + 14}" fill="${THEME.textMuted}" font-size="12" font-family="${FONT}">${escapeXml(clippedSubtitle)}</text>`
    );
  }

  if (showMenu) {
    parts.push(buildKebabIcon(x + width - CARD_INNER_PAD - menuSize / 2, cy, menuSize));
  }

  return parts;
}

function buildHardcodedCards(rowIndex: number, rowY: number, colWidth: number): string[] {
  const cards = HARDCODED_CARDS[rowIndex] ?? [];
  return cards.flatMap((card) => {
    const bounds = cardBounds(
      rowY,
      card.startHour,
      card.startMinute,
      card.endHour,
      card.endMinute,
      colWidth
    );
    return buildActivityCard(
      bounds,
      card.title,
      card.subtitle,
      card.accentColor,
      card.avatarColors
    );
  });
}

function buildMemberRow(
  member: TimetableMember,
  rowIndex: number,
  trackWidth: number,
  colWidth: number
): string[] {
  const y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
  return [
    `<rect x="0" y="${y}" width="${MEMBER_LABEL_WIDTH}" height="${ROW_HEIGHT}" fill="${THEME.sidebar}"/>`,
    `<rect x="0" y="${y}" width="3" height="${ROW_HEIGHT}" fill="${member.color}"/>`,
    `<text x="14" y="${y + ROW_HEIGHT / 2 + 5}" fill="${THEME.text}" font-size="13" font-weight="600" font-family="${FONT}">${escapeXml(member.initials)}</text>`,
    `<rect x="${MEMBER_LABEL_WIDTH}" y="${y}" width="${trackWidth}" height="${ROW_HEIGHT}" fill="${THEME.dark}"/>`,
    ...buildHourGridLines(y, ROW_HEIGHT, colWidth),
    ...buildHardcodedCards(rowIndex, y, colWidth),
  ];
}

function buildTimelineSvg(timetable: GuildTimetable): string {
  const members = timetable.members;
  const rowCount = Math.max(members.length, 1);
  const trackWidth = WIDTH - MEMBER_LABEL_WIDTH;
  const colWidth = trackWidth / HOUR_COUNT;
  const height = HEADER_HEIGHT + rowCount * ROW_HEIGHT;

  const parts: string[] = [
    buildDefs(),
    `<rect width="100%" height="100%" fill="${THEME.dark}"/>`,
    ...buildHourHeader(colWidth),
  ];

  if (members.length === 0) {
    const y = HEADER_HEIGHT;
    parts.push(
      `<rect x="${MEMBER_LABEL_WIDTH}" y="${y}" width="${trackWidth}" height="${ROW_HEIGHT}" fill="${THEME.dark}"/>`,
      ...buildHourGridLines(y, ROW_HEIGHT, colWidth),
      ...buildHardcodedCards(0, y, colWidth)
    );
  } else {
    for (let i = 0; i < members.length; i++) {
      parts.push(...buildMemberRow(members[i], i, trackWidth, colWidth));
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  ${parts.join("\n  ")}
</svg>`;
}

export async function renderTimetablePng(
  timetable: GuildTimetable,
  _dayKey: string
): Promise<Buffer> {
  const svg = buildTimelineSvg(timetable);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
