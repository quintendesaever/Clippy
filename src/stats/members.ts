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

export async function getShareLocation(guildId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("members")
    .select("share_location")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("stats: get share_location:", error.message);
    return false;
  }
  return Boolean(data?.share_location);
}

export async function setShareLocation(
  guildId: string,
  userId: string,
  shareLocation: boolean
): Promise<{ share_location: boolean } | { error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("members")
    .update({
      share_location: shareLocation,
      updated_at: now,
    })
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .select("share_location")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Member not found" };

  const { error: calendarError } = await supabase
    .from("member_calendars")
    .update({ show_location: shareLocation, updated_at: now })
    .eq("guild_id", guildId)
    .eq("user_id", userId);
  if (calendarError) {
    console.error("stats: sync calendar show_location:", calendarError.message);
  }

  return { share_location: Boolean(data.share_location) };
}

export type MemberGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
};

export async function getMemberLocationPrivacy(guildId: string): Promise<{
  shareLocationByUser: Map<string, boolean>;
  memberGeoByUser: Map<string, MemberGeo>;
}> {
  const { data, error } = await supabase
    .from("members")
    .select("user_id, share_location, last_country, last_region, last_city")
    .eq("guild_id", guildId);
  const shareLocationByUser = new Map<string, boolean>();
  const memberGeoByUser = new Map<string, MemberGeo>();
  if (error) {
    console.error("stats: load member location privacy:", error.message);
    return { shareLocationByUser, memberGeoByUser };
  }
  for (const row of data ?? []) {
    shareLocationByUser.set(row.user_id, Boolean(row.share_location));
    memberGeoByUser.set(row.user_id, {
      country: (row.last_country as string | null) ?? null,
      region: (row.last_region as string | null) ?? null,
      city: (row.last_city as string | null) ?? null,
    });
  }
  return { shareLocationByUser, memberGeoByUser };
}
