import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withoutEmptyWeekendDays } from "./weekDays.js";

describe("withoutEmptyWeekendDays", () => {
  it("hides Saturday and Sunday when both are empty", () => {
    const days = ["ma", "di", "wo", "do", "vr", "za", "zo"];
    const busy = new Set(["ma", "wo"]);
    assert.deepEqual(
      withoutEmptyWeekendDays(days, (day) => busy.has(day)),
      ["ma", "di", "wo", "do", "vr"]
    );
  });

  it("keeps Saturday when Sunday has events", () => {
    const days = ["ma", "di", "wo", "do", "vr", "za", "zo"];
    const busy = new Set(["zo"]);
    assert.deepEqual(
      withoutEmptyWeekendDays(days, (day) => busy.has(day)),
      days
    );
  });

  it("hides only Sunday when Saturday has events", () => {
    const days = ["ma", "di", "wo", "do", "vr", "za", "zo"];
    const busy = new Set(["za"]);
    assert.deepEqual(
      withoutEmptyWeekendDays(days, (day) => busy.has(day)),
      ["ma", "di", "wo", "do", "vr", "za"]
    );
  });
});
