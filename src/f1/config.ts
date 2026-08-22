export const PREDICTION_DEADLINE_BUFFER_MS = 15 * 60 * 1000;
export const REMINDER_OPEN_BEFORE_DEADLINE_MS = 3 * 24 * 60 * 60 * 1000;
export const REMINDER_FINAL_BEFORE_DEADLINE_MS = 3 * 60 * 60 * 1000;
export const REMINDER_RACE_SOON_BEFORE_MS = 60 * 60 * 1000;
export const POST_RACE_RESULTS_DELAY_MS = 45 * 60 * 1000;
export const RESULTS_GIVE_UP_AFTER_MS = 6 * 60 * 60 * 1000;
export const F1_JOB_INTERVAL_MS = 60 * 1000;
export const F1_SCHEDULE_CACHE_TTL_MS = 60 * 60 * 1000;

export const TEST_PREDICTION_DEADLINE_BUFFER_MS = 15 * 1000;
export const TEST_REMINDER_OPEN_BEFORE_DEADLINE_MS = 3 * 60 * 1000;
export const TEST_REMINDER_FINAL_BEFORE_DEADLINE_MS = 60 * 1000;
export const TEST_REMINDER_RACE_SOON_BEFORE_MS = 30 * 1000;
export const TEST_POST_RACE_RESULTS_DELAY_MS = 20 * 1000;
export const TEST_RESULTS_GIVE_UP_AFTER_MS = 10 * 60 * 1000;
export const TEST_F1_JOB_INTERVAL_MS = 5 * 1000;

export type F1Timing = {
  predictionDeadlineBufferMs: number;
  reminderOpenBeforeDeadlineMs: number;
  reminderFinalBeforeDeadlineMs: number;
  reminderRaceSoonBeforeMs: number;
  postRaceResultsDelayMs: number;
  resultsGiveUpAfterMs: number;
  jobIntervalMs: number;
};

export const PRODUCTION_F1_TIMING: F1Timing = {
  predictionDeadlineBufferMs: PREDICTION_DEADLINE_BUFFER_MS,
  reminderOpenBeforeDeadlineMs: REMINDER_OPEN_BEFORE_DEADLINE_MS,
  reminderFinalBeforeDeadlineMs: REMINDER_FINAL_BEFORE_DEADLINE_MS,
  reminderRaceSoonBeforeMs: REMINDER_RACE_SOON_BEFORE_MS,
  postRaceResultsDelayMs: POST_RACE_RESULTS_DELAY_MS,
  resultsGiveUpAfterMs: RESULTS_GIVE_UP_AFTER_MS,
  jobIntervalMs: F1_JOB_INTERVAL_MS,
};

export const TEST_F1_TIMING: F1Timing = {
  predictionDeadlineBufferMs: TEST_PREDICTION_DEADLINE_BUFFER_MS,
  reminderOpenBeforeDeadlineMs: TEST_REMINDER_OPEN_BEFORE_DEADLINE_MS,
  reminderFinalBeforeDeadlineMs: TEST_REMINDER_FINAL_BEFORE_DEADLINE_MS,
  reminderRaceSoonBeforeMs: TEST_REMINDER_RACE_SOON_BEFORE_MS,
  postRaceResultsDelayMs: TEST_POST_RACE_RESULTS_DELAY_MS,
  resultsGiveUpAfterMs: TEST_RESULTS_GIVE_UP_AFTER_MS,
  jobIntervalMs: TEST_F1_JOB_INTERVAL_MS,
};

export function isF1TestMode(): boolean {
  const v = process.env.F1_REMINDER_TEST?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function getF1Timing(): F1Timing {
  return isF1TestMode() ? TEST_F1_TIMING : PRODUCTION_F1_TIMING;
}

export const F1_EMBED_COLOR = 0xe10600;
export const F1_STATS_CUSTOM_ID_PREFIX = "f1:stats:";
export const F1_STATS_PREVIEW_CUSTOM_ID = "f1:stats:preview";
