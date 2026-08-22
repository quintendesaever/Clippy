import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clipEventToGrid,
  createTimelineLayout,
  eventMergeKey,
  groupDayEvents,
  type LayoutEvent,
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
