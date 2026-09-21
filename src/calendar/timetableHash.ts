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

/** In-memory Discord panel day button override. Restarts and expiry return to auto. */
export const TIMETABLE_DAY_OVERRIDE_MS = 5 * 60 * 1000;

export function isDayOverrideActive(overrideUntil: number | undefined, now: number): boolean {
  return overrideUntil != null && now < overrideUntil;
}

export function resolveSelectedDay(options: {
  todayKey: string;
  weekKeys: readonly string[];
  previouslySelected?: string;
  preferToday: boolean;
  /** Days that have events (any week). Used to skip empty days on auto-select. */
  busyDayKeys?: readonly string[];
  now?: number;
  overrideUntil?: number;
}): string {
  const autoDay = (): string => {
    const busy = options.busyDayKeys ?? [];
    if (busy.length === 0) return options.todayKey;
    const nextBusy = busy.find((key) => key >= options.todayKey);
    return nextBusy ?? options.todayKey;
  };

  const now = options.now ?? 0;
  if (
    options.previouslySelected &&
    isDayOverrideActive(options.overrideUntil, now) &&
    options.weekKeys.includes(options.previouslySelected)
  ) {
    return options.previouslySelected;
  }

  return autoDay();
}

export function timetablePanelNeedsUpdate(options: {
  startup?: boolean;
  weekChanged: boolean;
  dayChanged: boolean;
  needsValidation: boolean;
  now: number;
  selectedDayKey?: string;
  overrideUntil?: number;
  autoDayKey: string;
  needsNextWeek: boolean;
}): boolean {
  if (options.startup || options.weekChanged || options.dayChanged || options.needsValidation) {
    return true;
  }
  if (isDayOverrideActive(options.overrideUntil, options.now)) {
    return false;
  }
  if (options.needsNextWeek) return true;
  return options.selectedDayKey !== options.autoDayKey;
}

/** True when the loaded week has no events on or after today (may need next week). */
export function needsNextWeekForActiveDay(
  todayKey: string,
  busyDayKeys: readonly string[]
): boolean {
  return !busyDayKeys.some((key) => key >= todayKey);
}
