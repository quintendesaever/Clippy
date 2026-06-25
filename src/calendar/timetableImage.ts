import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import sharp from "sharp";
import { shortLocation, truncateText } from "./eventUtils.js";
import type { GuildTimetable, TimetableEvent } from "./types.js";

const WIDTH = 700;
const PAD = 16;
const LINE_HEIGHT = 22;
const LOCATION_INDENT = 108;

const BG_CANVAS = "#0b0c10";
const TEXT_PRIMARY = "#f4f4f5";
const TEXT_MUTED = "#71717a";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function memberColor(timetable: GuildTimetable, event: TimetableEvent): string {
  return timetable.members.find((m) => m.userId === event.userId)?.color ?? "#a1a1aa";
}

function formatEventTime(event: TimetableEvent, timezone: string): string {
  if (event.allDay) return "Hele dag";
  const start = toZonedTime(event.start, timezone);
  const end = toZonedTime(event.end, timezone);
  return `${format(start, "HH:mm")}–${format(end, "HH:mm")}`;
}

function buildEventLines(
  events: TimetableEvent[],
  timetable: GuildTimetable,
  timezone: string
): { lines: string[]; lineCount: number } {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const svgLines: string[] = [];
  let lineCount = 0;

  for (const event of sorted) {
    const y = PAD + lineCount * LINE_HEIGHT + 14;
    const time = formatEventTime(event, timezone);
    const initials = event.initials;
    const title = truncateText(event.rawTitle || event.title, 72);
    const color = memberColor(timetable, event);
    const loc = shortLocation(event.location);

    svgLines.push(
      `<text x="${PAD}" y="${y}" fill="${TEXT_MUTED}" font-size="12" font-family="system-ui,sans-serif">${escapeXml(time)}</text>`,
      `<text x="${PAD + 72}" y="${y}" fill="${color}" font-size="12" font-weight="600" font-family="system-ui,sans-serif">${escapeXml(initials)}</text>`,
      `<text x="${PAD + 96}" y="${y}" fill="${TEXT_PRIMARY}" font-size="12" font-family="system-ui,sans-serif">${escapeXml(title)}</text>`
    );
    lineCount++;

    if (loc) {
      const locY = PAD + lineCount * LINE_HEIGHT + 14;
      svgLines.push(
        `<text x="${PAD + LOCATION_INDENT}" y="${locY}" fill="${TEXT_MUTED}" font-size="11" font-family="system-ui,sans-serif">${escapeXml(loc)}</text>`
      );
      lineCount++;
    }
  }

  return { lines: svgLines, lineCount };
}

function buildListSvg(timetable: GuildTimetable, dayKey: string): string {
  const tz = timetable.guildTimezone;
  const dayEvents = timetable.eventsByDay.get(dayKey) ?? [];

  if (dayEvents.length === 0) {
    const height = PAD * 2 + LINE_HEIGHT;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <rect width="100%" height="100%" fill="${BG_CANVAS}"/>
  <text x="${WIDTH / 2}" y="${PAD + 14}" fill="${TEXT_MUTED}" font-size="13" text-anchor="middle" font-family="system-ui,sans-serif">Geen lessen gepland op deze dag</text>
</svg>`;
  }

  const { lines, lineCount } = buildEventLines(dayEvents, timetable, tz);
  const height = PAD * 2 + lineCount * LINE_HEIGHT;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <rect width="100%" height="100%" fill="${BG_CANVAS}"/>
  ${lines.join("\n  ")}
</svg>`;
}

export async function renderTimetablePng(
  timetable: GuildTimetable,
  dayKey: string
): Promise<Buffer> {
  const svg = buildListSvg(timetable, dayKey);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
