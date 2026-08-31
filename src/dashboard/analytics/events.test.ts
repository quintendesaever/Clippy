import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateAnalyticsEvents,
  formatAnalyticsEventDetail,
  isAllowedEventType,
  sanitizeAnalyticsMetadata,
} from "./events.js";

describe("isAllowedEventType", () => {
  it("accepts allowlisted types", () => {
    assert.equal(isAllowedEventType("activity.create"), true);
    assert.equal(isAllowedEventType("calendar.save"), true);
    assert.equal(isAllowedEventType("command.timetable"), true);
    assert.equal(isAllowedEventType("timetable.day"), true);
    assert.equal(isAllowedEventType("f1.stats"), true);
  });

  it("rejects unknown types", () => {
    assert.equal(isAllowedEventType("activity.hack"), false);
    assert.equal(isAllowedEventType("command.unknown"), false);
    assert.equal(isAllowedEventType(""), false);
  });
});

describe("sanitizeAnalyticsMetadata", () => {
  it("keeps known keys and strips the rest", () => {
    assert.deepEqual(
      sanitizeAnalyticsMetadata("activity.create", {
        activityId: "act-1",
        title: "secret",
        icsUrl: "https://example.com/cal.ics",
      }),
      { activityId: "act-1" }
    );
  });

  it("keeps only hasIcs for calendar.save", () => {
    assert.deepEqual(
      sanitizeAnalyticsMetadata("calendar.save", {
        hasIcs: true,
        icsUrl: "https://example.com/secret.ics",
        token: "nope",
      }),
      { hasIcs: true }
    );
  });

  it("drops invalid value types", () => {
    assert.deepEqual(sanitizeAnalyticsMetadata("activity.join", { activityId: 12 }), {});
    assert.deepEqual(sanitizeAnalyticsMetadata("f1.stats", { preview: "yes", meetingKey: "1" }), {});
    assert.deepEqual(sanitizeAnalyticsMetadata("f1.stats", { preview: true, meetingKey: 42 }), {
      preview: true,
      meetingKey: 42,
    });
  });

  it("returns empty object for unknown event types", () => {
    assert.deepEqual(sanitizeAnalyticsMetadata("not.real", { command: "ping" }), {});
  });
});

describe("aggregateAnalyticsEvents", () => {
  it("counts types, users, and days", () => {
    const result = aggregateAnalyticsEvents(
      [
        {
          user_id: "u1",
          occurred_at: "2026-08-25T10:00:00.000Z",
          event_type: "activity.create",
          metadata: {},
        },
        {
          user_id: "u1",
          occurred_at: "2026-08-25T11:00:00.000Z",
          event_type: "activity.join",
          metadata: {},
        },
        {
          user_id: "u2",
          occurred_at: "2026-08-24T10:00:00.000Z",
          event_type: "activity.create",
          metadata: {},
        },
      ],
      "Europe/Brussels"
    );
    assert.equal(result.total, 3);
    assert.equal(result.byType[0]?.key, "activity.create");
    assert.equal(result.byType[0]?.count, 2);
    assert.equal(result.topUsers[0]?.userId, "u1");
    assert.equal(result.topUsers[0]?.count, 2);
    assert.equal(result.overTime.find((row) => row.day === "2026-08-25")?.count, 2);
    assert.equal(result.recent.length, 3);
    assert.equal(result.recent[0]?.eventType, "activity.join");
    assert.equal(result.recent[0]?.userId, "u1");
  });

  it("keeps the newest events and formats details without leaking ids", () => {
    const result = aggregateAnalyticsEvents(
      [
        {
          user_id: "u1",
          occurred_at: "2026-08-25T12:00:00.000Z",
          event_type: "activity.create",
          metadata: { activityId: "act-secret" },
        },
        {
          user_id: "u2",
          occurred_at: "2026-08-25T11:00:00.000Z",
          event_type: "calendar.save",
          metadata: { hasIcs: true },
        },
        {
          user_id: "u3",
          occurred_at: "2026-08-25T10:00:00.000Z",
          event_type: "timetable.day",
          metadata: { dayKey: "2026-08-25" },
        },
      ],
      "Europe/Brussels"
    );
    assert.equal(result.recent[0]?.eventType, "activity.create");
    assert.equal(result.recent[0]?.detail, null);
    assert.equal(result.recent[1]?.detail, "Met kalender-URL");
    assert.equal(result.recent[2]?.detail, "2026-08-25");
  });
});

describe("formatAnalyticsEventDetail", () => {
  it("formats commands and omits activity ids", () => {
    assert.equal(
      formatAnalyticsEventDetail("command.stats", { command: "stats", subcommand: "set-timezone" }),
      "/stats set-timezone"
    );
    assert.equal(formatAnalyticsEventDetail("command.ping", { command: "ping" }), "/ping");
    assert.equal(formatAnalyticsEventDetail("activity.update", { activityId: "act-1" }), null);
  });
});
