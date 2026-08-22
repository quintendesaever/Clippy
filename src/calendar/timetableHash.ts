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
}): string {
  if (options.preferToday || !options.previouslySelected) {
    return options.todayKey;
  }
  if (!options.weekKeys.includes(options.previouslySelected)) {
    return options.todayKey;
  }
  if (options.previouslySelected < options.todayKey) {
    return options.todayKey;
  }
  return options.previouslySelected;
}
