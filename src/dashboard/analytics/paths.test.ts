import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeAnalyticsPath, shouldRecordPageView } from "./paths.js";

describe("normalizeAnalyticsPath", () => {
  it("allows dashboard routes", () => {
    assert.equal(normalizeAnalyticsPath("/timetable"), "/timetable");
    assert.equal(normalizeAnalyticsPath("/"), "/");
    assert.equal(normalizeAnalyticsPath("/admin/"), "/admin");
  });

  it("rejects unknown or injected paths", () => {
    assert.equal(normalizeAnalyticsPath("/api/admin/stats"), null);
    assert.equal(normalizeAnalyticsPath("/timetable?from=x"), "/timetable");
    assert.equal(normalizeAnalyticsPath("https://evil.example/timetable"), "/timetable");
    assert.equal(normalizeAnalyticsPath("/not-a-page"), null);
    assert.equal(normalizeAnalyticsPath(""), null);
    assert.equal(normalizeAnalyticsPath(12), null);
  });
});

describe("shouldRecordPageView", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("records the first view", () => {
    assert.equal(shouldRecordPageView(null, "/timetable", now), true);
  });

  it("dedups the same path within 30 seconds", () => {
    const last = { path: "/timetable", occurredAt: new Date("2026-08-25T11:59:45.000Z") };
    assert.equal(shouldRecordPageView(last, "/timetable", now), false);
  });

  it("records a different path immediately", () => {
    const last = { path: "/timetable", occurredAt: new Date("2026-08-25T11:59:50.000Z") };
    assert.equal(shouldRecordPageView(last, "/settings", now), true);
  });

  it("records the same path after the window", () => {
    const last = { path: "/timetable", occurredAt: new Date("2026-08-25T11:59:20.000Z") };
    assert.equal(shouldRecordPageView(last, "/timetable", now), true);
  });
});
