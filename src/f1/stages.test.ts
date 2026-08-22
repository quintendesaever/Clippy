import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRODUCTION_F1_TIMING } from "./config.js";
import { meetingsFromOpenF1 } from "./schedule.js";
import { buildStageSchedule, latestRelevantStage, selectDueStage, nextScheduledAction } from "./stages.js";
import type { OpenF1Session } from "./openf1Client.js";
import type { F1Meeting } from "./types.js";

function session(
  partial: Partial<OpenF1Session> &
    Pick<OpenF1Session, "session_key" | "session_name" | "date_start" | "meeting_key">
): OpenF1Session {
  return {
    year: 2026,
    is_cancelled: false,
    circuit_short_name: "Monza",
    country_name: "Italy",
    location: "Monza",
    ...partial,
  };
}

function normalWeekend(): F1Meeting {
  return meetingsFromOpenF1([
    session({
      session_key: 1,
      session_name: "Qualifying",
      date_start: "2026-08-22T14:00:00.000Z",
      meeting_key: 50,
    }),
    session({
      session_key: 2,
      session_name: "Race",
      date_start: "2026-08-23T13:00:00.000Z",
      date_end: "2026-08-23T14:30:00.000Z",
      meeting_key: 50,
    }),
  ])[0]!;
}

describe("buildStageSchedule", () => {
  it("sets the prediction deadline 15 minutes before qualifying", () => {
    const schedule = buildStageSchedule(normalWeekend(), PRODUCTION_F1_TIMING);
    assert.equal(schedule.predictionDeadline?.toISOString(), "2026-08-22T13:45:00.000Z");
    assert.equal(schedule.predictionsOpenAt?.toISOString(), "2026-08-19T13:45:00.000Z");
    assert.equal(schedule.finalPredictionAt?.toISOString(), "2026-08-22T10:45:00.000Z");
    assert.equal(schedule.raceSoonAt?.toISOString(), "2026-08-23T12:00:00.000Z");
    assert.equal(schedule.resultsCheckAt?.toISOString(), "2026-08-23T15:15:00.000Z");
    assert.equal(schedule.missingQualifying, false);
  });

  it("uses race.date_end for resultsCheckAt and race.date_start for race-soon", () => {
    const schedule = buildStageSchedule(normalWeekend(), PRODUCTION_F1_TIMING);
    assert.equal(schedule.raceStart?.toISOString(), "2026-08-23T13:00:00.000Z");
    assert.equal(schedule.raceEnd?.toISOString(), "2026-08-23T14:30:00.000Z");
    assert.notEqual(schedule.raceSoonAt?.toISOString(), schedule.resultsCheckAt?.toISOString());
  });

  it("falls back to race.date_start when date_end is missing", () => {
    const meeting = meetingsFromOpenF1([
      session({
        session_key: 1,
        session_name: "Qualifying",
        date_start: "2026-08-22T14:00:00.000Z",
        meeting_key: 51,
      }),
      session({
        session_key: 2,
        session_name: "Race",
        date_start: "2026-08-23T13:00:00.000Z",
        meeting_key: 51,
      }),
    ])[0]!;
    const schedule = buildStageSchedule(meeting, PRODUCTION_F1_TIMING);
    assert.equal(schedule.raceEnd?.toISOString(), "2026-08-23T13:00:00.000Z");
    assert.equal(schedule.resultsCheckAt?.toISOString(), "2026-08-23T13:45:00.000Z");
  });

  it("does not invent a deadline when qualifying is missing or cancelled", () => {
    const cancelled = meetingsFromOpenF1([
      session({
        session_key: 1,
        session_name: "Qualifying",
        date_start: "2026-08-22T14:00:00.000Z",
        meeting_key: 52,
        is_cancelled: true,
      }),
      session({
        session_key: 2,
        session_name: "Race",
        date_start: "2026-08-23T13:00:00.000Z",
        meeting_key: 52,
      }),
    ])[0]!;
    const schedule = buildStageSchedule(cancelled, PRODUCTION_F1_TIMING);
    assert.equal(schedule.predictionDeadline, null);
    assert.equal(schedule.missingQualifying, true);
    assert.equal(schedule.raceSoonAt?.toISOString(), "2026-08-23T12:00:00.000Z");
  });
});

describe("selectDueStage catch-up", () => {
  const schedule = buildStageSchedule(normalWeekend(), PRODUCTION_F1_TIMING);

  it("sends predictions_open at the 3-day mark", () => {
    const now = new Date("2026-08-19T13:45:00.000Z");
    assert.equal(latestRelevantStage(now, schedule), "predictions_open");
    assert.equal(selectDueStage(now, schedule, null, null), "predictions_open");
  });

  it("sends the final reminder 3 hours before the deadline", () => {
    const now = new Date("2026-08-22T10:45:00.000Z");
    assert.equal(selectDueStage(now, schedule, "predictions_open", "2026-50"), "final_prediction");
  });

  it("does not replay the 3-day reminder if the bot returns 30 minutes before the deadline", () => {
    const now = new Date("2026-08-22T13:15:00.000Z");
    assert.equal(selectDueStage(now, schedule, null, null), "final_prediction");
    assert.notEqual(selectDueStage(now, schedule, null, null), "predictions_open");
  });

  it("does not send a prediction reminder after the deadline", () => {
    const now = new Date("2026-08-22T16:00:00.000Z");
    assert.equal(selectDueStage(now, schedule, null, null), null);
  });

  it("sends race-soon immediately if restart happens inside the 1-hour window", () => {
    const now = new Date("2026-08-23T12:30:00.000Z");
    assert.equal(selectDueStage(now, schedule, "final_prediction", "2026-50"), "race_soon");
    assert.equal(selectDueStage(now, schedule, null, null), "race_soon");
  });

  it("skips reminder stages after the race and waits for resultsCheckAt", () => {
    const duringRace = new Date("2026-08-23T13:10:00.000Z");
    assert.equal(selectDueStage(duringRace, schedule, "race_soon", "2026-50"), null);
    const afterCheck = new Date("2026-08-23T15:15:00.000Z");
    assert.equal(selectDueStage(afterCheck, schedule, "race_soon", "2026-50"), "results");
  });

  it("still requests results after resultsCheckAt even if the bot missed every reminder", () => {
    const afterCheck = new Date("2026-08-23T15:15:00.000Z");
    assert.equal(selectDueStage(afterCheck, schedule, null, null), "results");
  });

  it("does not send duplicate stages after restart", () => {
    const now = new Date("2026-08-22T11:00:00.000Z");
    assert.equal(selectDueStage(now, schedule, "final_prediction", "2026-50"), null);
  });

  it("does not go backwards if a later stage was already sent", () => {
    const now = new Date("2026-08-19T14:00:00.000Z");
    assert.equal(selectDueStage(now, schedule, "final_prediction", "2026-50"), null);
  });
});

describe("nextScheduledAction", () => {
  const schedule = buildStageSchedule(normalWeekend(), PRODUCTION_F1_TIMING);

  it("reports the next future stage before the 3-day window", () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const next = nextScheduledAction(now, schedule, null, null);
    assert.equal(next.stage, "predictions_open");
    assert.equal(next.at?.toISOString(), "2026-08-19T13:45:00.000Z");
    assert.equal(next.waitingForResults, false);
  });

  it("says send now when a stage is due", () => {
    const now = new Date("2026-08-22T13:15:00.000Z");
    const next = nextScheduledAction(now, schedule, null, null);
    assert.equal(next.stage, "final_prediction");
    assert.match(next.label, /send final_prediction now/);
  });

  it("waits for published results after resultsCheckAt until data exists", () => {
    const now = new Date("2026-08-23T15:20:00.000Z");
    const next = nextScheduledAction(now, schedule, "race_soon", "2026-50");
    assert.equal(next.stage, "results");
    assert.equal(next.waitingForResults, true);
  });
});
