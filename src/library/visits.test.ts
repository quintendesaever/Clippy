import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyVisitClear, applyVisitUpsert } from "./visitState.js";
import type { LibraryVisit } from "./types.js";

function visit(partial: Partial<LibraryVisit> = {}): LibraryVisit {
  return {
    id: partial.id ?? "v1",
    guild_id: "g1",
    user_id: "u1",
    day_key: "2026-09-16",
    start_at: "2026-09-16T07:00:00.000Z",
    end_at: "2026-09-16T10:00:00.000Z",
    ...partial,
  };
}

describe("same user/day visit upsert", () => {
  it("replaces the caller's visit for that day and keeps other rows", () => {
    const existing = [
      visit({ id: "alice-today", user_id: "u1", start_at: "2026-09-16T07:00:00.000Z" }),
      visit({ id: "bob-today", user_id: "u2", start_at: "2026-09-16T08:00:00.000Z" }),
      visit({
        id: "alice-tomorrow",
        user_id: "u1",
        day_key: "2026-09-17",
        start_at: "2026-09-17T07:00:00.000Z",
        end_at: "2026-09-17T10:00:00.000Z",
      }),
    ];
    const next = visit({
      id: "alice-updated",
      start_at: "2026-09-16T09:00:00.000Z",
      end_at: "2026-09-16T12:00:00.000Z",
    });
    const result = applyVisitUpsert(existing, next);
    assert.equal(result.length, 3);
    assert.equal(
      result.find((row) => row.user_id === "u1" && row.day_key === "2026-09-16")?.id,
      "alice-updated"
    );
    assert.equal(result.find((row) => row.user_id === "u2")?.id, "bob-today");
    assert.equal(result.find((row) => row.day_key === "2026-09-17")?.id, "alice-tomorrow");
    assert.deepEqual(
      result.map((row) => row.start_at),
      [...result].map((row) => row.start_at).sort()
    );
  });

  it("clears only the caller's current-day visit", () => {
    const existing = [
      visit({ id: "alice-today" }),
      visit({ id: "bob-today", user_id: "u2" }),
      visit({ id: "alice-tomorrow", day_key: "2026-09-17" }),
    ];
    const result = applyVisitClear(existing, { guild_id: "g1", user_id: "u1", day_key: "2026-09-16" });
    assert.deepEqual(
      result.map((row) => row.id).sort(),
      ["alice-tomorrow", "bob-today"]
    );
  });
});
