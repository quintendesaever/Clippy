import type { Guild } from "discord.js";
import { supabase } from "../supabase.js";

const UPSERT_CHUNK = 80;

export async function upsertMember(
  guildId: string,
  userId: string,
  avatarHash?: string | null
): Promise<void> {
  const row: {
    guild_id: string;
    user_id: string;
    updated_at: string;
    avatar_hash?: string | null;
  } = {
    guild_id: guildId,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  if (avatarHash !== undefined) {
    row.avatar_hash = avatarHash;
  }

  const { error } = await supabase.from("members").upsert(row, { onConflict: "guild_id,user_id" });
  if (error) {
    console.error("stats: upsert member:", error.message);
  }
}

export type SyncGuildMembersResult = {
  count: number;
  error?: string;
};

export async function syncGuildMembers(guild: Guild): Promise<SyncGuildMembersResult> {
  let members;
  try {
    members = await guild.members.fetch();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { count: 0, error: message };
  }

  const now = new Date().toISOString();
  const rows = [...members.values()].map((member) => ({
    guild_id: guild.id,
    user_id: member.id,
    avatar_hash: member.user.avatar,
    updated_at: now,
  }));

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from("members")
      .upsert(chunk, { onConflict: "guild_id,user_id" });
    if (error) {
      console.error("stats: sync guild members:", error.message);
      return { count: i, error: error.message };
    }
  }

  return { count: rows.length };
}

export const DEFAULT_SHOW_TYPE_PREFIX = true;

export async function getShowTypePrefix(guildId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("members")
    .select("show_type_prefix")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("stats: get show_type_prefix:", error.message);
    return DEFAULT_SHOW_TYPE_PREFIX;
  }
  return data?.show_type_prefix ?? DEFAULT_SHOW_TYPE_PREFIX;
}

export async function setShowTypePrefix(
  guildId: string,
  userId: string,
  showTypePrefix: boolean
): Promise<{ show_type_prefix: boolean } | { error: string }> {
  const { data, error } = await supabase
    .from("members")
    .update({
      show_type_prefix: showTypePrefix,
      updated_at: new Date().toISOString(),
    })
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .select("show_type_prefix")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Member not found" };
  return { show_type_prefix: Boolean(data.show_type_prefix) };
}
