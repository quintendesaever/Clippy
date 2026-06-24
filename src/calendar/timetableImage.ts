import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import sharp from "sharp";
import { HOUR_END, HOUR_START, shortLocation, truncateText } from "./eventUtils.js";
import type { GuildTimetable, TimetableEvent, TimetableMember } from "./types.js";

const WIDTH = 900;
const LABEL_WIDTH = 76;
const PAD_LEFT = 16;
const PAD_RIGHT = 20;
const CHART_X = LABEL_WIDTH + PAD_LEFT;
const CHART_WIDTH = WIDTH - CHART_X - PAD_RIGHT;
const ROW_HEIGHT = 52;
const TITLE_HEIGHT = 40;
const HOUR_AXIS_HEIGHT = 28;
const LEGEND_HEIGHT = 28;
const ROW_GAP = 4;

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

type MemberRow = {
  member: TimetableMember;
  events: TimetableEvent[];
};

function buildSwimlaneSvg(
  timetable: GuildTimetable,
  dayKey: string,
  rows: MemberRow[]
): string {
  const tz = timetable.guildTimezone;
  const dayTitle = formatDayTitle(dayKey, tz);
  const rowCount = rows.length;
  const height =
    TITLE_HEIGHT + HOUR_AXIS_HEIGHT + rowCount * (ROW_HEIGHT + ROW_GAP) + LEGEND_HEIGHT + 16;

  const hourTicks: string[] = [];
  for (let h = HOUR_START; h <= HOUR_END; h += 2) {
    const x = CHART_X + ((h - HOUR_START) / (HOUR_END - HOUR_START)) * CHART_WIDTH;
    hourTicks.push(
      `<text x="${x}" y="${TITLE_HEIGHT + 18}" fill="#a1a1aa" font-size="11" text-anchor="middle" font-family="system-ui,sans-serif">${String(h).padStart(2, "0")}</text>`
    );
    hourTicks.push(
      `<line x1="${x}" y1="${TITLE_HEIGHT + HOUR_AXIS_HEIGHT}" x2="${x}" y2="${height - LEGEND_HEIGHT - 8}" stroke="#2c2e33" stroke-width="1"/>`
    );
  }

  const memberRows: string[] = [];
  let rowY = TITLE_HEIGHT + HOUR_AXIS_HEIGHT;

  for (const { member, events } of rows) {
    const color = member.color;
    const laneY = rowY;
    memberRows.push(
      `<rect x="0" y="${laneY}" width="${LABEL_WIDTH}" height="${ROW_HEIGHT}" fill="#27272a"/>`,
      `<rect x="0" y="${laneY}" width="4" height="${ROW_HEIGHT}" fill="${color}"/>`,
      `<text x="12" y="${laneY + ROW_HEIGHT / 2 + 5}" fill="#fafafa" font-size="13" font-weight="600" font-family="system-ui,sans-serif">${escapeXml(member.initials)}</text>`,
      `<rect x="${CHART_X}" y="${laneY}" width="${CHART_WIDTH}" height="${ROW_HEIGHT}" fill="#18181b" rx="4"/>`
    );

    for (const event of events) {
      const { x, w } = eventXAndWidth(event, tz);
      const blockX = CHART_X + x + 2;
      const blockW = Math.min(w - 4, CHART_WIDTH - x - 4);
      if (blockW < 20) continue;

      const title = truncateText(event.title, blockW < 80 ? 12 : blockW < 140 ? 18 : 28);
      const loc = shortLocation(event.location);
      const textColor = "#1a1b1e";
      const showLoc = loc && blockW >= 70;

      memberRows.push(
        `<rect x="${blockX}" y="${laneY + 6}" width="${blockW}" height="${ROW_HEIGHT - 12}" fill="${color}" rx="6"/>`,
        `<text x="${blockX + 8}" y="${laneY + (showLoc ? 22 : ROW_HEIGHT / 2 + 4)}" fill="${textColor}" font-size="12" font-weight="600" font-family="system-ui,sans-serif">${escapeXml(title)}</text>`
      );
      if (showLoc) {
        memberRows.push(
          `<text x="${blockX + 8}" y="${laneY + 38}" fill="${textColor}" font-size="10" opacity="0.85" font-family="system-ui,sans-serif">${escapeXml(loc)}</text>`
        );
      }
    }

    rowY += ROW_HEIGHT + ROW_GAP;
  }

  const legendY = height - 20;
  const legend =
    `<text x="${PAD_LEFT}" y="${legendY}" fill="#71717a" font-size="11" font-family="system-ui,sans-serif">H = Hoorcollege · P = Practicum · W = Werkcollege · Tijden in ${escapeXml(tz)}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <rect width="100%" height="100%" fill="#1e1f22"/>
  <text x="${PAD_LEFT}" y="28" fill="#fafafa" font-size="16" font-weight="600" font-family="system-ui,sans-serif">Rooster — ${escapeXml(dayTitle)}</text>
  ${hourTicks.join("\n  ")}
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