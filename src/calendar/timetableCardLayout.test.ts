import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CARD_INNER_PAD,
  GRID_INSET_X,
  ROW_HEIGHT,
  TIMETABLE_WIDTH,
} from "../../shared/timetable/theme.js";
import { createTimelineLayout } from "../../shared/timetable/layout.js";
import {
  collectAvatarUserIds,
  estimateTextWidth,
  planCardContent,
} from "./timetableCardLayout.js";

function innerWidthForHours(hours: number): number {
  const layout = createTimelineLayout([], "UTC", TIMETABLE_WIDTH, GRID_INSET_X, {
    hourStart: 8,
    hourEnd: 18,
  });
  return Math.max(layout.colWidth * hours - CARD_INNER_PAD * 2, 0);
}

describe("collectAvatarUserIds", () => {
  it("includes participant ids, not only event.userId", () => {
    assert.deepEqual(
      collectAvatarUserIds([
        { userId: "owner", participantIds: ["a", "b", "owner"] },
        { userId: "ics-only" },
      ]),
      ["owner", "a", "b", "ics-only"]
    );
  });
});

describe("planCardContent", () => {
  it("keeps the canvas width at 1100px", () => {
    assert.equal(TIMETABLE_WIDTH, 1100);
  });

  it("fits the full time range and all avatars on a one-hour card", () => {
    const innerW = innerWidthForHours(1);
    const timeLabel = "08:00–09:00";
    const plan = planCardContent({
      innerW,
      innerH: ROW_HEIGHT - CARD_INNER_PAD * 2,
      timeLabel,
      avatarCount: 3,
      badgeLabel: "activiteit",
    });

    assert.equal(plan.shownCount, 3);
    assert.ok(plan.avatarSize > 0);
    assert.ok(estimateTextWidth(timeLabel, plan.timeSize) <= innerW);
    assert.equal(plan.stackAvatarsAbove, true);
  });

  it("shows every participant avatar on a two-hour shared card", () => {
    const plan = planCardContent({
      innerW: innerWidthForHours(2),
      innerH: ROW_HEIGHT - CARD_INNER_PAD * 2,
      timeLabel: "08:00–10:00",
      avatarCount: 4,
      badgeLabel: "hoorcollege",
    });

    assert.equal(plan.shownCount, 4);
    assert.ok(plan.avatarSize > 0);
    assert.ok(plan.pillFont >= 13);
  });
});
