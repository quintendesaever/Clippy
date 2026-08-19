import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGuildId } from "../src/config.js";
import { renderTimetablePng } from "../src/calendar/timetableImage.js";
import {
  dayKeyInTimezone,
  getGuildTimetable,
  getGuildTimetableForDay,
} from "../src/calendar/timetableService.js";
import type { GuildTimetable } from "../src/calendar/types.js";

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function requestedDayKey(): string | null {
  const arg = process.argv.slice(2).find((value) => DAY_KEY_RE.test(value));
  return arg ?? null;
}

function pickDayKey(timetable: GuildTimetable, preferred: string | null): string {
  if (preferred) return preferred;

  const today = dayKeyInTimezone(new Date(), timetable.guildTimezone);
  const todayEvents = timetable.eventsByDay.get(today) ?? [];
  if (todayEvents.length > 0) return today;

  for (const [dayKey, events] of timetable.eventsByDay) {
    if (events.length > 0) return dayKey;
  }

  return today;
}

const requested = requestedDayKey();
const guildId = getGuildId();
const timetable = requested
  ? await getGuildTimetableForDay(guildId, requested)
  : await getGuildTimetable(guildId);
const dayKey = pickDayKey(timetable, requested);
const dayEvents = timetable.eventsByDay.get(dayKey) ?? [];
const png = await renderTimetablePng(timetable, dayKey);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "tmp");
const outPath = path.join(outDir, "timetable-preview.png");
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, png);

console.log(`day: ${dayKey}`);
console.log(`events: ${dayEvents.length}`);
console.log(`timezone: ${timetable.guildTimezone}`);
console.log(`output: ${outPath}`);
