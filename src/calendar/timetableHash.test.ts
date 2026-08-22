import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashGuildTimetable, resolveSelectedDay } from "./timetableHash.js";
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

  it("moves off a past selected day even without preferToday", () => {
    assert.equal(
      resolveSelectedDay({
        todayKey: "2026-08-18",
        weekKeys,
        previouslySelected: "2026-08-17",
        preferToday: false,
      }),
      "2026-08-18"
    );
  });

  it("keeps a future selected day in the current week", () => {
    assert.equal(
      resolveSelectedDay({
        todayKey: "2026-08-17",
        weekKeys,
        previouslySelected: "2026-08-20",
        preferToday: false,
      }),
      "2026-08-20"
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
