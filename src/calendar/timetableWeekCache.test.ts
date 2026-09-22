import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TIMETABLE_DAY_OVERRIDE_MS } from "./timetableHash.js";
import { createTimetableWeekCache, type TimeoutHandle } from "./timetableWeekCache.js";
import { makeEvent, makeTimetable } from "./timetableTestFixtures.js";
import type { GuildTimetable } from "./types.js";

const MONDAY = Date.parse("2026-08-17T12:00:00.000Z");
const NEXT_MONDAY = Date.parse("2026-08-24T12:00:00.000Z");
const VALIDATE_MS = 20 * 60 * 1000;

type FakeTimer = TimeoutHandle & {
  delay: number;
  fn: () => void | Promise<void>;
  cleared: boolean;
};

function createFakeTimers() {
  const timers: FakeTimer[] = [];
  return {
    timers,
    setTimeout(fn: () => void | Promise<void>, delay: number): FakeTimer {
      const timer: FakeTimer = {
        delay,
        fn,
        cleared: false,
        unref() {
          return timer;
        },
      };
      timers.push(timer);
      return timer;
    },
    clearTimeout(handle: TimeoutHandle) {
      (handle as FakeTimer).cleared = true;
    },
    active() {
      return timers.filter((timer) => !timer.cleared);
    },
    async fire(timer: FakeTimer) {
      assert.equal(timer.cleared, false);
      timer.cleared = true;
      await timer.fn();
    },
  };
}

function createHarness(initial: GuildTimetable) {
  let now = MONDAY;
  let timetable = initial;
  let fetchCount = 0;
  let renderCount = 0;
  const skipCacheFlags: boolean[] = [];
  const logs: string[] = [];
  const fakeTimers = createFakeTimers();

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
    log: (line) => logs.push(line),
    setTimeout: (fn, delay) => fakeTimers.setTimeout(fn, delay),
    clearTimeout: (handle) => fakeTimers.clearTimeout(handle),
  });

  return {
    cache,
    logs,
    fakeTimers,
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

  it("jumps to next week when the rest of this week has no events", async () => {
    const thisWeek = makeTimetable(
      [
        makeEvent({
          start: new Date("2026-08-17T08:00:00.000Z"),
          end: new Date("2026-08-17T10:00:00.000Z"),
        }),
      ],
      {
        rangeStart: new Date("2026-08-17T00:00:00.000Z"),
        rangeEnd: new Date("2026-08-23T23:59:59.999Z"),
      }
    );
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

    const saturday = Date.parse("2026-08-22T12:00:00.000Z");
    let fetches = 0;
    const cache = createTimetableWeekCache({
      fetchTimetable: async (_guildId, options) => {
        fetches += 1;
        if (options?.weekMonday === "2026-08-24") return nextWeek;
        return thisWeek;
      },
      renderDay: async (_timetable, dayKey) => Buffer.from(dayKey),
      loadAvatars: async () => new Map(),
      now: () => saturday,
      validateIntervalMs: VALIDATE_MS,
      rendererVersion: 1,
      log: () => undefined,
    });

    const entry = await cache.refresh("g1", { preferToday: true });
    assert.equal(fetches, 2);
    assert.equal(entry.weekMonday, "2026-08-24");
    assert.equal(entry.selectedDayKey, "2026-08-24");
    assert.equal(entry.calendarDayKey, "2026-08-22");
  });

  it("preloads participant avatars in addition to event.userId", async () => {
    let loaded: string[] = [];
    const cache = createTimetableWeekCache({
      fetchTimetable: async () =>
        makeTimetable([makeEvent({ userId: "owner", participantIds: ["p2", "p3"] })]),
      renderDay: async () => Buffer.from("png"),
      loadAvatars: async (_guildId, userIds) => {
        loaded = userIds;
        return new Map();
      },
      now: () => MONDAY,
      validateIntervalMs: VALIDATE_MS,
      rendererVersion: 1,
      log: () => undefined,
    });

    await cache.refresh("g1");
    assert.deepEqual(loaded.slice().sort(), ["owner", "p2", "p3"].sort());
  });

  it("keeps a button day for five minutes, then resumes auto", async () => {
    const harness = createHarness(
      makeTimetable([
        makeEvent(),
        makeEvent({
          title: "Lab",
          start: new Date("2026-08-20T08:00:00.000Z"),
          end: new Date("2026-08-20T10:00:00.000Z"),
        }),
      ])
    );

    await harness.cache.refresh("g1");
    const selected = await harness.cache.refresh("g1", { selectedDayKey: "2026-08-20" });
    assert.equal(selected.selectedDayKey, "2026-08-20");
    assert.ok(selected.dayOverrideUntil && selected.dayOverrideUntil > MONDAY);

    harness.setNow(MONDAY + 4 * 60 * 1000);
    const stillHeld = await harness.cache.refresh("g1", { preferToday: true });
    assert.equal(stillHeld.selectedDayKey, "2026-08-20");

    harness.setNow(MONDAY + TIMETABLE_DAY_OVERRIDE_MS + 1);
    const auto = await harness.cache.refresh("g1", { preferToday: true });
    assert.equal(auto.selectedDayKey, "2026-08-17");
    assert.equal(auto.dayOverrideUntil, undefined);
  });
});

describe("timetable day override timer", () => {
  const busyWeek = () =>
    makeTimetable([
      makeEvent(),
      makeEvent({
        title: "Lab",
        start: new Date("2026-08-20T08:00:00.000Z"),
        end: new Date("2026-08-20T10:00:00.000Z"),
      }),
    ]);

  it("schedules an exact 5-minute timer when a day override is set", async () => {
    const harness = createHarness(busyWeek());
    await harness.cache.refresh("g1");
    harness.cache.selectDay("g1", "2026-08-20");

    const active = harness.fakeTimers.active();
    assert.equal(active.length, 1);
    assert.equal(active[0]?.delay, TIMETABLE_DAY_OVERRIDE_MS);
    assert.equal(harness.cache.peek("g1")?.selectedDayKey, "2026-08-20");
    assert.match(harness.logs.at(-1) ?? "", /Day override set for guild g1 → 2026-08-20/);
  });

  it("resets the timer when another day is clicked", async () => {
    const harness = createHarness(busyWeek());
    await harness.cache.refresh("g1");
    harness.cache.selectDay("g1", "2026-08-20");
    const first = harness.fakeTimers.active()[0];
    assert.ok(first);

    harness.cache.selectDay("g1", "2026-08-18");
    assert.equal(first.cleared, true);
    const active = harness.fakeTimers.active();
    assert.equal(active.length, 1);
    assert.notEqual(active[0], first);
    assert.equal(active[0]?.delay, TIMETABLE_DAY_OVERRIDE_MS);
    assert.equal(harness.cache.peek("g1")?.selectedDayKey, "2026-08-18");
  });

  it("snaps back to the auto busy day when the override timer fires", async () => {
    const harness = createHarness(busyWeek());
    const expiredGuilds: string[] = [];
    harness.cache.setOnOverrideExpired((guildId) => {
      expiredGuilds.push(guildId);
    });
    await harness.cache.refresh("g1");
    harness.cache.selectDay("g1", "2026-08-20");
    const timer = harness.fakeTimers.active()[0];
    assert.ok(timer);

    harness.setNow(MONDAY + TIMETABLE_DAY_OVERRIDE_MS + 1);
    await harness.fakeTimers.fire(timer);

    const entry = harness.cache.peek("g1");
    assert.equal(entry?.selectedDayKey, "2026-08-17");
    assert.equal(entry?.dayOverrideUntil, undefined);
    assert.equal(harness.fakeTimers.active().length, 0);
    assert.deepEqual(expiredGuilds, ["g1"]);
    assert.ok(harness.logs.some((line) => line.includes("Day override expired for guild g1 (2026-08-20 → 2026-08-17)")));
  });

  it("wraps to next week's busy day when the rest of this week is empty", async () => {
    const thisWeek = makeTimetable(
      [
        makeEvent({
          start: new Date("2026-08-17T08:00:00.000Z"),
          end: new Date("2026-08-17T10:00:00.000Z"),
        }),
      ],
      {
        rangeStart: new Date("2026-08-17T00:00:00.000Z"),
        rangeEnd: new Date("2026-08-23T23:59:59.999Z"),
      }
    );
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

    const saturday = Date.parse("2026-08-22T12:00:00.000Z");
    let now = saturday;
    const logs: string[] = [];
    const fakeTimers = createFakeTimers();
    const cache = createTimetableWeekCache({
      fetchTimetable: async (_guildId, options) => {
        if (options?.weekMonday === "2026-08-24") return nextWeek;
        return thisWeek;
      },
      renderDay: async (_timetable, dayKey) => Buffer.from(dayKey),
      loadAvatars: async () => new Map(),
      now: () => now,
      validateIntervalMs: VALIDATE_MS,
      rendererVersion: 1,
      log: (line) => logs.push(line),
      setTimeout: (fn, delay) => fakeTimers.setTimeout(fn, delay),
      clearTimeout: (handle) => fakeTimers.clearTimeout(handle),
    });

    await cache.refresh("g1", { selectedDayKey: "2026-08-18" });
    assert.equal(cache.peek("g1")?.selectedDayKey, "2026-08-18");
    assert.equal(cache.peek("g1")?.weekMonday, "2026-08-17");
    const timer = fakeTimers.active()[0];
    assert.ok(timer);
    assert.equal(timer.delay, TIMETABLE_DAY_OVERRIDE_MS);

    now = saturday + TIMETABLE_DAY_OVERRIDE_MS + 1;
    await fakeTimers.fire(timer);

    const entry = cache.peek("g1");
    assert.equal(entry?.weekMonday, "2026-08-24");
    assert.equal(entry?.selectedDayKey, "2026-08-24");
    assert.equal(entry?.dayOverrideUntil, undefined);
    assert.ok(logs.some((line) => line.includes("Day override expired for guild g1 (2026-08-18 → 2026-08-24)")));
  });

  it("cancels the pending timer and returns to auto on force refresh", async () => {
    const harness = createHarness(busyWeek());
    await harness.cache.refresh("g1");
    harness.cache.selectDay("g1", "2026-08-20");
    const timer = harness.fakeTimers.active()[0];
    assert.ok(timer);

    const auto = await harness.cache.refresh("g1", {
      force: true,
      skipIcsCache: true,
      preferToday: true,
      clearDayOverride: true,
    });
    assert.equal(timer.cleared, true);
    assert.equal(harness.fakeTimers.active().length, 0);
    assert.equal(auto.selectedDayKey, "2026-08-17");
    assert.equal(auto.dayOverrideUntil, undefined);
    assert.ok(harness.logs.some((line) => line.includes("Day override cancelled for guild g1 (force refresh)")));
  });
});
