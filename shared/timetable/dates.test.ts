import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarDays,
  dayKeyInTimezone,
  getWeekDayKeys,
  getWeekMondayKey,
  inclusiveDaySpan,
  isValidIanaTimeZone,
  MAX_TIMETABLE_RANGE_DAYS,
  zonedStartEndMinutes,
} from "./dates.js";

const BRUSSELS = "Europe/Brussels";

describe("dayKeyInTimezone", () => {
  it("assigns Brussels 00:30 Wednesday to Wednesday", () => {
    // 2026-10-21 00:30 Europe/Brussels = 2026-10-20 22:30 UTC
    const utc = new Date("2026-10-20T22:30:00.000Z");
    assert.equal(dayKeyInTimezone(utc, BRUSSELS), "2026-10-21");
  });

  it("does not use the UTC date prefix", () => {
    const utc = new Date("2026-10-20T22:30:00.000Z");
    assert.notEqual(utc.toISOString().slice(0, 10), dayKeyInTimezone(utc, BRUSSELS));
  });
});

describe("week navigation", () => {
  it("shifts Oct 19 2026 to Oct 26 across EU DST", () => {
    assert.equal(addCalendarDays("2026-10-19", 7), "2026-10-26");
    assert.equal(getWeekMondayKey(new Date("2026-10-22T12:00:00+02:00"), BRUSSELS), "2026-10-19");
    assert.equal(getWeekMondayKey(new Date("2026-10-28T12:00:00+01:00"), BRUSSELS), "2026-10-26");
  });

  it("returns Monday through Sunday", () => {
    const keys = getWeekDayKeys("2026-10-19");
    assert.deepEqual(keys, [
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
  });
});

describe("timetable range", () => {
  it("rejects a 2020-2030 span", () => {
    assert.ok(inclusiveDaySpan("2020-01-01", "2030-12-31") > MAX_TIMETABLE_RANGE_DAYS);
  });

  it("allows a 7-day week", () => {
    assert.equal(inclusiveDaySpan("2026-10-19", "2026-10-25"), 7);
  });
});

describe("midnight end minutes", () => {
  it("treats 22:00-00:00 as ending at 24:00", () => {
    const start = new Date("2026-08-21T20:00:00.000Z"); // 22:00 Brussels (CEST)
    const end = new Date("2026-08-21T22:00:00.000Z"); // 00:00 Brussels next calendar day
    const { startMinutes, endMinutes } = zonedStartEndMinutes(start, end, BRUSSELS);
    assert.equal(startMinutes, 22 * 60);
    assert.equal(endMinutes, 24 * 60);
  });
});

describe("IANA timezone", () => {
  it("accepts Europe/Brussels and rejects typos", () => {
    assert.equal(isValidIanaTimeZone("Europe/Brussels"), true);
    assert.equal(isValidIanaTimeZone("Not/AZone"), false);
    assert.equal(isValidIanaTimeZone(""), false);
  });
});
