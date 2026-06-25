import sharp from "sharp";
import type { GuildTimetable } from "./types.js";

const WIDTH = 1200;
const HOUR_START = 8;
const HOUR_END = 20;
const HOUR_COUNT = HOUR_END - HOUR_START;
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 80;
const FONT = "system-ui,-apple-system,sans-serif";

const CARD_RADIUS = 12;
const CARD_INNER_PAD = 16;
const MENU_SIZE = 20;

const THEME = {
  dark: "#0b0c10",
  card: "#1a1d26",
  border: "#2d303e",
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
    },
    {
      startHour: 13,
      startMinute: 0,
      endHour: 14,
      endMinute: 30,
      title: "Analyse",
      subtitle: "Werkcollege · S9",
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
  return hourIndex * colWidth;
}

function timeToX(hour: number, minute: number, colWidth: number): number {
  const minutesFromStart = (hour - HOUR_START) * 60 + minute;
  return (minutesFromStart / 60) * colWidth;
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
  ];

  for (let i = 0; i < HOUR_COUNT; i++) {
    const x = hourTickX(i, colWidth);
    parts.push(
      `<text x="${x}" y="${HEADER_HEIGHT / 2 + 4}" fill="${THEME.textMuted}" font-size="12" font-weight="500" text-anchor="middle" font-family="${FONT}">${formatHourLabel(HOUR_START + i)}</text>`
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

function buildKebabIcon(x: number, y: number, size: number): string {
  const scale = size / 20;
  return `<g transform="translate(${x - size / 2}, ${y - size / 2}) scale(${scale})" fill="${THEME.textMuted}">
    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
  </g>`;
}

function buildActivityCard(bounds: CardBounds, title: string, subtitle: string): string[] {
  const { x, y, width, height } = bounds;
  const radius = Math.min(CARD_RADIUS, height / 2 - 1, width / 2 - 1);
  const clipId = `card-${Math.round(x)}-${Math.round(y)}`;
  const cy = y + height / 2;
  const textX = x + CARD_INNER_PAD;
  const menuX = x + width - CARD_INNER_PAD - MENU_SIZE / 2;

  return [
    `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></clipPath>`,
    `<g filter="url(#cardShadow)" clip-path="url(#${clipId})">`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${THEME.card}"/>`,
    `</g>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="none" stroke="${THEME.border}" stroke-width="1"/>`,
    `<text x="${textX}" y="${cy - 3}" fill="${THEME.white}" font-size="14" font-weight="600" font-family="${FONT}">${escapeXml(title)}</text>`,
    `<text x="${textX}" y="${cy + 14}" fill="${THEME.textMuted}" font-size="12" font-family="${FONT}">${escapeXml(subtitle)}</text>`,
    buildKebabIcon(menuX, cy, MENU_SIZE),
  ];
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
    return buildActivityCard(bounds, card.title, card.subtitle);
  });
}

function buildRow(rowIndex: number, colWidth: number): string[] {
  const y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
  return [
    `<rect x="0" y="${y}" width="${WIDTH}" height="${ROW_HEIGHT}" fill="${THEME.dark}"/>`,
    ...buildHourGridLines(y, ROW_HEIGHT, colWidth),
    ...buildHardcodedCards(rowIndex, y, colWidth),
  ];
}

function buildTimelineSvg(timetable: GuildTimetable): string {
  const rowCount = Math.max(timetable.members.length, 1);
  const colWidth = WIDTH / HOUR_COUNT;
  const height = HEADER_HEIGHT + rowCount * ROW_HEIGHT;

  const parts: string[] = [
    buildDefs(),
    `<rect width="100%" height="100%" fill="${THEME.dark}"/>`,
    ...buildHourHeader(colWidth),
  ];

  for (let i = 0; i < rowCount; i++) {
    parts.push(...buildRow(i, colWidth));
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
