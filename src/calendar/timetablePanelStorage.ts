import { supabase } from "../supabase.js";
import { ensureChannel } from "../stats/channels.js";
import { ensureGuild } from "../stats/helpers.js";

export type TimetablePanel = {
  guild_id: string;
  channel_id: string;
  message_id: string;
  week_key: string;
  updated_at?: string;
};

const TABLE_NAME = "timetable_panels";

export async function getTimetablePanel(guildId: string): Promise<TimetablePanel | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("guild_id", guildId)
    .maybeSingle<TimetablePanel>();

  if (error) {
    console.error("[Timetable] get panel error", error);
    return null;
  }

  return data ?? null;
}

export async function upsertTimetablePanel(
  panel: Pick<TimetablePanel, "guild_id" | "channel_id" | "message_id" | "week_key">
): Promise<TimetablePanel | null> {
  await ensureGuild(panel.guild_id);
  await ensureChannel(panel.guild_id, panel.channel_id);

  const payload: TimetablePanel = {
    ...panel,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(payload, { onConflict: "guild_id" })
    .select("*")
    .maybeSingle<TimetablePanel>();

  if (error) {
    console.error("[Timetable] upsert panel error", error);
    return null;
  }

  return data;
}

export async function deleteTimetablePanel(guildId: string): Promise<void> {
  const { error } = await supabase.from(TABLE_NAME).delete().eq("guild_id", guildId);
  if (error) {
    console.error("[Timetable] delete panel error", error);
  }
}
