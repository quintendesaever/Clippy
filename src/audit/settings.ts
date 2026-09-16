import { supabase } from "../supabase.js";
import { ensureChannel } from "../stats/channels.js";
import { ensureGuild } from "../stats/helpers.js";
import { emptyAuditLogSettings, type AuditLogSettings } from "./types.js";

const TABLE_NAME = "audit_log_settings";

export async function getAuditLogSettings(guildId: string): Promise<AuditLogSettings | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("guild_id", guildId)
    .maybeSingle<AuditLogSettings>();

  if (error) {
    console.error("audit: get settings error", error);
    return null;
  }

  return data ?? null;
}

export async function upsertAuditLogSettings(
  partial: Partial<AuditLogSettings> & { guild_id: string }
): Promise<AuditLogSettings | null> {
  const existing = await getAuditLogSettings(partial.guild_id);
  const base = existing ?? emptyAuditLogSettings(partial.guild_id);
  const payload: AuditLogSettings = {
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
    .maybeSingle<AuditLogSettings>();

  if (error) {
    console.error("audit: upsert settings error", error);
    return null;
  }

  return data;
}
