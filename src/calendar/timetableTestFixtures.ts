import { dayKeyInTimezone } from "../../shared/timetable/dates.js";
import type { GuildTimetable, TimetableEvent } from "./types.js";

export const TEST_WEEK_START = new Date("2026-08-17T00:00:00.000Z");
export const TEST_WEEK_END = new Date("2026-08-23T23:59:59.999Z");

export function makeEvent(overrides: Partial<TimetableEvent> = {}): TimetableEvent {
  return {
    userId: "u1",
    initials: "Q",
    title: "Math",
    rawTitle: "Math",
    typeBadges: ["H"],
    start: new Date("2026-08-17T08:00:00.000Z"),
    end: new Date("2026-08-17T10:00:00.000Z"),
    allDay: false,
    source: "ics",
    ...overrides,
  };
}

export function makeTimetable(
  events: TimetableEvent[],
  extra?: Partial<GuildTimetable>
): GuildTimetable {
  const timezone = extra?.guildTimezone ?? "UTC";
  const eventsByDay = new Map<string, TimetableEvent[]>();
  for (const event of events) {
    const key = dayKeyInTimezone(event.start, timezone);
    const bucket = eventsByDay.get(key) ?? [];
    bucket.push(event);
    eventsByDay.set(key, bucket);
  }
  const userIds = [...new Set(events.map((event) => event.userId))];
  const members = userIds.map((userId) => {
    const event = events.find((item) => item.userId === userId)!;
    return { userId, initials: event.initials, color: "#fff" };
  });
  return {
    events,
    eventsByDay,
    eventsByUser: new Map(),
    memberResults: members.map((member) => ({
      userId: member.userId,
      initials: member.initials,
      events,
    })),
    members,
    guildTimezone: timezone,
    rangeStart: TEST_WEEK_START,
    rangeEnd: TEST_WEEK_END,
    ...extra,
  };
}
