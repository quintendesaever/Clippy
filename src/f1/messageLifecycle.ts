import type { F1MessagePayload } from "./embeds.js";
import type { F1ReminderSettings } from "./reminderStorage.js";
import type { F1ReminderStage } from "./types.js";

export type F1DiscordPort = {
  fetchChannel(channelId: string): Promise<{ id: string } | null>;
  deleteMessage(channelId: string, messageId: string): Promise<"deleted" | "missing" | "failed">;
  sendMessage(channelId: string, payload: F1MessagePayload): Promise<{ messageId: string } | null>;
};

export type F1SettingsPort = {
  upsert(
    partial: Partial<F1ReminderSettings> & { guild_id: string }
  ): Promise<F1ReminderSettings | null>;
};

export type ReplaceActiveResult =
  | { ok: true; messageId: string; settings: F1ReminderSettings }
  | { ok: false; reason: "no_channel" | "clear_failed" | "send_failed" | "persist_failed" };

export async function replaceActiveF1Message(options: {
  guildId: string;
  channelId: string;
  settings: F1ReminderSettings;
  payload: F1MessagePayload;
  discord: F1DiscordPort;
  storage: F1SettingsPort;
  persist?: {
    stage?: F1ReminderStage | null;
    meetingId?: string | null;
    qualifyingStartAt?: string | null;
    raceStartAt?: string | null;
  };
}): Promise<ReplaceActiveResult> {
  const { guildId, channelId, settings, payload, discord, storage, persist } = options;

  const channel = await discord.fetchChannel(channelId);
  if (!channel) {
    console.warn(`f1 reminder: channel ${channelId} missing for guild ${guildId}`);
    return { ok: false, reason: "no_channel" };
  }

  const previousId = settings.active_message_id;
  if (previousId) {
    const deleted = await discord.deleteMessage(channelId, previousId);
    if (deleted === "failed") {
      console.warn(`f1 reminder: failed to delete previous message ${previousId}`);
    }
    const cleared = await storage.upsert({
      guild_id: guildId,
      active_message_id: null,
    });
    if (!cleared) {
      console.error("f1 reminder: failed to clear active_message_id after delete");
      return { ok: false, reason: "clear_failed" };
    }
  }

  const sent = await discord.sendMessage(channelId, payload);
  if (!sent) {
    console.error("f1 reminder: failed to send replacement message");
    return { ok: false, reason: "send_failed" };
  }

  const saved = await storage.upsert({
    guild_id: guildId,
    active_message_id: sent.messageId,
    ...(persist?.stage !== undefined ? { last_stage_sent: persist.stage } : {}),
    ...(persist?.meetingId !== undefined ? { current_meeting_id: persist.meetingId } : {}),
    ...(persist?.qualifyingStartAt !== undefined
      ? { qualifying_start_at: persist.qualifyingStartAt }
      : {}),
    ...(persist?.raceStartAt !== undefined ? { race_start_at: persist.raceStartAt } : {}),
  });

  if (!saved) {
    console.error("f1 reminder: persist failed after send; rolling back Discord message");
    await discord.deleteMessage(channelId, sent.messageId);
    return { ok: false, reason: "persist_failed" };
  }

  return { ok: true, messageId: sent.messageId, settings: saved };
}
