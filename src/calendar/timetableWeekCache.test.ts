import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTimetableWeekCache } from "./timetableWeekCache.js";
import { makeEvent, makeTimetable } from "./timetableTestFixtures.js";
import type { GuildTimetable } from "./types.js";

const MONDAY = Date.parse("2026-08-17T12:00:00.000Z");
const NEXT_MONDAY = Date.parse("2026-08-24T12:00:00.000Z");
const VALIDATE_MS = 20 * 60 * 1000;

function createHarness(initial: GuildTimetable) {
  let now = MONDAY;
  let timetable = initial;
  let fetchCount = 0;
  let renderCount = 0;
  const skipCacheFlags: boolean[] = [];

  const cache = createTimetableWeekCache({
    fetchTimetable: async (_guildId, options) => {
      fetchCount += 1;
      skipCacheFlags.push(Boolean(options?.skipIcsCache));
      return timetable;
    },
    renderDay: async (_timetable, dayKey) => {
      renderCount += 1;
      return Buffer.from(`png:${dayKey}:${renderCount}`);
    },
    loadAvatars: async () => new Map(),
    now: () => now,
    validateIntervalMs: VALIDATE_MS,
    rendererVersion: 1,
    log: () => undefined,
  });

  return {
    cache,
    get fetchCount() {
      return fetchCount;
    },
    get renderCount() {
      return renderCount;
    },
    get skipCacheFlags() {
      return skipCacheFlags;
    },
    setNow(value: number) {
      now = value;
    },
    setTimetable(next: GuildTimetable) {
      timetable = next;
    },
  };
}

describe("timetable week cache", () => {
  it("pre-renders busy days and serves later hits without fetch or render", async () => {
    const harness = createHarness(makeTimetable([makeEvent()]));
    const first = await harness.cache.refresh("g1");
    assert.equal(harness.fetchCount, 1);
    assert.equal(harness.renderCount, 1);
    assert.equal(first.weekMonday, "2026-08-17");
    assert.ok(first.images.get("2026-08-17"));

    const second = await harness.cache.refresh("g1", { selectedDayKey: "2026-08-18" });
    assert.equal(harness.fetchCount, 1);
    assert.equal(harness.renderCount, 1);
    assert.equal(second.selectedDayKey, "2026-08-18");
  });

  it("keeps existing renders when a stale check finds the same hash", async () => {
    const harness = createHarness(makeTimetable([makeEvent()]));
    await harness.cache.refresh("g1");
    harness.setNow(MONDAY + VALIDATE_MS + 1);
    const firstPng = harness.cache.peek("g1")?.images.get("2026-08-17");

    const next = await harness.cache.refresh("g1");
    assert.equal(harness.fetchCount, 2);
    assert.equal(harness.renderCount, 1);
    assert.equal(next.images.get("2026-08-17"), firstPng);
  });

  it("rebuilds renders when timetable data changes", async () => {
    const harness = createHarness(makeTimetable([makeEvent()]));
    await harness.cache.refresh("g1");
    harness.setNow(MONDAY + VALIDATE_MS + 1);
    harness.setTimetable(makeTimetable([makeEvent({ title: "Physics" })]));

    const next = await harness.cache.refresh("g1");
    assert.equal(harness.fetchCount, 2);
    assert.equal(harness.renderCount, 2);
    assert.equal(next.timetable.events[0]?.title, "Physics");
  });

  it("bypasses ICS cache only on explicit force refresh", async () => {
    const harness = createHarness(makeTimetable([makeEvent()]));
    await harness.cache.refresh("g1");
    await harness.cache.refresh("g1", { force: true, skipIcsCache: true, preferToday: true });
    assert.deepEqual(harness.skipCacheFlags, [false, true]);
    assert.equal(harness.fetchCount, 2);
  });

  it("drops the old week and selects today after week rollover", async () => {
    const mondayTimetable = makeTimetable([makeEvent()]);
    const harness = createHarness(mondayTimetable);
    await harness.cache.refresh("g1", { selectedDayKey: "2026-08-21" });
    assert.equal(harness.cache.peek("g1")?.selectedDayKey, "2026-08-21");

    const nextWeek = makeTimetable(
      [
        makeEvent({
          start: new Date("2026-08-24T08:00:00.000Z"),
          end: new Date("2026-08-24T10:00:00.000Z"),
        }),
      ],
      {
        rangeStart: new Date("2026-08-24T00:00:00.000Z"),
        rangeEnd: new Date("2026-08-30T23:59:59.999Z"),
      }
    );
    harness.setTimetable(nextWeek);
    harness.setNow(NEXT_MONDAY);

    const rolled = await harness.cache.refresh("g1");
    assert.equal(rolled.weekMonday, "2026-08-24");
    assert.equal(rolled.selectedDayKey, "2026-08-24");
    assert.equal(rolled.calendarDayKey, "2026-08-24");
    assert.equal(rolled.images.has("2026-08-17"), false);
    assert.ok(rolled.images.get("2026-08-24"));
    assert.equal(harness.renderCount, 2);
  });

  it("keeps the last valid cache when a refresh fetch fails", async () => {
    let shouldFail = false;
    let now = MONDAY;
    const first = makeTimetable([makeEvent()]);
    const cache = createTimetableWeekCache({
      fetchTimetable: async () => {
        if (shouldFail) throw new Error("ics down");
        return first;
      },
      renderDay: async (_timetable, dayKey) => Buffer.from(dayKey),
      loadAvatars: async () => new Map(),
      now: () => now,
      validateIntervalMs: VALIDATE_MS,
      rendererVersion: 1,
      log: () => undefined,
    });

    const saved = await cache.refresh("g1");
    shouldFail = true;
    now = MONDAY + VALIDATE_MS + 1;
    const kept = await cache.refresh("g1");
    assert.equal(kept, saved);
    assert.equal(kept.timetable.events[0]?.title, "Math");
  });

  it("dedupes concurrent rebuilds", async () => {
    let fetches = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cache = createTimetableWeekCache({
      fetchTimetable: async () => {
        fetches += 1;
        await gate;
        return makeTimetable([makeEvent()]);
      },
      renderDay: async () => Buffer.from("png"),
      loadAvatars: async () => new Map(),
      now: () => MONDAY,
      validateIntervalMs: VALIDATE_MS,
      rendererVersion: 1,
      log: () => undefined,
    });

    const pending = Promise.all([cache.refresh("g1"), cache.refresh("g1")]);
    release();
    const [a, b] = await pending;
    assert.equal(fetches, 1);
    assert.equal(a.dataHash, b.dataHash);
  });
});
