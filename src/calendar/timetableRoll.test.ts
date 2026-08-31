import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canRollStaleTimetableMessage } from "./timetableRoll.js";

describe("canRollStaleTimetableMessage", () => {
  it("always rolls the stored panel", () => {
    assert.equal(
      canRollStaleTimetableMessage({ isStoredPanel: true, inRecentHistory: false }),
      true
    );
  });

  it("rolls a non-panel message that is still in recent history", () => {
    assert.equal(
      canRollStaleTimetableMessage({ isStoredPanel: false, inRecentHistory: true }),
      true
    );
  });

  it("does not roll a buried non-panel message", () => {
    assert.equal(
      canRollStaleTimetableMessage({ isStoredPanel: false, inRecentHistory: false }),
      false
    );
  });
});
