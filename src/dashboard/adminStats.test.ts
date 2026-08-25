import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateUserAndActivityStats,
  aggregateWebStats,
  resolveRangeBounds,
  type MemberStatRow,
  type PageViewRow,
} from "./adminStatsAggregate.js";

const TZ = "Europe/Brussels";

function view(overrides: Partial<PageViewRow>): PageViewRow {
  return {
    user_id: "u1",
    session_id: "s1",
    occurred_at: "2026-08-25T10:00:00.000Z",
    path: "/timetable",
    country: "BE",
    region: "East Flanders",
    city: "Ghent",
    device_type: "desktop",
    browser_family: "Chrome",
    ...overrides,
  };
}

describe("resolveRangeBounds", () => {
  it("uses guild-timezone today", () => {
    const now = new Date("2026-08-25T10:00:00.000Z");
    const bounds = resolveRangeBounds("today", TZ, now);
    assert.equal(bounds.fromDayKey, "2026-08-25");
    assert.ok(bounds.from);
    assert.ok(bounds.from.getTime() < now.getTime());
  });

  it("all-time has no lower bound", () => {
    const bounds = resolveRangeBounds("all", TZ, new Date("2026-08-25T10:00:00.000Z"));
    assert.equal(bounds.from, null);
  });
});

describe("aggregateWebStats", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  const from = new Date("2026-08-18T22:00:00.000Z");

  it("separates unique users, unique sessions, and page views", () => {
    const views = [
      view({ user_id: "u1", session_id: "s1", path: "/timetable" }),
      view({ user_id: "u1", session_id: "s1", path: "/settings", occurred_at: "2026-08-25T10:01:00.000Z" }),
      view({ user_id: "u2", session_id: "s2", path: "/timetable", occurred_at: "2026-08-25T11:00:00.000Z" }),
      view({
        user_id: null,
        session_id: "s3",
        path: "/",
        occurred_at: "2026-08-25T11:30:00.000Z",
      }),
    ];
    const web = aggregateWebStats(views, TZ, now, from, now);
    assert.equal(web.pageViews, 4);
    assert.equal(web.uniqueUsers, 2);
    assert.equal(web.uniqueSessions, 3);
    assert.equal(web.visitsToday, 4);
    assert.equal(web.mostVisitedPages[0]?.path, "/timetable");
    assert.equal(web.mostVisitedPages[0]?.count, 2);
    assert.equal(web.recentVisits.length, 4);
    assert.equal(web.recentVisits[0]?.path, "/");
  });

  it("counts first dashboard visit in range as new dashboard users", () => {
    const views = [
      view({ user_id: "old", occurred_at: "2026-08-01T10:00:00.000Z" }),
      view({ user_id: "old", occurred_at: "2026-08-25T10:00:00.000Z" }),
      view({ user_id: "new", occurred_at: "2026-08-25T11:00:00.000Z" }),
    ];
    const web = aggregateWebStats(views, TZ, now, from, now);
    assert.equal(web.newDashboardUsers, 1);
  });
});

describe("aggregateUserAndActivityStats", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  const from = new Date("2026-08-18T22:00:00.000Z");
  const members: MemberStatRow[] = [
    {
      user_id: "u1",
      share_location: true,
      last_country: "BE",
      last_region: null,
      last_city: "Gent",
      last_dashboard_at: "2026-08-25T10:00:00.000Z",
      avatar_hash: null,
    },
    {
      user_id: "u2",
      share_location: false,
      last_country: null,
      last_region: null,
      last_city: null,
      last_dashboard_at: null,
      avatar_hash: null,
    },
  ];

  it("counts sharing preference independently of stored location", () => {
    const result = aggregateUserAndActivityStats(
      members,
      [{ id: "a1", created_by: "u1", start_at: "2026-08-25T11:00:00.000Z" }],
      [
        { activity_id: "a1", user_id: "u1" },
        { activity_id: "a1", user_id: "u2" },
      ],
      [view({ user_id: "u1" })],
      from,
      now,
      TZ
    );
    assert.equal(result.users.total, 2);
    assert.equal(result.users.shareLocationEnabled, 1);
    assert.equal(result.users.shareLocationDisabled, 1);
    assert.equal(result.activities.total, 1);
    assert.equal(result.activities.inRange, 1);
    assert.equal(result.users.mostActive[0]?.userId, "u1");
    assert.equal(result.activityCountByUser.get("u2"), 1);
    assert.equal(result.users.active, 2);
  });
});
