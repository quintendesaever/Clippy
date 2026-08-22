import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateDayLayout,
  clipEventToGrid,
  createTimelineLayout,
  eventMergeKey,
  groupDayEvents,
  type LayoutEvent,
  type RenderCard,
} from "./layout.js";

const TZ = "Europe/Brussels";

function event(partial: Partial<LayoutEvent> & Pick<LayoutEvent, "title" | "userId">): LayoutEvent {
  return {
    start: partial.start ?? new Date("2026-08-21T18:00:00.000Z"),
    end: partial.end ?? new Date("2026-08-21T20:00:00.000Z"),
    allDay: partial.allDay ?? false,
    source: partial.source ?? "ics",
    typeBadges: partial.typeBadges ?? [],
    id: partial.id,
    title: partial.title,
    userId: partial.userId,
  };
}

describe("groupDayEvents", () => {
  it("merges identical ICS lessons", () => {
    const cards = groupDayEvents([
      event({ title: "Analyse", userId: "a" }),
      event({ title: "Analyse", userId: "b" }),
    ]);
    assert.equal(cards.length, 1);
    assert.deepEqual(cards[0]?.userIds, ["a", "b"]);
  });

  it("does not merge distinct activities with the same title and time", () => {
    const start = new Date("2026-08-21T18:00:00.000Z");
    const end = new Date("2026-08-21T20:00:00.000Z");
    const cards = groupDayEvents([
      event({ title: "Film", userId: "a", source: "activity", id: "act-1", start, end }),
      event({ title: "Film", userId: "b", source: "activity", id: "act-2", start, end }),
    ]);
    assert.equal(cards.length, 2);
    assert.equal(eventMergeKey(cards[0]!), "activity|act-1");
    assert.equal(eventMergeKey(cards[1]!), "activity|act-2");
  });

  it("skips all-day events", () => {
    const cards = groupDayEvents([
      event({ title: "Holiday", userId: "a", allDay: true }),
    ]);
    assert.equal(cards.length, 0);
  });
});

describe("clipEventToGrid midnight", () => {
  it("keeps a 22:00-00:00 event on the grid", () => {
    const start = new Date("2026-08-21T20:00:00.000Z");
    const end = new Date("2026-08-21T22:00:00.000Z");
    const layout = createTimelineLayout(
      [event({ title: "Kotavond", userId: "a", start, end, source: "activity", id: "1" })],
      TZ,
      1100,
      32
    );
    const clipped = clipEventToGrid(start, end, TZ, layout);
    assert.ok(clipped);
    assert.equal(clipped?.startHour, 22);
    assert.equal(clipped?.endHour, 24);
  });
});

function at(hour: number, minute = 0, day = "2026-08-24"): Date {
  return new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`);
}

function timed(
  userId: string,
  title: string,
  start: Date,
  end: Date,
  extra?: Partial<LayoutEvent>
): LayoutEvent {
  return event({ userId, title, start, end, ...extra });
}

function snapshot(lanes: RenderCard[][]): { title: string; users: string[] }[][] {
  return lanes.map((lane) => lane.map((card) => ({ title: card.title, users: [...card.userIds] })));
}

function laneIndexForTitle(lanes: RenderCard[][], title: string): number {
  return lanes.findIndex((lane) => lane.some((card) => card.title === title));
}

describe("calculateDayLayout", () => {
  it("returns no lanes for an empty day", () => {
    assert.deepEqual(calculateDayLayout([]), []);
  });

  it("places a single user's non-overlapping activities on one lane", () => {
    const lanes = calculateDayLayout([
      timed("alice", "A1", at(8), at(9)),
      timed("alice", "A2", at(10), at(11)),
      timed("alice", "A3", at(13), at(14)),
    ]);
    assert.equal(lanes.length, 1);
    assert.deepEqual(
      lanes[0]?.map((card) => card.title),
      ["A1", "A2", "A3"]
    );
  });

  it("keeps the same user on one lane when their activities do not overlap", () => {
    const lanes = calculateDayLayout([
      timed("alice", "Morning", at(8), at(9)),
      timed("alice", "Noon", at(12), at(13)),
      timed("alice", "Evening", at(16), at(17)),
    ]);
    assert.equal(lanes.length, 1);
    assert.equal(lanes[0]?.every((card) => card.userIds[0] === "alice"), true);
  });

  it("splits a user across lanes when their own activities overlap", () => {
    const lanes = calculateDayLayout([
      timed("alice", "Course A", at(8), at(10)),
      timed("alice", "Course B", at(9), at(11)),
    ]);
    assert.equal(lanes.length, 2);
  });

  it("sorts users by descending activity count, per day only", () => {
    const monday = [
      timed("alice", "Mon-A1", at(8, 0, "2026-08-24"), at(9, 0, "2026-08-24")),
      timed("alice", "Mon-A2", at(10, 0, "2026-08-24"), at(11, 0, "2026-08-24")),
      timed("alice", "Mon-A3", at(12, 0, "2026-08-24"), at(13, 0, "2026-08-24")),
      timed("bob", "Mon-B1", at(8, 30, "2026-08-24"), at(10, 0, "2026-08-24")),
    ];
    const tuesday = [
      timed("alice", "Tue-A1", at(8, 0, "2026-08-25"), at(10, 0, "2026-08-25")),
      timed("bob", "Tue-B1", at(8, 0, "2026-08-25"), at(9, 0, "2026-08-25")),
      timed("bob", "Tue-B2", at(10, 0, "2026-08-25"), at(11, 0, "2026-08-25")),
      timed("bob", "Tue-B3", at(12, 0, "2026-08-25"), at(13, 0, "2026-08-25")),
    ];

    const mondayLanes = calculateDayLayout(monday);
    const tuesdayLanes = calculateDayLayout(tuesday);

    assert.ok(laneIndexForTitle(mondayLanes, "Mon-A1") < laneIndexForTitle(mondayLanes, "Mon-B1"));
    assert.ok(laneIndexForTitle(tuesdayLanes, "Tue-B1") < laneIndexForTitle(tuesdayLanes, "Tue-A1"));
  });

  it("puts the busiest user on the top lane when they overlap everyone", () => {
    const lanes = calculateDayLayout([
      timed("alice", "A1", at(8), at(9)),
      timed("alice", "A2", at(10), at(11)),
      timed("alice", "A3", at(12), at(13)),
      timed("bob", "B1", at(8), at(13)),
      timed("charlie", "C1", at(8), at(13)),
    ]);
    assert.equal(laneIndexForTitle(lanes, "A1"), 0);
    assert.equal(laneIndexForTitle(lanes, "A2"), 0);
    assert.equal(laneIndexForTitle(lanes, "A3"), 0);
    assert.ok(laneIndexForTitle(lanes, "B1") > 0);
    assert.ok(laneIndexForTitle(lanes, "C1") > 0);
    assert.notEqual(laneIndexForTitle(lanes, "B1"), laneIndexForTitle(lanes, "C1"));
  });

  it("lets non-overlapping users share a lane", () => {
    const lanes = calculateDayLayout([
      timed("alice", "A1", at(8), at(9)),
      timed("dave", "D1", at(16), at(17)),
    ]);
    assert.equal(lanes.length, 1);
    assert.equal(laneIndexForTitle(lanes, "A1"), laneIndexForTitle(lanes, "D1"));
  });

  it("does not let overlapping users share a lane", () => {
    const lanes = calculateDayLayout([
      timed("alice", "A1", at(8), at(10)),
      timed("bob", "B1", at(9), at(11)),
    ]);
    assert.equal(lanes.length, 2);
    assert.notEqual(laneIndexForTitle(lanes, "A1"), laneIndexForTitle(lanes, "B1"));
  });

  it("allows back-to-back activities that meet at the same instant to share a lane", () => {
    const lanes = calculateDayLayout([
      timed("alice", "Until 10", at(8), at(10)),
      timed("bob", "From 10", at(10), at(12)),
    ]);
    assert.equal(lanes.length, 1);
    assert.equal(laneIndexForTitle(lanes, "Until 10"), laneIndexForTitle(lanes, "From 10"));
  });

  it("breaks activity-count ties with lexicographic userId", () => {
    const lanes = calculateDayLayout([
      timed("user-b", "B", at(8), at(10)),
      timed("user-a", "A", at(8), at(10)),
    ]);
    assert.equal(lanes.length, 2);
    assert.equal(laneIndexForTitle(lanes, "A"), 0);
    assert.equal(laneIndexForTitle(lanes, "B"), 1);
  });

  it("is deterministic for the same input", () => {
    const input = [
      timed("charlie", "C1", at(11), at(12)),
      timed("alice", "A1", at(8), at(9)),
      timed("bob", "B1", at(8, 30), at(10)),
      timed("alice", "A2", at(10), at(11)),
    ];
    assert.deepEqual(snapshot(calculateDayLayout(input)), snapshot(calculateDayLayout(input)));
  });

  it("lays out the spec example with per-user priority and compaction", () => {
    const lanes = calculateDayLayout([
      timed("alice", "A1", at(8), at(9)),
      timed("alice", "A2", at(10), at(11)),
      timed("alice", "A3", at(13), at(14)),
      timed("alice", "A4", at(15), at(16)),
      timed("bob", "B1", at(8, 30), at(10, 30)),
      timed("bob", "B2", at(12), at(13)),
      timed("charlie", "C1", at(11), at(12)),
      timed("charlie", "C2", at(14), at(15)),
      timed("dave", "D1", at(16), at(17)),
    ]);

    assert.ok(lanes.length < 4);
    assert.equal(laneIndexForTitle(lanes, "A1"), 0);
    assert.equal(laneIndexForTitle(lanes, "A2"), 0);
    assert.equal(laneIndexForTitle(lanes, "A3"), 0);
    assert.equal(laneIndexForTitle(lanes, "A4"), 0);
    assert.ok(laneIndexForTitle(lanes, "B1") > 0);
    assert.equal(laneIndexForTitle(lanes, "B1"), laneIndexForTitle(lanes, "B2"));
    assert.equal(laneIndexForTitle(lanes, "C1"), laneIndexForTitle(lanes, "C2"));
    assert.equal(laneIndexForTitle(lanes, "C1"), laneIndexForTitle(lanes, "D1"));
  });

  it("places a merged activity once on the busier user's lane and keeps both userIds", () => {
    const filmStart = at(20);
    const filmEnd = at(22);
    const lanes = calculateDayLayout([
      timed("alice", "Lecture", at(8), at(9)),
      timed("alice", "Lab", at(10), at(11)),
      timed("alice", "Film", filmStart, filmEnd, { source: "activity", id: "act-film" }),
      timed("bob", "Film", filmStart, filmEnd, { source: "activity", id: "act-film" }),
    ]);

    const filmCards = lanes.flat().filter((card) => card.title === "Film");
    assert.equal(filmCards.length, 1);
    assert.deepEqual(filmCards[0]?.userIds, ["alice", "bob"]);
    assert.equal(laneIndexForTitle(lanes, "Film"), laneIndexForTitle(lanes, "Lecture"));
  });
});
