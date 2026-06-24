import { addDays, endOfDay, startOfWeek } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getGuildTimezone, getTodayInGuildTz } from "../stats/helpers.js";
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
  TimetableRange,
} from "./types.js";

export function dayKeyInTimezone(date: Date, timezone: string): string {
  const zoned = toZonedTime(date, timezone);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeBounds(range: TimetableRange, timezone: string): { rangeStart: Date; rangeEnd: Date } {
  const today = getTodayInGuildTz(timezone);
  const [year, month, day] = today.split("-").map(Number);
  const startLocal = fromZonedTime(new Date(year, month - 1, day, 0, 0, 0, 0), timezone);

  if (range === "today") {
    const endLocal = fromZonedTime(new Date(year, month - 1, day, 23, 59, 59, 999), timezone);
    return { rangeStart: startLocal, rangeEnd: endLocal };
  }

  const zonedEnd = addDays(toZonedTime(startLocal, timezone), 6);
  const endLocal = fromZonedTime(endOfDay(zonedEnd), timezone);
  return { rangeStart: startLocal, rangeEnd: endLocal };
}

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

async function loadMemberEvents(
  member: MemberCalendar,
  rangeStart: Date,
  rangeEnd: Date
): Promise<MemberLoadResult> {
  try {
    const content = await fetchIcsContent(member.ics_url);
    const events = parseIcsEvents(content, member.user_id, member.initials, rangeStart, rangeEnd);
    return { userId: member.user_id, initials: member.initials, events };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { userId: member.user_id, initials: member.initials, events: [], error: message };
  }
}

function buildGuildTimetable(
  memberResults: MemberLoadResult[],
  guildTimezone: string,
  rangeStart: Date,
  rangeEnd: Date
): GuildTimetable {
  const events = memberResults
    .flatMap((result) => result.events)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return {
    events,
    eventsByDay: groupEventsByDay(events, guildTimezone),
    eventsByUser: groupEventsByUser(events),
    memberResults,
    members: buildMembers(memberResults),
    guildTimezone,
    rangeStart,
    rangeEnd,
  };
}

export async function getGuildTimetable(guildId: string, range: TimetableRange): Promise<GuildTimetable> {
  const guildTimezone = await getGuildTimezone(guildId);
  const { rangeStart, rangeEnd } = rangeBounds(range, guildTimezone);
  const members = await getGuildMemberCalendars(guildId);
  const memberResults = await Promise.all(
    members.map((member) => loadMemberEvents(member, rangeStart, rangeEnd))
  );
  return buildGuildTimetable(memberResults, guildTimezone, rangeStart, rangeEnd);
}

export async function getGuildTimetableForDates(
  guildId: string,
  fromDate: string,
  toDate: string
): Promise<GuildTimetable> {
  const guildTimezone = await getGuildTimezone(guildId);
  const members = await getGuildMemberCalendars(guildId);
  const [fromY, fromM, fromD] = fromDate.split("-").map(Number);
  const [toY, toM, toD] = toDate.split("-").map(Number);

  const rangeStart = fromZonedTime(new Date(fromY, fromM - 1, fromD, 0, 0, 0, 0), guildTimezone);
  const rangeEnd = fromZonedTime(new Date(toY, toM - 1, toD, 23, 59, 59, 999), guildTimezone);

  const memberResults = await Promise.all(
    members.map((member) => loadMemberEvents(member, rangeStart, rangeEnd))
  );
  return buildGuildTimetable(memberResults, guildTimezone, rangeStart, rangeEnd);
}

export async function getGuildTimetableForDay(
  guildId: string,
  dayKey: string
): Promise<GuildTimetable> {
  return getGuildTimetableForDates(guildId, dayKey, dayKey);
}

export function getWeekDayKeys(weekStartDayKey: string, timezone: string): string[] {
  const [y, m, d] = weekStartDayKey.split("-").map(Number);
  const monday = fromZonedTime(new Date(y, m - 1, d, 12, 0, 0), timezone);
  const keys: string[] = [];
  for (let i = 0; i < 6; i++) {
    keys.push(dayKeyInTimezone(addDays(monday, i), timezone));
  }
  return keys;
}

export function getWeekMondayKey(date: Date, timezone: string): string {
  const zoned = toZonedTime(date, timezone);
  const monday = startOfWeek(zoned, { weekStartsOn: 1 });
  return dayKeyInTimezone(monday, timezone);
}
