import sharp from "sharp";
import { truncateText } from "./eventUtils.js";
import type { GuildTimetable, TimetableMember } from "./types.js";

const WIDTH = 700;
const HOUR_START = 8;
const HOUR_END = 20;
const HOUR_COUNT = HOUR_END - HOUR_START;
const MEMBER_LABEL_WIDTH = 72;
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 72;
const FONT = "system-ui,sans-serif";

const CARD_MARGIN_Y = 4;
const CARD_INNER_PAD = 10;
const AVATAR_R = 15;
const AVATAR_OVERLAP = 10;

/** Discord client dark theme — https://discord.com/branding */
const DISCORD = {
  backgroundPrimary: "#313338",
  backgroundSecondary: "#2b2d31",
  backgroundTertiary: "#1e1f22",
  backgroundAccent: "#4e5058",
  textNormal: "#dbdee1",
  textMuted: "#949ba4",
  headerPrimary: "#f2f3f5",
  headerSecondary: "#b5bac1",
  blurple: "#5865f2",
} as const;

const BG_CANVAS = DISCORD.backgroundSecondary;
const GRID_LINE = DISCORD.backgroundAccent;
const CARD_FILL = DISCORD.backgroundPrimary;
const CARD_BORDER = "#3f4147";

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
): { x: number; y: number; width: number; height: number } {
  const x = timeToX(startHour, startMinute, colWidth);
  const endX = timeToX(endHour, endMinute, colWidth);
  return {
    x,
    y: rowY + CARD_MARGIN_Y,
    width: Math.max(endX - x, 2),
    height: ROW_HEIGHT - CARD_MARGIN_Y * 2,
  };
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
  const dotR = 2.5;
  const gap = 5;
  return [-gap, 0, gap].map(
    (offset) =>
      `<circle cx="${x}" cy="${cy + offset}" r="${dotR}" fill="${DISCORD.textMuted}"/>`
  );
}

function buildActivityCard(
  bounds: { x: number; y: number; width: number; height: number },
  title: string,
  subtitle: string,
  avatarColors: [string, string]
): string[] {
  const { x, y, width, height } = bounds;
  const radius = Math.min(12, height / 2 - 1, width / 2 - 1);
  const cy = y + height / 2;
  const showMenu = width >= 110;
  const showSubtitle = width >= 90;
  const showAvatars = width >= 48;
  const menuPad = showMenu ? 24 : CARD_INNER_PAD;

  let contentX = x + CARD_INNER_PAD;
  const parts: string[] = [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${CARD_FILL}" stroke="${CARD_BORDER}" stroke-width="1"/>`,
  ];

  if (showAvatars) {
    const avatar1Cx = contentX + AVATAR_R;
    const avatar2Cx = avatar1Cx + AVATAR_R * 2 - AVATAR_OVERLAP;
    contentX = avatar2Cx + AVATAR_R + 8;
    parts.push(
      `<circle cx="${avatar2Cx}" cy="${cy}" r="${AVATAR_R}" fill="${avatarColors[1]}"/>`,
      `<circle cx="${avatar1Cx}" cy="${cy}" r="${AVATAR_R}" fill="${avatarColors[0]}"/>`
    );
  }

  const textMaxWidth = Math.max(0, x + width - contentX - menuPad);
  const maxChars = Math.max(4, Math.floor(textMaxWidth / 7));
  const clippedTitle = truncateText(title, maxChars);
  const clippedSubtitle = truncateText(subtitle, maxChars);

  parts.push(
    `<text x="${contentX}" y="${showSubtitle ? cy - 2 : cy + 4}" fill="${DISCORD.headerPrimary}" font-size="13" font-weight="600" font-family="${FONT}">${escapeXml(clippedTitle)}</text>`
  );

  if (showSubtitle) {
    parts.push(
      `<text x="${contentX}" y="${cy + 14}" fill="${DISCORD.textMuted}" font-size="11" font-family="${FONT}">${escapeXml(clippedSubtitle)}</text>`
    );
  }

  if (showMenu) {
    parts.push(...buildKebabMenu(x + width - CARD_INNER_PAD, cy));
  }

  return parts;
}

function buildHardcodedActivityCard(rowY: number, colWidth: number): string[] {
  const bounds = cardBounds(rowY, 10, 0, 11, 30, colWidth);
  return buildActivityCard(
    bounds,
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
