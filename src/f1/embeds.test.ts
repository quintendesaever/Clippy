import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatF1DateTime } from "./timeFormat.js";
import { PRODUCTION_F1_TIMING } from "./config.js";
import { buildReminderPayload, buildResultsPayload } from "./embeds.js";
import { meetingsFromOpenF1 } from "./schedule.js";
import { buildStageSchedule } from "./stages.js";
import type { OpenF1Session } from "./openf1Client.js";
import type { F1RaceResults } from "./types.js";

function session(
  partial: Partial<OpenF1Session> &
    Pick<OpenF1Session, "session_key" | "session_name" | "date_start" | "meeting_key">
): OpenF1Session {
  return {
    year: 2026,
    is_cancelled: false,
    circuit_short_name: "Spa-Francorchamps",
    country_name: "Belgium",
    location: "Spa-Francorchamps",
    ...partial,
  };
}

const meeting = meetingsFromOpenF1([
  session({
    session_key: 1,
    session_name: "Qualifying",
    date_start: "2026-08-22T14:00:00.000Z",
    meeting_key: 80,
  }),
  session({
    session_key: 2,
    session_name: "Race",
    date_start: "2026-08-23T13:00:00.000Z",
    meeting_key: 80,
  }),
  session({
    session_key: 3,
    session_name: "Sprint",
    date_start: "2026-08-22T10:00:00.000Z",
    meeting_key: 80,
  }),
])[0]!;

const schedule = buildStageSchedule(meeting, PRODUCTION_F1_TIMING);
const tz = "Europe/Brussels";

describe("F1 reminder presentation", () => {
  it("formats times in the guild timezone rather than raw UTC/GMT+0", () => {
    const label = formatF1DateTime(meeting.qualifying!.dateStart, tz);
    assert.match(label, /16:00/);
    assert.doesNotMatch(label, /GMT\+0/);
    assert.doesNotMatch(label, /T14:00:00/);
  });

  it("mentions the role on prediction reminders and leads with deadline/quali/race", () => {
    const payload = buildReminderPayload({
      stage: "predictions_open",
      meeting,
      schedule,
      timezone: tz,
      roleId: "role-1",
      predictionUrl: "https://example.com/f1-predictions",
      now: new Date("2026-08-19T14:00:00.000Z"),
    });
    assert.match(payload.content, /<@&role-1>/);
    const json = payload.embeds[0]!.toJSON();
    const names = (json.fields ?? []).map((field) => field.name);
    assert.ok(names[0] === "Prediction deadline");
    assert.ok(names.includes("Qualifying"));
    assert.ok(names.includes("Race"));
    assert.ok(names.includes("Sprint"));
    assert.equal(payload.components.length, 1);
  });

  it("omits the prediction button when no URL is configured", () => {
    const payload = buildReminderPayload({
      stage: "final_prediction",
      meeting,
      schedule,
      timezone: tz,
      roleId: "role-1",
      predictionUrl: null,
      now: new Date("2026-08-22T11:00:00.000Z"),
    });
    assert.equal(payload.components.length, 0);
    assert.match(payload.content, /close soon/);
  });

  it("says predictions are locked on the race-soon reminder after the deadline", () => {
    const payload = buildReminderPayload({
      stage: "race_soon",
      meeting,
      schedule,
      timezone: tz,
      roleId: "role-1",
      predictionUrl: "https://example.com/f1-predictions",
      now: new Date("2026-08-23T12:05:00.000Z"),
    });
    assert.match(payload.content, /<@&role-1>/);
    assert.match(payload.embeds[0]!.toJSON().description ?? "", /locked/i);
  });

  it("does not mention the role on the post-race results message", () => {
    const results: F1RaceResults = {
      meetingId: meeting.id,
      meetingKey: meeting.meetingKey,
      meetingName: meeting.name,
      classification: [
        {
          driverNumber: 4,
          name: "Lando Norris",
          team: "McLaren",
          position: 1,
          grid: 1,
          status: "classified",
          statusText: null,
          points: 25,
        },
      ],
      fastestLap: {
        driverNumber: 4,
        name: "Lando Norris",
        team: "McLaren",
        timeLabel: "1:30.500",
        lapNumber: 12,
      },
      biggestGain: { driver: "Oscar Piastri", grid: 8, finish: 3, places: 5 },
      biggestLoss: null,
      dnfs: [],
      driverStandings: [{ position: 1, name: "Lando Norris", team: "McLaren", points: 200 }],
      constructorStandings: [{ position: 1, name: "McLaren", team: "McLaren", points: 380 }],
      pitStops: [],
    };
    const payload = buildResultsPayload({ meeting, results, timezone: tz });
    assert.equal(payload.content, "");
    assert.doesNotMatch(payload.content, /<@&/);
    const json = payload.embeds[0]!.toJSON();
    const names = (json.fields ?? []).map((field) => field.name);
    assert.ok(names.includes("Race result"));
    assert.ok(names.includes("Drivers championship"));
    assert.equal(payload.components.length, 1);
  });
});
