import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySessionName, meetingsFromOpenF1, findActiveMeeting } from "./schedule.js";
import { PRODUCTION_F1_TIMING } from "./config.js";
import type { OpenF1Meeting, OpenF1Session } from "./openf1Client.js";

function session(partial: Partial<OpenF1Session> & Pick<OpenF1Session, "session_key" | "session_name" | "date_start" | "meeting_key">): OpenF1Session {
  return {
    year: 2026,
    is_cancelled: false,
    circuit_short_name: "Spa-Francorchamps",
    country_name: "Belgium",
    location: "Spa-Francorchamps",
    ...partial,
  };
}

describe("classifySessionName", () => {
  it("treats Qualifying as GP qualifying and ignores sprint qualifying names", () => {
    assert.equal(classifySessionName("Qualifying"), "qualifying");
    assert.equal(classifySessionName("Sprint Qualifying"), null);
    assert.equal(classifySessionName("Sprint Shootout"), null);
  });

  it("distinguishes race from sprint", () => {
    assert.equal(classifySessionName("Race"), "race");
    assert.equal(classifySessionName("Sprint"), "sprint");
    assert.equal(classifySessionName("Practice 1"), null);
  });
});

describe("meetingsFromOpenF1", () => {
  it("builds a normal weekend with qualifying and race on different days", () => {
    const meetings = meetingsFromOpenF1([
      session({
        session_key: 1,
        session_name: "Qualifying",
        date_start: "2026-08-22T14:00:00+00:00",
        meeting_key: 100,
      }),
      session({
        session_key: 2,
        session_name: "Race",
        date_start: "2026-08-23T13:00:00+00:00",
        date_end: "2026-08-23T14:30:00+00:00",
        meeting_key: 100,
      }),
    ]);
    assert.equal(meetings.length, 1);
    assert.equal(meetings[0]!.id, "2026-100");
    assert.equal(meetings[0]!.qualifying?.dateStart.toISOString(), "2026-08-22T14:00:00.000Z");
    assert.equal(meetings[0]!.race?.dateStart.toISOString(), "2026-08-23T13:00:00.000Z");
    assert.equal(meetings[0]!.sprint, null);
  });

  it("includes sprint on a sprint weekend without using it as qualifying", () => {
    const meetings = meetingsFromOpenF1(
      [
        session({
          session_key: 10,
          session_name: "Sprint Qualifying",
          date_start: "2026-05-01T14:00:00+00:00",
          meeting_key: 200,
        }),
        session({
          session_key: 11,
          session_name: "Sprint",
          date_start: "2026-05-02T14:00:00+00:00",
          meeting_key: 200,
        }),
        session({
          session_key: 12,
          session_name: "Qualifying",
          date_start: "2026-05-02T18:00:00+00:00",
          meeting_key: 200,
        }),
        session({
          session_key: 13,
          session_name: "Race",
          date_start: "2026-05-03T13:00:00+00:00",
          meeting_key: 200,
        }),
      ],
      [{ meeting_key: 200, meeting_name: "Miami Grand Prix", year: 2026, country_name: "USA" } satisfies OpenF1Meeting]
    );
    assert.equal(meetings[0]!.name, "Miami Grand Prix");
    assert.equal(meetings[0]!.sprint?.sessionKey, 11);
    assert.equal(meetings[0]!.qualifying?.sessionKey, 12);
  });

  it("keeps cancelled qualifying visible but not usable via cancelled flag", () => {
    const meetings = meetingsFromOpenF1([
      session({
        session_key: 1,
        session_name: "Qualifying",
        date_start: "2026-08-22T14:00:00+00:00",
        meeting_key: 300,
        is_cancelled: true,
      }),
      session({
        session_key: 2,
        session_name: "Race",
        date_start: "2026-08-23T13:00:00+00:00",
        meeting_key: 300,
      }),
    ]);
    assert.equal(meetings[0]!.qualifying?.cancelled, true);
    assert.equal(meetings[0]!.race?.cancelled, false);
  });
});

describe("findActiveMeeting", () => {
  it("skips a meeting whose results retry window has expired", () => {
    const meetings = meetingsFromOpenF1([
      session({
        session_key: 1,
        session_name: "Qualifying",
        date_start: "2026-03-01T14:00:00+00:00",
        meeting_key: 1,
      }),
      session({
        session_key: 2,
        session_name: "Race",
        date_start: "2026-03-02T13:00:00+00:00",
        date_end: "2026-03-02T14:30:00+00:00",
        meeting_key: 1,
      }),
      session({
        session_key: 3,
        session_name: "Qualifying",
        date_start: "2026-08-22T14:00:00+00:00",
        meeting_key: 2,
      }),
      session({
        session_key: 4,
        session_name: "Race",
        date_start: "2026-08-23T13:00:00+00:00",
        meeting_key: 2,
      }),
    ]);
    const now = new Date("2026-08-20T00:00:00.000Z");
    const active = findActiveMeeting(meetings, now, PRODUCTION_F1_TIMING);
    assert.equal(active?.meetingKey, 2);
  });
});
