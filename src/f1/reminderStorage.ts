import { supabase } from "../supabase.js";
import { ensureChannel } from "../stats/channels.js";
import { ensureGuild } from "../stats/helpers.js";
import type { F1ReminderStage } from "./types.js";

export type F1ReminderSettings = {
  guild_id: string;
  enabled: boolean;
  channel_id: string | null;
  role_id: string | null;
  last_race_id_notified: string | null;
  prediction_url: string | null;
  active_message_id: string | null;
  current_meeting_id: string | null;
  last_stage_sent: F1ReminderStage | null;
  qualifying_start_at: string | null;
  race_start_at: string | null;
  created_at?: string;
  updated_at?: string;
};

const TABLE_NAME = "f1_reminder_settings";

const EMPTY_SETTINGS = (guildId: string): F1ReminderSettings => ({
  guild_id: guildId,
  enabled: false,
  channel_id: null,
  role_id: null,
  last_race_id_notified: null,
  prediction_url: null,
  active_message_id: null,
  current_meeting_id: null,
  last_stage_sent: null,
  qualifying_start_at: null,
  race_start_at: null,
});

export async function getF1ReminderSettings(
  guildId: string
): Promise<F1ReminderSettings | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("guild_id", guildId)
    .maybeSingle<F1ReminderSettings>();

  if (error) {
    console.error("f1 reminder: get settings error", error);
    return null;
  }

  return data ?? null;
}

export async function upsertF1ReminderSettings(
  partial: Partial<F1ReminderSettings> & { guild_id: string }
): Promise<F1ReminderSettings | null> {
  const existing = await getF1ReminderSettings(partial.guild_id);
  const base = existing ?? EMPTY_SETTINGS(partial.guild_id);
  const payload: F1ReminderSettings = {
    ...base,
    ...partial,
    updated_at: new Date().toISOString(),
  };

  await ensureGuild(payload.guild_id);
  if (payload.channel_id) {
    await ensureChannel(payload.guild_id, payload.channel_id);
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(payload, { onConflict: "guild_id" })
    .select("*")
    .maybeSingle<F1ReminderSettings>();

  if (error) {
    console.error("f1 reminder: upsert settings error", error);
    return null;
  }

  return data;
}
