import type { GuildTimetable, TimetableRange } from "./types.js";
import { buildDaySwimlaneView, getDefaultDayKey } from "./timetableViews.js";

export async function buildTimetableEmbeds(timetable: GuildTimetable, range: TimetableRange) {
  const dayKey = getDefaultDayKey(timetable);
  return buildDaySwimlaneView(timetable, dayKey, { showWeekNav: range === "week" });
}
