import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OUTER_PAD_X, TIMETABLE_WIDTH } from "../../shared/timetable/theme.js";
import { makeEvent, makeTimetable } from "./timetableTestFixtures.js";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-key";

const { TIMETABLE_RENDERER_VERSION, buildTimelineSvg } = await import("./timetableImage.js");

const AVATAR = "data:image/png;base64,aaa";

describe("buildTimelineSvg card content", () => {
  it("keeps the inner canvas at 1100px and bumps the renderer cache version", () => {
    assert.equal(TIMETABLE_WIDTH, 1100);
    assert.equal(TIMETABLE_RENDERER_VERSION, 2);
    const timetable = makeTimetable([makeEvent()]);
    const svg = buildTimelineSvg(timetable, "2026-08-17", new Map());
    const expectedWidth = TIMETABLE_WIDTH + 2 * OUTER_PAD_X;
    assert.match(svg, new RegExp(`width="${expectedWidth}"`));
    assert.match(svg, new RegExp(`viewBox="0 0 ${expectedWidth} `));
  });

  it("keeps the full one-hour time range and every participant avatar", () => {
    const timetable = makeTimetable([
      makeEvent({
        userId: "u1",
        participantIds: ["u1", "u2", "u3"],
        start: new Date("2026-08-17T08:00:00.000Z"),
        end: new Date("2026-08-17T09:00:00.000Z"),
        source: "activity",
        id: "act-1",
        typeBadges: ["A"],
        title: "Etentje",
      }),
    ]);
    const avatars = new Map([
      ["u1", AVATAR],
      ["u2", AVATAR],
      ["u3", AVATAR],
    ]);
    const svg = buildTimelineSvg(timetable, "2026-08-17", avatars);
    assert.match(svg, /08:00–09:00/);
    assert.match(svg, /Etentje/);
    assert.equal(false, svg.includes("-time"));
    assert.equal((svg.match(/<image /g) ?? []).length, 3);
  });
});
