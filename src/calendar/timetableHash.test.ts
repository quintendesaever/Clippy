import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashGuildTimetable,
  isDayOverrideActive,
  needsNextWeekForActiveDay,
  resolveSelectedDay,
  TIMETABLE_DAY_OVERRIDE_MS,
  timetablePanelNeedsUpdate,
} from "./timetableHash.js";
import { makeEvent, makeTimetable } from "./timetableTestFixtures.js";

describe("hashGuildTimetable", () => {
  it("changes when a title, time, type, or event set changes", () => {
    const base = hashGuildTimetable(makeTimetable([makeEvent()]), 1);
    assert.notEqual(
      hashGuildTimetable(makeTimetable([makeEvent({ title: "Physics" })]), 1),
      base
    );
    assert.notEqual(
      hashGuildTimetable(
        makeTimetable([makeEvent({ start: new Date("2026-08-17T09:00:00.000Z") })]),
        1
      ),
      base
    );
    assert.notEqual(
      hashGuildTimetable(makeTimetable([makeEvent({ typeBadges: ["W"] })]), 1),
      base
    );
    assert.notEqual(hashGuildTimetable(makeTimetable([]), 1), base);
    assert.notEqual(
      hashGuildTimetable(makeTimetable([makeEvent(), makeEvent({ title: "Lab", userId: "u2" })]), 1),
      base
    );
  });

  it("does not change for location or description", () => {
    const base = hashGuildTimetable(makeTimetable([makeEvent()]), 1);
    assert.equal(
      hashGuildTimetable(makeTimetable([makeEvent({ location: "Campus", description: "Bring laptop" })]), 1),
      base
    );
  });

  it("changes when the renderer version changes", () => {
    const timetable = makeTimetable([makeEvent()]);
    assert.notEqual(hashGuildTimetable(timetable, 2), hashGuildTimetable(timetable, 1));
  });
});

describe("resolveSelectedDay", () => {
  const weekKeys = ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"];

  it("prefers today on rollover and slash refresh", () => {
    assert.equal(
      resolveSelectedDay({
        todayKey: "2026-08-18",
        weekKeys,
        previouslySelected: "2026-08-17",
        preferToday: true,
      }),
      "2026-08-18"
    );
  });

  it("skips empty days and selects the next busy day on or after today", () => {
    assert.equal(
      resolveSelectedDay({
        todayKey: "2026-08-22",
        weekKeys,
        preferToday: true,
        busyDayKeys: ["2026-08-17", "2026-08-18", "2026-08-24"],
      }),
      "2026-08-24"
    );
  });

  it("keeps today when today itself has events", () => {
    assert.equal(
      resolveSelectedDay({
        todayKey: "2026-08-18",
        weekKeys,
        preferToday: true,
        busyDayKeys: ["2026-08-17", "2026-08-18", "2026-08-19"],
      }),
      "2026-08-18"
    );
  });

  it("moves off a past selected day even without preferToday", () => {
    assert.equal(
      resolveSelectedDay({
        todayKey: "2026-08-18",
        weekKeys,
        previouslySelected: "2026-08-17",
        preferToday: false,
        busyDayKeys: ["2026-08-18", "2026-08-20"],
      }),
      "2026-08-18"
    );
  });

  it("keeps a button-selected day while the in-memory override is active", () => {
    assert.equal(
      resolveSelectedDay({
        todayKey: "2026-08-17",
        weekKeys,
        previouslySelected: "2026-08-20",
        preferToday: true,
        busyDayKeys: ["2026-08-17", "2026-08-20"],
        now: 1_000,
        overrideUntil: 1_000 + TIMETABLE_DAY_OVERRIDE_MS,
      }),
      "2026-08-20"
    );
  });

  it("returns to auto (today if busy, else next busy) after the override expires", () => {
    assert.equal(
      resolveSelectedDay({
        todayKey: "2026-08-17",
        weekKeys,
        previouslySelected: "2026-08-20",
        preferToday: true,
        busyDayKeys: ["2026-08-17", "2026-08-20"],
        now: 1_000 + TIMETABLE_DAY_OVERRIDE_MS,
        overrideUntil: 1_000 + TIMETABLE_DAY_OVERRIDE_MS,
      }),
      "2026-08-17"
    );
    assert.equal(
      resolveSelectedDay({
        todayKey: "2026-08-22",
        weekKeys,
        previouslySelected: "2026-08-18",
        preferToday: false,
        busyDayKeys: ["2026-08-17", "2026-08-18", "2026-08-24"],
        now: 10_000,
        overrideUntil: 5_000,
      }),
      "2026-08-24"
    );
  });

  it("without an override, auto-selects even if a future day was previously shown", () => {
    assert.equal(
      resolveSelectedDay({
        todayKey: "2026-08-17",
        weekKeys,
        previouslySelected: "2026-08-20",
        preferToday: false,
        busyDayKeys: ["2026-08-17", "2026-08-20"],
      }),
      "2026-08-17"
    );
  });

  it("snaps to today when the previous day is outside the week", () => {
    assert.equal(
      resolveSelectedDay({
        todayKey: "2026-08-24",
        weekKeys: ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"],
        previouslySelected: "2026-08-21",
        preferToday: false,
      }),
      "2026-08-24"
    );
  });
});

describe("needsNextWeekForActiveDay", () => {
  it("is true when no busy day remains on or after today", () => {
    assert.equal(needsNextWeekForActiveDay("2026-08-22", ["2026-08-17", "2026-08-18"]), true);
    assert.equal(needsNextWeekForActiveDay("2026-08-18", ["2026-08-17", "2026-08-18"]), false);
  });
});

describe("timetablePanelNeedsUpdate", () => {
  it("skips idle ticks while a day override is active", () => {
    assert.equal(
      timetablePanelNeedsUpdate({
        weekChanged: false,
        dayChanged: false,
        needsValidation: false,
        now: 1_000,
        selectedDayKey: "2026-08-20",
        overrideUntil: 1_000 + TIMETABLE_DAY_OVERRIDE_MS,
        autoDayKey: "2026-08-20",
        needsNextWeek: false,
      }),
      false
    );
  });

  it("updates after override expiry when auto day differs", () => {
    assert.equal(isDayOverrideActive(5_000, 5_000), false);
    assert.equal(
      timetablePanelNeedsUpdate({
        weekChanged: false,
        dayChanged: false,
        needsValidation: false,
        now: 5_000,
        selectedDayKey: "2026-08-20",
        overrideUntil: 5_000,
        autoDayKey: "2026-08-17",
        needsNextWeek: false,
      }),
      true
    );
  });
});
