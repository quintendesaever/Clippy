import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import sharp from "sharp";
import {
  colorForTypeBadge,
  HOUR_END,
  HOUR_START,
  shortLocation,
  truncateText,
} from "./eventUtils.js";
import type { GuildTimetable, TimetableEvent, TimetableMember } from "./types.js";

const WIDTH = 900;
const LABEL_WIDTH = 88;
const PAD_LEFT = 16;
const PAD_RIGHT = 20;
const CHART_X = LABEL_WIDTH + PAD_LEFT;
const CHART_WIDTH = WIDTH - CHART_X - PAD_RIGHT;
const ROW_HEIGHT = 58;
const HEADER_HEIGHT = 48;
const HOUR_AXIS_HEIGHT = 32;
const LEGEND_HEIGHT = 28;
const ROW_GAP = 0;

const BG_CANVAS = "#0b0c10";
const BG_TRACK = "#12141a";
const BG_CARD = "#1a1d24";
const STROKE_CARD = "#2a2d35";
const STROKE_ROW = "#1f2228";
const TEXT_PRIMARY = "#f4f4f5";
const TEXT_MUTED = "#71717a";
const TEXT_LEGEND = "#52525b";
const ACCENT_NOW = "#8b5cf6";
const PILL_TODAY = "#6d28d9";
const PILL_DEFAULT = "#1a1d24";

const AVATAR_RADIUS = 16;
const CARD_PADDING = 8;
const CARD_RX = 10;
const ACCENT_WIDTH = 4;

function dayKeyInTimezone(date: Date, timezone: string): string {
  const zoned = toZonedTime(date, timezone);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDayTitle(dayKey: string, timezone: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = toZonedTime(new Date(year, month - 1, day, 12, 0, 0), timezone);
  return format(date, "EEEE d MMMM yyyy");
}

function eventXAndWidth(
  event: TimetableEvent,
  timezone: string
): { x: number; w: number } {
  if (event.allDay) {
    return { x: 0, w: CHART_WIDTH };
  }
  const start = toZonedTime(event.start, timezone);
  const end = toZonedTime(event.end, timezone);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;
  const clampedStart = Math.max(HOUR_START, startHour);
  const clampedEnd = Math.min(HOUR_END, Math.max(endHour, clampedStart + 0.25));
  const x = ((clampedStart - HOUR_START) / (HOUR_END - HOUR_START)) * CHART_WIDTH;
  const w = ((clampedEnd - clampedStart) / (HOUR_END - HOUR_START)) * CHART_WIDTH;
  return { x: Math.max(0, x), w: Math.max(24, w) };
}

function accentColor(event: TimetableEvent, member: TimetableMember): string {
  const badge = event.typeBadges[0];
  return badge ? colorForTypeBadge(badge) : member.color;
}

function hourToX(hour: number): number {
  return CHART_X + ((hour - HOUR_START) / (HOUR_END - HOUR_START)) * CHART_WIDTH;
}

type MemberRow = {
  member: TimetableMember;
  events: TimetableEvent[];
};

function buildHourGrid(chartTop: number, chartBottom: number): string[] {
  const parts: string[] = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) {
    const x = hourToX(h);
    parts.push(
      `<line x1="${x}" y1="${chartTop}" x2="${x}" y2="${chartBottom}" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>`
    );
    if ((h - HOUR_START) % 2 === 0) {
      parts.push(
        `<text x="${x}" y="${chartTop - 10}" fill="${TEXT_MUTED}" font-size="11" text-anchor="middle" font-family="system-ui,sans-serif">${String(h).padStart(2, "0")}</text>`
      );
    }
  }
  return parts;
}

function buildNowIndicator(
  dayKey: string,
  timezone: string,
  chartTop: number,
  chartBottom: number
): string[] {
  const todayKey = dayKeyInTimezone(new Date(), timezone);
  if (dayKey !== todayKey) return [];

  const now = toZonedTime(new Date(), timezone);
  const nowHour = now.getHours() + now.getMinutes() / 60;
  if (nowHour < HOUR_START || nowHour > HOUR_END) return [];

  const x = hourToX(nowHour);
  return [
    `<circle cx="${x}" cy="${chartTop - 18}" r="4" fill="${ACCENT_NOW}"/>`,
    `<line x1="${x}" y1="${chartTop - 14}" x2="${x}" y2="${chartBottom}" stroke="${ACCENT_NOW}" stroke-width="2" stroke-opacity="0.85"/>`,
  ];
}

function buildHeader(dayKey: string, timezone: string, dayTitle: string): string {
  const isToday = dayKey === dayKeyInTimezone(new Date(), timezone);
  const pillFill = isToday ? PILL_TODAY : PILL_DEFAULT;
  const pillStroke = isToday ? PILL_TODAY : STROKE_CARD;
  const titleText = `Rooster — ${dayTitle}`;
  const approxWidth = Math.min(titleText.length * 8 + 32, WIDTH - PAD_LEFT * 2);

  return [
    `<rect x="${PAD_LEFT}" y="10" width="${approxWidth}" height="28" rx="14" fill="${pillFill}" stroke="${pillStroke}" stroke-width="1"/>`,
    `<text x="${PAD_LEFT + 16}" y="29" fill="${TEXT_PRIMARY}" font-size="13" font-weight="600" font-family="system-ui,sans-serif">${escapeXml(titleText)}</text>`,
  ].join("\n  ");
}

function buildEventBlock(
  event: TimetableEvent,
  member: TimetableMember,
  laneY: number,
  timezone: string
): string[] {
  const { x, w } = eventXAndWidth(event, timezone);
  const blockX = CHART_X + x + 3;
  const blockW = Math.min(w - 6, CHART_WIDTH - x - 6);
  if (blockW < 20) return [];

  const blockY = laneY + CARD_PADDING;
  const blockH = ROW_HEIGHT - CARD_PADDING * 2;
  const accent = accentColor(event, member);
  const badge = event.typeBadges[0];
  const showChip = badge && blockW >= 90;
  const chipWidth = showChip ? 22 : 0;
  const textMaxW = blockW - ACCENT_WIDTH - 16 - chipWidth;

  const title = truncateText(event.title, textMaxW < 60 ? 10 : textMaxW < 100 ? 16 : 26);
  const loc = shortLocation(event.location);
  const showLoc = loc && blockW >= 70;
  const textX = blockX + ACCENT_WIDTH + 10;
  const titleY = showLoc ? blockY + 22 : blockY + blockH / 2 + 5;

  const parts: string[] = [
    `<rect x="${blockX}" y="${blockY}" width="${blockW}" height="${blockH}" fill="${BG_CARD}" stroke="${STROKE_CARD}" stroke-width="1" rx="${CARD_RX}"/>`,
    `<rect x="${blockX}" y="${blockY + 4}" width="${ACCENT_WIDTH}" height="${blockH - 8}" fill="${accent}" rx="2"/>`,
    `<text x="${textX}" y="${titleY}" fill="${TEXT_PRIMARY}" font-size="13" font-weight="600" font-family="system-ui,sans-serif">${escapeXml(title)}</text>`,
  ];

  if (showLoc) {
    parts.push(
      `<text x="${textX}" y="${blockY + blockH - 10}" fill="${TEXT_MUTED}" font-size="10" font-family="system-ui,sans-serif">${escapeXml(loc)}</text>`
    );
  }

  if (showChip) {
    const chipX = blockX + blockW - chipWidth - 6;
    const chipY = blockY + blockH / 2 - 9;
    parts.push(
      `<rect x="${chipX}" y="${chipY}" width="${chipWidth}" height="18" fill="${accent}" fill-opacity="0.25" stroke="${accent}" stroke-opacity="0.5" stroke-width="1" rx="4"/>`,
      `<text x="${chipX + chipWidth / 2}" y="${chipY + 13}" fill="${TEXT_PRIMARY}" font-size="10" font-weight="600" text-anchor="middle" font-family="system-ui,sans-serif">${escapeXml(badge)}</text>`
    );
  }

  return parts;
}

function buildSwimlaneSvg(
  timetable: GuildTimetable,
  dayKey: string,
  rows: MemberRow[]
): string {
  const tz = timetable.guildTimezone;
  const dayTitle = formatDayTitle(dayKey, tz);
  const rowCount = rows.length;
  const chartTop = HEADER_HEIGHT + HOUR_AXIS_HEIGHT;
  const chartBottom = chartTop + rowCount * (ROW_HEIGHT + ROW_GAP);
  const height = chartBottom + LEGEND_HEIGHT + 20;

  const hourGrid = buildHourGrid(chartTop, chartBottom);
  const nowIndicator = buildNowIndicator(dayKey, tz, chartTop, chartBottom);
  const header = buildHeader(dayKey, tz, dayTitle);

  const memberRows: string[] = [];
  let rowY = chartTop;

  for (const { member, events } of rows) {
    const laneY = rowY;
    const avatarCx = CHART_X / 2;
    const avatarCy = laneY + ROW_HEIGHT / 2;

    memberRows.push(
      `<line x1="0" y1="${laneY}" x2="${WIDTH}" y2="${laneY}" stroke="${STROKE_ROW}" stroke-width="1"/>`,
      `<rect x="${CHART_X}" y="${laneY}" width="${CHART_WIDTH}" height="${ROW_HEIGHT}" fill="${BG_TRACK}"/>`,
      `<circle cx="${avatarCx}" cy="${avatarCy}" r="${AVATAR_RADIUS}" fill="${member.color}"/>`,
      `<text x="${avatarCx}" y="${avatarCy + 5}" fill="${TEXT_PRIMARY}" font-size="11" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif">${escapeXml(member.initials)}</text>`
    );

    for (const event of events) {
      memberRows.push(...buildEventBlock(event, member, laneY, tz));
    }

    rowY += ROW_HEIGHT + ROW_GAP;
  }

  memberRows.push(
    `<line x1="0" y1="${chartBottom}" x2="${WIDTH}" y2="${chartBottom}" stroke="${STROKE_ROW}" stroke-width="1"/>`
  );

  const legendY = height - 12;
  const legend = `<text x="${PAD_LEFT}" y="${legendY}" fill="${TEXT_LEGEND}" font-size="10" font-family="system-ui,sans-serif">H = Hoorcollege · P = Practicum · W = Werkcollege · Tijden in ${escapeXml(tz)}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <rect width="100%" height="100%" fill="${BG_CANVAS}"/>
  ${header}
  ${hourGrid.join("\n  ")}
  ${nowIndicator.join("\n  ")}
  ${memberRows.join("\n  ")}
  ${legend}
</svg>`;
}

export async function renderDaySwimlanePng(
  timetable: GuildTimetable,
  dayKey: string
): Promise<Buffer | null> {
  const dayEvents = timetable.eventsByDay.get(dayKey) ?? [];
  const eventsByMember = new Map<string, TimetableEvent[]>();
  for (const event of dayEvents) {
    const bucket = eventsByMember.get(event.userId) ?? [];
    bucket.push(event);
    eventsByMember.set(event.userId, bucket);
  }

  const rows: MemberRow[] = timetable.members
    .filter((member) => (eventsByMember.get(member.userId)?.length ?? 0) > 0)
    .map((member) => ({
      member,
      events: eventsByMember.get(member.userId) ?? [],
    }));

  if (rows.length === 0) return null;

  const svg = buildSwimlaneSvg(timetable, dayKey, rows);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
