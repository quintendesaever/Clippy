import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_STATUS_HISTORY_LIMIT,
  StatusHistory,
  attachStatusHistory,
  getStatusHistoryLimit,
} from "./statusHistory.js";
import type { StatusReport } from "./types.js";

function report(checkedAt: string, status: StatusReport["status"] = "ok"): StatusReport {
  return {
    status,
    checkedAt,
    uptimeSeconds: 1,
    components: {
      discord: { status: "ok" },
      supabase: { status: "ok" },
      dashboard: { status: "ok" },
      f1ReminderJob: { status: "ok" },
      timetablePanelJob: { status: "ok" },
    },
    summary: { ok: 5, degraded: 0, unavailable: 0, disabled: 0 },
  };
}

describe("getStatusHistoryLimit", () => {
  it("defaults to 20 and ignores invalid values", () => {
    assert.equal(getStatusHistoryLimit({}), DEFAULT_STATUS_HISTORY_LIMIT);
    assert.equal(getStatusHistoryLimit({ STATUS_HISTORY_LIMIT: "5" }), 5);
    assert.equal(getStatusHistoryLimit({ STATUS_HISTORY_LIMIT: "0" }), DEFAULT_STATUS_HISTORY_LIMIT);
    assert.equal(getStatusHistoryLimit({ STATUS_HISTORY_LIMIT: "-3" }), DEFAULT_STATUS_HISTORY_LIMIT);
    assert.equal(getStatusHistoryLimit({ STATUS_HISTORY_LIMIT: "nope" }), DEFAULT_STATUS_HISTORY_LIMIT);
    assert.equal(getStatusHistoryLimit({ STATUS_HISTORY_LIMIT: "20.5" }), DEFAULT_STATUS_HISTORY_LIMIT);
  });
});

describe("StatusHistory", () => {
  it("returns no priors after the first recorded snapshot", () => {
    const store = new StatusHistory(3);
    store.record(report("2026-09-11T12:00:00.000Z"));
    assert.deepEqual(store.prior(), []);
    assert.equal(store.recent().length, 1);
  });

  it("exposes prior snapshots newest first after recording", () => {
    const store = new StatusHistory(5);
    store.record(report("A"));
    store.record(report("B"));
    store.record(report("C"));
    assert.deepEqual(
      store.prior().map((entry) => entry.checkedAt),
      ["B", "A"]
    );
    assert.deepEqual(
      store.recent().map((entry) => entry.checkedAt),
      ["C", "B", "A"]
    );
  });

  it("drops the oldest snapshot when capacity is exceeded", () => {
    const store = new StatusHistory(2);
    store.record(report("A"));
    store.record(report("B"));
    store.record(report("C"));
    assert.deepEqual(
      store.recent().map((entry) => entry.checkedAt),
      ["C", "B"]
    );
    assert.deepEqual(
      store.prior().map((entry) => entry.checkedAt),
      ["B"]
    );
    assert.equal(store.recent().length <= store.capacity, true);
  });

  it("clones snapshots so later mutation cannot corrupt history", () => {
    const store = new StatusHistory(2);
    const original = report("A");
    store.record(original);
    original.status = "unavailable";
    original.components.discord.status = "unavailable";
    assert.equal(store.recent()[0]?.status, "ok");
    assert.equal(store.recent()[0]?.components.discord.status, "ok");
  });

  it("stores only public StatusReport fields", () => {
    const store = new StatusHistory(2);
    store.record({
      ...report("A"),
      admin: { f1: { enabled: true, channelConfigured: true, roleConfigured: true, testMode: true } },
      runtime: { nodeEnv: "test", processStartedAt: "A", historyCapacity: 2 },
    } as StatusReport & { admin: unknown; runtime: unknown });
    const [entry] = store.recent();
    assert.equal("admin" in (entry as object), false);
    assert.equal("runtime" in (entry as object), false);
    assert.deepEqual(entry?.summary, { ok: 5, degraded: 0, unavailable: 0, disabled: 0 });
  });

  it("clones summary so later mutation cannot corrupt history", () => {
    const store = new StatusHistory(2);
    const original = report("A");
    store.record(original);
    original.summary.ok = 0;
    original.summary.unavailable = 5;
    assert.deepEqual(store.recent()[0]?.summary, { ok: 5, degraded: 0, unavailable: 0, disabled: 0 });
  });
});

describe("attachStatusHistory", () => {
  it("attaches prior snapshots and leaves the current report top-level", () => {
    const store = new StatusHistory(5);
    const first = report("2026-09-11T12:00:00.000Z");
    const second = report("2026-09-11T12:01:00.000Z");
    store.record(first);
    store.record(second);
    const payload = attachStatusHistory(second, store);
    assert.equal(payload.checkedAt, second.checkedAt);
    assert.equal(payload.history.length, 1);
    assert.equal(payload.history[0]?.checkedAt, first.checkedAt);
    assert.notEqual(payload.history[0]?.checkedAt, payload.checkedAt);
  });
});
