import { fromZonedTime } from "date-fns-tz";
import {
  dayKeyInTimezone,
  getWeekDayKeys as calendarWeekDayKeys,
  getWeekMondayKey,
} from "../../shared/timetable/dates.js";
import { getGuildTimezone } from "../stats/helpers.js";
import { getGuildActivitiesInRange } from "./activities.js";
import { colorForInitials } from "./eventUtils.js";
import { fetchIcsContent } from "./icsFetcher.js";
import { parseIcsEvents } from "./icsParser.js";
import { getGuildMemberCalendars } from "./memberCalendars.js";
import type {
  GuildTimetable,
  MemberCalendar,
  MemberLoadResult,
  TimetableEvent,
  TimetableMember,
} from "./types.js";

export { dayKeyInTimezone, getWeekMondayKey } from "../../shared/timetable/dates.js";

function groupEventsByDay(events: TimetableEvent[], timezone: string): Map<string, TimetableEvent[]> {
  const grouped = new Map<string, TimetableEvent[]>();

  for (const event of events) {
    const key = dayKeyInTimezone(event.start, timezone);
    const bucket = grouped.get(key) ?? [];
    bucket.push(event);
    grouped.set(key, bucket);
  }

  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  return new Map([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function groupEventsByUser(events: TimetableEvent[]): Map<string, TimetableEvent[]> {
  const grouped = new Map<string, TimetableEvent[]>();
  for (const event of events) {
    const bucket = grouped.get(event.userId) ?? [];
    bucket.push(event);
    grouped.set(event.userId, bucket);
  }
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.start.getTime() - b.start.getTime());
  }
  return grouped;
}

function buildMembers(memberResults: MemberLoadResult[]): TimetableMember[] {
  return memberResults.map((result) => ({
    userId: result.userId,
    initials: result.initials,
    color: colorForInitials(result.initials),
    error: result.error,
  }));
}

export type GuildTimetableOptions = {
  skipIcsCache?: boolean;
};

async function loadMemberEvents(
  member: MemberCalendar,
  rangeStart: Date,
  rangeEnd: Date,
  skipIcsCache?: boolean
): Promise<MemberLoadResult> {
  try {
    const content = await fetchIcsContent(member.ics_url, { skipCache: skipIcsCache });
    const events = parseIcsEvents(content, member.user_id, member.initials, rangeStart, rangeEnd);
    return { userId: member.user_id, initials: member.initials, events };
  } catch (err) {
    console.error(`timetable: failed to load calendar for ${member.initials}:`, err);
    return {
      userId: member.user_id,
      initials: member.initials,
      events: [],
      error: `Kalender van ${member.initials} kon niet geladen worden.`,
    };
  }
}

function buildGuildTimetable(
  memberResults: MemberLoadResult[],
  guildTimezone: string,
  rangeStart: Date,
  rangeEnd: Date,
  activityEvents: TimetableEvent[] = []
): GuildTimetable {
  const icsEvents = memberResults.flatMap((result) => result.events);
  // Activities are shared (not member-filterable); keep them out of eventsByUser.
  const events = [...icsEvents, ...activityEvents].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  return {
    events,
    eventsByDay: groupEventsByDay(events, guildTimezone),
    eventsByUser: groupEventsByUser(icsEvents),
    memberResults,
    members: buildMembers(memberResults),
    guildTimezone,
    rangeStart,
    rangeEnd,
  };
}

export async function getGuildTimetable(
  guildId: string,
  options?: GuildTimetableOptions
): Promise<GuildTimetable> {
  const guildTimezone = await getGuildTimezone(guildId);
  const mondayKey = getWeekMondayKey(new Date(), guildTimezone);
  const dayKeys = calendarWeekDayKeys(mondayKey);
  const sundayKey = dayKeys[6]!;
  return getGuildTimetableForDates(guildId, mondayKey, sundayKey, options);
}

export async function getGuildTimetableForDates(
  guildId: string,
  fromDate: string,
  toDate: string,
  options?: GuildTimetableOptions
): Promise<GuildTimetable> {
  const guildTimezone = await getGuildTimezone(guildId);
  const members = await getGuildMemberCalendars(guildId);
  const [fromY, fromM, fromD] = fromDate.split("-").map(Number);
  const [toY, toM, toD] = toDate.split("-").map(Number);

  const rangeStart = fromZonedTime(new Date(fromY, fromM - 1, fromD, 0, 0, 0, 0), guildTimezone);
  const rangeEnd = fromZonedTime(new Date(toY, toM - 1, toD, 23, 59, 59, 999), guildTimezone);

  const [memberResults, activityEvents] = await Promise.all([
    Promise.all(
      members.map((member) =>
        loadMemberEvents(member, rangeStart, rangeEnd, options?.skipIcsCache)
      )
    ),
    getGuildActivitiesInRange(guildId, rangeStart, rangeEnd),
  ]);
  return buildGuildTimetable(memberResults, guildTimezone, rangeStart, rangeEnd, activityEvents);
}

export async function getGuildTimetableForDay(
  guildId: string,
  dayKey: string,
  options?: GuildTimetableOptions
): Promise<GuildTimetable> {
  return getGuildTimetableForDates(guildId, dayKey, dayKey, options);
}

export function getWeekDayKeys(_weekStartDayKey: string, _timezone?: string): string[] {
  return calendarWeekDayKeys(_weekStartDayKey);
}
