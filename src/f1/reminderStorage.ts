import { supabase } from "../supabase.js";

export type F1ReminderSettings = {
  guild_id: string;
  enabled: boolean;
  channel_id: string | null;
  role_id: string | null;
  last_race_id_notified: string | null;
  created_at?: string;
  updated_at?: string;
};

const TABLE_NAME = "f1_reminder_settings";

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
  const base: F1ReminderSettings = existing ?? {
    guild_id: partial.guild_id,
    enabled: false,
    channel_id: null,
    role_id: null,
    last_race_id_notified: null,
  };
  const payload: F1ReminderSettings = {
    ...base,
    ...partial,
    updated_at: new Date().toISOString(),
  };

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
