import { createHash } from "node:crypto";
import { getWeekMondayKey } from "../../shared/timetable/dates.js";
import type { GuildTimetable } from "./types.js";

export function hashGuildTimetable(timetable: GuildTimetable, rendererVersion: number): string {
  const members = [...timetable.members]
    .map((member) => ({
      userId: member.userId,
      initials: member.initials,
      error: Boolean(member.error),
    }))
    .sort((a, b) => a.userId.localeCompare(b.userId));

  const events = [...timetable.events]
    .map((event) => ({
      userId: event.userId,
      title: event.title,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      allDay: event.allDay,
      typeBadges: [...event.typeBadges].sort(),
      source: event.source,
      participantIds: [...(event.participantIds ?? [])].sort(),
    }))
    .sort((a, b) => {
      const start = a.start.localeCompare(b.start);
      if (start !== 0) return start;
      const user = a.userId.localeCompare(b.userId);
      if (user !== 0) return user;
      return a.title.localeCompare(b.title);
    });

  const payload = {
    rendererVersion,
    timezone: timetable.guildTimezone,
    weekMonday: getWeekMondayKey(timetable.rangeStart, timetable.guildTimezone),
    members,
    events,
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function resolveSelectedDay(options: {
  todayKey: string;
  weekKeys: readonly string[];
  previouslySelected?: string;
  preferToday: boolean;
  /** Days that have events (any week). Used to skip empty days on auto-select. */
  busyDayKeys?: readonly string[];
}): string {
  const autoDay = (): string => {
    const busy = options.busyDayKeys ?? [];
    if (busy.length === 0) return options.todayKey;
    const nextBusy = busy.find((key) => key >= options.todayKey);
    return nextBusy ?? options.todayKey;
  };

  if (options.preferToday || !options.previouslySelected) {
    return autoDay();
  }
  if (!options.weekKeys.includes(options.previouslySelected)) {
    return autoDay();
  }
  if (options.previouslySelected < options.todayKey) {
    return autoDay();
  }
  return options.previouslySelected;
}

/** True when the loaded week has no events on or after today (may need next week). */
export function needsNextWeekForActiveDay(
  todayKey: string,
  busyDayKeys: readonly string[]
): boolean {
  return !busyDayKeys.some((key) => key >= todayKey);
}
