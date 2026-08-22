import { getWeekDayKeys, getWeekMondayKey } from "../../shared/timetable/dates.js";
import { withoutEmptyWeekendDays } from "../../shared/timetable/weekDays.js";
import type { GuildTimetable } from "./types.js";

export function getVisibleTimetableDayKeys(timetable: GuildTimetable): string[] {
  const weekMonday = getWeekMondayKey(timetable.rangeStart, timetable.guildTimezone);
  const dayKeys = getWeekDayKeys(weekMonday);
  const showDay = (dayKey: string) => (timetable.eventsByDay.get(dayKey) ?? []).length > 0;
  return withoutEmptyWeekendDays(dayKeys, showDay);
}
