import { getF1Timing } from "./config.js";
import { buildReminderPayload, buildResultsPayload, type F1MessagePayload } from "./embeds.js";
import { buildPreviewRaceResults } from "./previewResults.js";
import { buildStageSchedule } from "./stages.js";
import type { F1Meeting, F1ReminderStage } from "./types.js";

export const F1_TEST_STAGES: F1ReminderStage[] = [
  "predictions_open",
  "final_prediction",
  "race_soon",
  "results",
];

export function isF1TestStage(value: string): value is F1ReminderStage {
  return (F1_TEST_STAGES as string[]).includes(value);
}

export function buildF1TestPayload(options: {
  stage: F1ReminderStage;
  meeting: F1Meeting;
  timezone: string;
  roleId: string;
  predictionUrl: string | null;
  now?: Date;
}): F1MessagePayload {
  const { stage, meeting, timezone, roleId, predictionUrl, now } = options;
  const schedule = buildStageSchedule(meeting, getF1Timing());
  if (stage === "results") {
    return buildResultsPayload({
      meeting,
      results: buildPreviewRaceResults(meeting),
      timezone,
      preview: true,
    });
  }
  return buildReminderPayload({
    stage,
    meeting,
    schedule,
    timezone,
    roleId,
    predictionUrl,
    now: now ?? new Date(),
    test: true,
  });
}
