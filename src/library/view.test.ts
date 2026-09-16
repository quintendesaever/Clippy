import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLibraryDescription } from "./view.js";

describe("buildLibraryDescription", () => {
  it("lists visits by start time and shows an empty state", () => {
    const empty = buildLibraryDescription({
      dayKey: "2026-09-16",
      timezone: "Europe/Brussels",
      openMinutes: 480,
      closeMinutes: 1320,
      visits: [],
    });
    assert.match(empty, /Europe\/Brussels/);
    assert.match(empty, /08:00–22:00/);
    assert.match(empty, /No visits planned yet/);

    const filled = buildLibraryDescription({
      dayKey: "2026-09-16",
      timezone: "Europe/Brussels",
      openMinutes: 480,
      closeMinutes: 1320,
      visits: [
        {
          userId: "u2",
          startAt: "2026-09-16T11:00:00.000Z",
          endAt: "2026-09-16T13:00:00.000Z",
          displayName: "Bob",
        },
        {
          userId: "u1",
          startAt: "2026-09-16T07:00:00.000Z",
          endAt: "2026-09-16T10:00:00.000Z",
          displayName: "Alice",
        },
      ],
    });
    const aliceAt = filled.indexOf("Alice");
    const bobAt = filled.indexOf("Bob");
    assert.ok(aliceAt >= 0 && bobAt > aliceAt);
    assert.match(filled, /09:00–12:00/);
    assert.match(filled, /13:00–15:00/);
  });
});
