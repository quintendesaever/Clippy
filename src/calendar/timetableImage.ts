import sharp from "sharp";
import type { GuildTimetable, TimetableMember } from "./types.js";

const WIDTH = 700;
const HOUR_START = 8;
const HOUR_END = 20;
const HOUR_COUNT = HOUR_END - HOUR_START;
const MEMBER_LABEL_WIDTH = 72;
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 64;
const FONT = "system-ui,sans-serif";

const CARD_RADIUS = 14;
const CARD_MARGIN_Y = 6;
const CARD_INNER_PAD = 12;
const AVATAR_R = 14;
const AVATAR_OVERLAP = 10;

/** Discord client dark theme — https://discord.com/branding */
const DISCORD = {
  backgroundPrimary: "#313338",
  backgroundSecondary: "#2b2d31",
  backgroundTertiary: "#1e1f22",
  backgroundAccent: "#4e5058",
  backgroundElevated: "#232428",
  textNormal: "#dbdee1",
  textMuted: "#949ba4",
  headerPrimary: "#f2f3f5",
  headerSecondary: "#b5bac1",
  blurple: "#5865f2",
} as const;

const BG_CANVAS = DISCORD.backgroundSecondary;
const GRID_LINE = DISCORD.backgroundAccent;

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

function buildHourHeader(colWidth: number): string[] {
  const parts: string[] = [
    `<rect x="0" y="0" width="${WIDTH}" height="${HEADER_HEIGHT}" fill="${DISCORD.backgroundPrimary}"/>`,
    `<line x1="${MEMBER_LABEL_WIDTH}" y1="0" x2="${MEMBER_LABEL_WIDTH}" y2="${HEADER_HEIGHT}" stroke="${GRID_LINE}" stroke-width="1"/>`,
  ];

  for (let i = 0; i < HOUR_COUNT; i++) {
    const x = hourTickX(i, colWidth);
    const label = formatHourLabel(HOUR_START + i);
    parts.push(
      `<text x="${x}" y="${HEADER_HEIGHT / 2 + 4}" fill="${DISCORD.textMuted}" font-size="11" text-anchor="middle" font-family="${FONT}">${label}</text>`
    );
  }

  return parts;
}

function buildHourGridLines(y: number, height: number, colWidth: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i <= HOUR_COUNT; i++) {
    const x = hourTickX(i, colWidth);
    parts.push(
      `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + height}" stroke="${GRID_LINE}" stroke-width="1"/>`
    );
  }
  return parts;
}

function buildKebabMenu(x: number, cy: number): string[] {
  const dotR = 2;
  const gap = 5;
  return [-gap, 0, gap].map(
    (offset) =>
      `<circle cx="${x}" cy="${cy + offset}" r="${dotR}" fill="${DISCORD.textMuted}"/>`
  );
}

function buildActivityCard(
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  subtitle: string,
  avatarColors: [string, string]
): string[] {
  const cy = y + height / 2;
  const avatar1Cx = x + CARD_INNER_PAD + AVATAR_R;
  const avatar2Cx = avatar1Cx + AVATAR_R * 2 - AVATAR_OVERLAP;
  const textX = avatar2Cx + AVATAR_R + 10;
  const menuX = x + width - CARD_INNER_PAD;

  return [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${CARD_RADIUS}" ry="${CARD_RADIUS}" fill="${DISCORD.backgroundElevated}"/>`,
    `<circle cx="${avatar2Cx}" cy="${cy}" r="${AVATAR_R}" fill="${avatarColors[1]}"/>`,
    `<circle cx="${avatar1Cx}" cy="${cy}" r="${AVATAR_R}" fill="${avatarColors[0]}"/>`,
    `<text x="${textX}" y="${cy - 2}" fill="${DISCORD.headerPrimary}" font-size="13" font-weight="600" font-family="${FONT}">${escapeXml(title)}</text>`,
    `<text x="${textX}" y="${cy + 14}" fill="${DISCORD.textMuted}" font-size="11" font-family="${FONT}">${escapeXml(subtitle)}</text>`,
    ...buildKebabMenu(menuX, cy),
  ];
}

function buildHardcodedActivityCard(rowY: number, colWidth: number): string[] {
  const cardX = timeToX(10, 0, colWidth);
  const cardWidth = timeToX(11, 30, colWidth) - cardX;
  const cardY = rowY + CARD_MARGIN_Y;
  const cardHeight = ROW_HEIGHT - CARD_MARGIN_Y * 2;

  return buildActivityCard(
    cardX,
    cardY,
    cardWidth,
    cardHeight,
    "Lineaire Algebra",
    "Hoorcollege · AUD.D",
    [DISCORD.blurple, "#57f287"]
  );
}

function buildMemberRow(member: TimetableMember, rowIndex: number, trackWidth: number, colWidth: number): string[] {
  const y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
  const parts: string[] = [
    `<rect x="0" y="${y}" width="${MEMBER_LABEL_WIDTH}" height="${ROW_HEIGHT}" fill="${DISCORD.backgroundPrimary}"/>`,
    `<rect x="0" y="${y}" width="4" height="${ROW_HEIGHT}" fill="${member.color}"/>`,
    `<text x="12" y="${y + ROW_HEIGHT / 2 + 4}" fill="${DISCORD.textNormal}" font-size="13" font-weight="600" font-family="${FONT}">${escapeXml(member.initials)}</text>`,
    `<rect x="${MEMBER_LABEL_WIDTH}" y="${y}" width="${trackWidth}" height="${ROW_HEIGHT}" fill="${DISCORD.backgroundTertiary}"/>`,
    ...buildHourGridLines(y, ROW_HEIGHT, colWidth),
  ];

  if (rowIndex === 0) {
    parts.push(...buildHardcodedActivityCard(y, colWidth));
  }

  return parts;
}

function buildTimelineSvg(timetable: GuildTimetable): string {
  const members = timetable.members;
  const rowCount = Math.max(members.length, 1);
  const trackWidth = WIDTH - MEMBER_LABEL_WIDTH;
  const colWidth = trackWidth / HOUR_COUNT;
  const height = HEADER_HEIGHT + rowCount * ROW_HEIGHT;

  const parts: string[] = [
    `<rect width="100%" height="100%" fill="${BG_CANVAS}"/>`,
    ...buildHourHeader(colWidth),
  ];

  if (members.length === 0) {
    const y = HEADER_HEIGHT;
    parts.push(
      `<rect x="${MEMBER_LABEL_WIDTH}" y="${y}" width="${trackWidth}" height="${ROW_HEIGHT}" fill="${DISCORD.backgroundTertiary}"/>`,
      ...buildHourGridLines(y, ROW_HEIGHT, colWidth),
      ...buildHardcodedActivityCard(y, colWidth)
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
