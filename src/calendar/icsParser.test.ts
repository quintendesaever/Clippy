import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTimeInTimezone } from "../../shared/timetable/dates.js";
import { parseIcsEvents } from "./icsParser.js";

const RANGE_START = new Date("2026-08-01T00:00:00.000Z");
const RANGE_END = new Date("2026-08-31T23:59:59.000Z");
const BRUSSELS = "Europe/Brussels";

describe("parseIcsEvents cancelled", () => {
  it("skips STATUS:CANCELLED events", () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:cancelled@example
DTSTART:20260810T080000Z
DTEND:20260810T100000Z
SUMMARY:Cancelled class
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;
    const events = parseIcsEvents(ics, "u1", "Q", RANGE_START, RANGE_END, BRUSSELS);
    assert.equal(events.length, 0);
  });

  it("keeps events with no STATUS", () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:ok@example
DTSTART:20260810T080000Z
DTEND:20260810T100000Z
SUMMARY:Normal class
END:VEVENT
END:VCALENDAR`;
    const events = parseIcsEvents(ics, "u1", "Q", RANGE_START, RANGE_END, BRUSSELS);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.title, "Normal class");
  });
});

describe("parseIcsEvents floating timezone", () => {
  const weekStart = new Date("2026-09-28T00:00:00.000Z");
  const weekEnd = new Date("2026-10-04T21:59:59.999Z");

  it("reinterprets floating local times in the calendar timezone", () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:float@example
DTSTART:20260929T141500
DTEND:20260929T161500
SUMMARY:Floating class
END:VEVENT
END:VCALENDAR`;
    const events = parseIcsEvents(ics, "u1", "Q", weekStart, weekEnd, BRUSSELS);
    assert.equal(events.length, 1);
    assert.equal(formatTimeInTimezone(events[0]!.start, BRUSSELS), "14:15");
    assert.equal(formatTimeInTimezone(events[0]!.end, BRUSSELS), "16:15");
    // CEST: 14:15 Brussels == 12:15Z
    assert.equal(events[0]!.start.toISOString(), "2026-09-29T12:15:00.000Z");
  });

  it("leaves TZID-aware times unchanged", () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:tzid@example
DTSTART;TZID=Europe/Brussels:20260929T141500
DTEND;TZID=Europe/Brussels:20260929T161500
SUMMARY:Zoned class
END:VEVENT
END:VCALENDAR`;
    const events = parseIcsEvents(ics, "u1", "Q", weekStart, weekEnd, BRUSSELS);
    assert.equal(events.length, 1);
    assert.equal(formatTimeInTimezone(events[0]!.start, BRUSSELS), "14:15");
    assert.equal(events[0]!.start.toISOString(), "2026-09-29T12:15:00.000Z");
  });

  it("leaves explicit UTC (Z) times unchanged", () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:z@example
DTSTART:20260929T141500Z
DTEND:20260929T161500Z
SUMMARY:UTC class
END:VEVENT
END:VCALENDAR`;
    const events = parseIcsEvents(ics, "u1", "Q", weekStart, weekEnd, BRUSSELS);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.start.toISOString(), "2026-09-29T14:15:00.000Z");
    assert.equal(formatTimeInTimezone(events[0]!.start, BRUSSELS), "16:15");
  });

  it("does not reinterpret floating times when no timezone is provided", () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:float-raw@example
DTSTART:20260929T141500
DTEND:20260929T161500
SUMMARY:Raw floating
END:VEVENT
END:VCALENDAR`;
    const events = parseIcsEvents(ics, "u1", "Q", weekStart, weekEnd);
    assert.equal(events.length, 1);
    // Without a floatingTimezone, keep node-ical's process-local instant as-is.
    assert.equal(events[0]!.start.getFullYear(), 2026);
    assert.equal(events[0]!.start.getMonth(), 8);
    assert.equal(events[0]!.start.getDate(), 29);
    assert.equal(events[0]!.start.getHours(), 14);
    assert.equal(events[0]!.start.getMinutes(), 15);
  });

  it("reinterprets floating recurring instances", () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:float-rrule@example
DTSTART:20260928T141500
DTEND:20260928T161500
RRULE:FREQ=DAILY;COUNT=2
SUMMARY:Recurring floating
END:VEVENT
END:VCALENDAR`;
    const events = parseIcsEvents(ics, "u1", "Q", weekStart, weekEnd, BRUSSELS);
    assert.equal(events.length, 2);
    assert.equal(formatTimeInTimezone(events[0]!.start, BRUSSELS), "14:15");
    assert.equal(formatTimeInTimezone(events[1]!.start, BRUSSELS), "14:15");
    assert.equal(events[0]!.start.toISOString(), "2026-09-28T12:15:00.000Z");
    assert.equal(events[1]!.start.toISOString(), "2026-09-29T12:15:00.000Z");
  });
});
