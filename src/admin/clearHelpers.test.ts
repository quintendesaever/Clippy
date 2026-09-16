import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLEAR_MAX,
  CLEAR_MIN,
  TWO_WEEKS_MS,
  formatClearResult,
  isValidClearCount,
  selectClearTargets,
} from "./clearHelpers.js";

describe("isValidClearCount", () => {
  it("accepts 1–100 integers only", () => {
    assert.equal(isValidClearCount(1), true);
    assert.equal(isValidClearCount(100), true);
    assert.equal(isValidClearCount(0), false);
    assert.equal(isValidClearCount(101), false);
    assert.equal(isValidClearCount(1.5), false);
    assert.equal(CLEAR_MIN, 1);
    assert.equal(CLEAR_MAX, 100);
  });
});

describe("selectClearTargets", () => {
  const now = 1_700_000_000_000;

  it("skips pinned messages and messages older than 14 days", () => {
    const messages = [
      { id: "fresh", pinned: false, createdTimestamp: now - 1000 },
      { id: "pin", pinned: true, createdTimestamp: now - 1000 },
      { id: "old", pinned: false, createdTimestamp: now - TWO_WEEKS_MS },
      { id: "oldPin", pinned: true, createdTimestamp: now - TWO_WEEKS_MS - 1 },
    ];
    const result = selectClearTargets(messages, now);
    assert.deepEqual(
      result.deletable.map((row) => row.id),
      ["fresh"]
    );
    assert.equal(result.skippedPinned, 2);
    assert.equal(result.skippedOld, 1);
  });
});

describe("formatClearResult", () => {
  it("reports deleted vs skipped reasons", () => {
    assert.equal(formatClearResult(3, 0, 0), "Deleted **3** message(s).");
    assert.equal(
      formatClearResult(2, 1, 3),
      "Deleted **2** message(s). Skipped 4 (1 pinned, 3 older than 14 days)."
    );
    assert.equal(formatClearResult(0, 2, 0), "Deleted **0** message(s). Skipped 2 (2 pinned).");
  });
});
