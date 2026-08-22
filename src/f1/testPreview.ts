import type { Client } from "discord.js";
import { getGuildTimezone } from "../stats/helpers.js";
import { createDiscordPort } from "./discordPort.js";
import { replaceActiveF1Message, type F1DiscordPort } from "./messageLifecycle.js";
import { resolvePredictionUrl } from "./predictionUrl.js";
import {
  getF1ReminderSettings,
  upsertF1ReminderSettings,
  type F1ReminderSettings,
} from "./reminderStorage.js";
import { fetchSeasonMeetings, findActiveMeeting } from "./schedule.js";
import { getF1Timing } from "./config.js";
import { buildF1TestPayload } from "./testPayload.js";
import type { F1Meeting, F1ReminderStage } from "./types.js";

export { buildF1TestPayload, F1_TEST_STAGES, isF1TestStage } from "./testPayload.js";

export async function resolveMeetingForPreview(
  now: Date = new Date()
): Promise<F1Meeting | null> {
  const timing = getF1Timing();
  const meetings = await fetchSeasonMeetings(now);
  return findActiveMeeting(meetings, now, timing) ?? meetings[meetings.length - 1] ?? null;
}

/**
 * Sends a preview through the real delete→send→persist message lifecycle.
 * Updates only active_message_id. Never writes last_stage_sent or meeting schedule fields.
 */
export async function sendF1TestPreview(options: {
  guildId: string;
  stage: F1ReminderStage;
  now?: Date;
  client?: Client;
  discord?: F1DiscordPort;
}): Promise<
  | { ok: true; messageId: string; meetingName: string; previousStage: string | null }
  | { ok: false; reason: string }
> {
  const { guildId, stage } = options;
  const now = options.now ?? new Date();
  const discord = options.discord ?? (options.client ? createDiscordPort(options.client) : null);
  if (!discord) {
    return { ok: false, reason: "no_discord" };
  }
  const settings = await getF1ReminderSettings(guildId);
  if (!settings?.channel_id || !settings?.role_id) {
    return { ok: false, reason: "channel_and_role_required" };
  }

  const meeting = await resolveMeetingForPreview(now);
  if (!meeting) {
    return { ok: false, reason: "no_meeting" };
  }

  const timezone = await getGuildTimezone(guildId);
  const payload = buildF1TestPayload({
    stage,
    meeting,
    timezone,
    roleId: settings.role_id,
    predictionUrl: resolvePredictionUrl(settings.prediction_url, process.env.F1_PREDICTION_URL),
    now,
  });

  const previousStage = settings.last_stage_sent;
  const replaced = await replaceActiveF1Message({
    guildId,
    channelId: settings.channel_id,
    settings,
    payload,
    discord,
    storage: { upsert: upsertF1ReminderSettings },
  });

  if (!replaced.ok) {
    return { ok: false, reason: replaced.reason };
  }

  return {
    ok: true,
    messageId: replaced.messageId,
    meetingName: meeting.name,
    previousStage,
  };
}

export type F1ScheduleSnapshot = Pick<
  F1ReminderSettings,
  "last_stage_sent" | "current_meeting_id" | "qualifying_start_at" | "race_start_at"
>;

export function scheduleSnapshot(settings: F1ReminderSettings): F1ScheduleSnapshot {
  return {
    last_stage_sent: settings.last_stage_sent,
    current_meeting_id: settings.current_meeting_id,
    qualifying_start_at: settings.qualifying_start_at,
    race_start_at: settings.race_start_at,
  };
}
