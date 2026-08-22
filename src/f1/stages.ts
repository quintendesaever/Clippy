import type { F1Timing } from "./config.js";
import { PRODUCTION_F1_TIMING } from "./config.js";
import type { F1Meeting, F1ReminderStage, F1Session, F1StageSchedule } from "./types.js";

function usableSession(session: F1Session | null): F1Session | null {
  if (!session || session.cancelled) return null;
  return session;
}

const STAGE_RANK: Record<F1ReminderStage, number> = {
  predictions_open: 1,
  final_prediction: 2,
  race_soon: 3,
  results: 4,
};

export function buildStageSchedule(
  meeting: F1Meeting,
  timing: F1Timing = PRODUCTION_F1_TIMING
): F1StageSchedule {
  const qualifying = usableSession(meeting.qualifying);
  const race = usableSession(meeting.race);

  const predictionDeadline = qualifying
    ? new Date(qualifying.dateStart.getTime() - timing.predictionDeadlineBufferMs)
    : null;
  const predictionsOpenAt = predictionDeadline
    ? new Date(predictionDeadline.getTime() - timing.reminderOpenBeforeDeadlineMs)
    : null;
  const finalPredictionAt = predictionDeadline
    ? new Date(predictionDeadline.getTime() - timing.reminderFinalBeforeDeadlineMs)
    : null;

  const raceStart = race?.dateStart ?? null;
  const raceEnd = race ? (race.dateEnd ?? race.dateStart) : null;
  const raceSoonAt = raceStart
    ? new Date(raceStart.getTime() - timing.reminderRaceSoonBeforeMs)
    : null;
  const resultsCheckAt = raceEnd
    ? new Date(raceEnd.getTime() + timing.postRaceResultsDelayMs)
    : null;
  const resultsGiveUpAt = resultsCheckAt
    ? new Date(resultsCheckAt.getTime() + timing.resultsGiveUpAfterMs)
    : null;

  return {
    meetingId: meeting.id,
    meetingKey: meeting.meetingKey,
    meetingName: meeting.name,
    predictionDeadline,
    predictionsOpenAt,
    finalPredictionAt,
    raceSoonAt,
    raceStart,
    raceEnd,
    resultsCheckAt,
    resultsGiveUpAt,
    missingQualifying: !qualifying,
    missingRace: !race,
  };
}

export function latestRelevantStage(now: Date, schedule: F1StageSchedule): F1ReminderStage | null {
  const t = now.getTime();

  if (schedule.resultsCheckAt && t >= schedule.resultsCheckAt.getTime()) {
    return "results";
  }

  if (schedule.raceStart && t >= schedule.raceStart.getTime()) {
    return null;
  }

  if (schedule.raceSoonAt && t >= schedule.raceSoonAt.getTime()) {
    return "race_soon";
  }

  if (!schedule.predictionDeadline) {
    return null;
  }

  if (t >= schedule.predictionDeadline.getTime()) {
    return null;
  }

  if (schedule.finalPredictionAt && t >= schedule.finalPredictionAt.getTime()) {
    return "final_prediction";
  }

  if (schedule.predictionsOpenAt && t >= schedule.predictionsOpenAt.getTime()) {
    return "predictions_open";
  }

  return null;
}

export function selectDueStage(
  now: Date,
  schedule: F1StageSchedule,
  lastSent: F1ReminderStage | null,
  lastMeetingId: string | null
): F1ReminderStage | null {
  const due = latestRelevantStage(now, schedule);
  if (!due) return null;

  const sent = lastMeetingId === schedule.meetingId ? lastSent : null;
  if (sent === due) return null;
  if (sent && STAGE_RANK[sent] >= STAGE_RANK[due]) return null;
  return due;
}

export function isResultsGiveUp(now: Date, schedule: F1StageSchedule): boolean {
  return Boolean(schedule.resultsGiveUpAt && now.getTime() >= schedule.resultsGiveUpAt.getTime());
}

export type F1NextAction = {
  stage: F1ReminderStage | "idle";
  at: Date | null;
  label: string;
  waitingForResults: boolean;
};

export function nextScheduledAction(
  now: Date,
  schedule: F1StageSchedule,
  lastSent: F1ReminderStage | null,
  lastMeetingId: string | null
): F1NextAction {
  const due = selectDueStage(now, schedule, lastSent, lastMeetingId);
  if (due === "results") {
    if (isResultsGiveUp(now, schedule)) {
      return {
        stage: "results",
        at: schedule.resultsGiveUpAt,
        label: "gave up waiting for published results",
        waitingForResults: false,
      };
    }
    return {
      stage: "results",
      at: schedule.resultsCheckAt,
      label: "waiting for published race results and standings",
      waitingForResults: true,
    };
  }
  if (due) {
    return { stage: due, at: now, label: `send ${due} now`, waitingForResults: false };
  }

  const t = now.getTime();
  const sent = lastMeetingId === schedule.meetingId ? lastSent : null;
  const candidates: { stage: F1ReminderStage; at: Date }[] = [];
  if (schedule.predictionsOpenAt && (!sent || STAGE_RANK[sent] < STAGE_RANK.predictions_open)) {
    candidates.push({ stage: "predictions_open", at: schedule.predictionsOpenAt });
  }
  if (schedule.finalPredictionAt && (!sent || STAGE_RANK[sent] < STAGE_RANK.final_prediction)) {
    candidates.push({ stage: "final_prediction", at: schedule.finalPredictionAt });
  }
  if (
    schedule.raceSoonAt &&
    (!sent || STAGE_RANK[sent] < STAGE_RANK.race_soon) &&
    (!schedule.raceStart || t < schedule.raceStart.getTime())
  ) {
    candidates.push({ stage: "race_soon", at: schedule.raceSoonAt });
  }
  if (schedule.resultsCheckAt && sent !== "results") {
    candidates.push({ stage: "results", at: schedule.resultsCheckAt });
  }

  const upcoming = candidates
    .filter((item) => item.at.getTime() > t)
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  if (upcoming) {
    return {
      stage: upcoming.stage,
      at: upcoming.at,
      label: `wait until ${upcoming.stage}`,
      waitingForResults: false,
    };
  }

  return { stage: "idle", at: null, label: "idle", waitingForResults: false };
}

export function meetingStillActive(now: Date, schedule: F1StageSchedule, jobIntervalMs = 0): boolean {
  if (schedule.resultsGiveUpAt) {
    return now.getTime() < schedule.resultsGiveUpAt.getTime() + jobIntervalMs;
  }
  if (schedule.predictionDeadline) {
    return now.getTime() < schedule.predictionDeadline.getTime();
  }
  return false;
}

export function findActiveMeetingBySchedule(
  meetings: F1Meeting[],
  now: Date,
  timing: F1Timing = PRODUCTION_F1_TIMING
): F1Meeting | null {
  for (const meeting of meetings) {
    const schedule = buildStageSchedule(meeting, timing);
    if (meetingStillActive(now, schedule, timing.jobIntervalMs)) return meeting;
  }
  return null;
}
