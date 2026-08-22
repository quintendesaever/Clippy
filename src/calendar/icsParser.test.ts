import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseIcsEvents } from "./icsParser.js";

const RANGE_START = new Date("2026-08-01T00:00:00.000Z");
const RANGE_END = new Date("2026-08-31T23:59:59.000Z");

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
    const events = parseIcsEvents(ics, "u1", "Q", RANGE_START, RANGE_END);
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
    const events = parseIcsEvents(ics, "u1", "Q", RANGE_START, RANGE_END);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.title, "Normal class");
  });
});
