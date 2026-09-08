import type { Client } from "discord.js";
import { supabase } from "../supabase.js";
import { upsertMember } from "../stats/members.js";
import { resolveMemberDisplayName, type MemberLabel } from "../../shared/memberName.js";

export type { MemberLabel } from "../../shared/memberName.js";

const FETCH_CHUNK = 25;

async function loadCachedLabels(
  guildId: string,
  userIds: string[]
): Promise<Map<string, MemberLabel>> {
  const labels = new Map<string, MemberLabel>();
  if (userIds.length === 0) return labels;
  const { data, error } = await supabase
    .from("members")
    .select("user_id, display_name, username")
    .eq("guild_id", guildId)
    .in("user_id", userIds);
  if (error) {
    console.error("memberLabels: load cached names:", error.message);
    return labels;
  }
  for (const row of data ?? []) {
    const displayName = (row.display_name as string | null)?.trim();
    const username = (row.username as string | null)?.trim();
    if (!displayName && !username) continue;
    labels.set(row.user_id as string, {
      displayName: displayName || username || "",
      username: username || "",
    });
  }
  return labels;
}

async function fetchDiscordMembers(
  client: Client,
  guildId: string,
  userIds: string[]
): Promise<Map<string, MemberLabel>> {
  const labels = new Map<string, MemberLabel>();
  const guild =
    client.guilds.cache.get(guildId) ??
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return labels;

  const missing = userIds.filter((id) => !guild.members.cache.has(id));
  for (let i = 0; i < missing.length; i += FETCH_CHUNK) {
    const chunk = missing.slice(i, i + FETCH_CHUNK);
    await Promise.all(
      chunk.map((id) => guild.members.fetch(id).catch(() => null))
    );
  }

  for (const userId of userIds) {
    const member = guild.members.cache.get(userId);
    if (!member) continue;
    labels.set(userId, {
      displayName: member.displayName,
      username: member.user.username,
    });
  }
  return labels;
}

export async function loadMemberLabels(
  client: Client | null,
  guildId: string,
  userIds: string[]
): Promise<Map<string, MemberLabel>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const cached = await loadCachedLabels(guildId, uniqueIds);
  const labels = new Map(cached);

  if (!client || uniqueIds.length === 0) return labels;

  const applyDiscord = (fetched: Map<string, MemberLabel>) => {
    for (const [userId, label] of fetched) {
      labels.set(userId, label);
    }
  };

  try {
    applyDiscord(await fetchDiscordMembers(client, guildId, uniqueIds));
    const missing = uniqueIds.filter((id) => !labels.has(id));
    if (missing.length > 0) {
      applyDiscord(await fetchDiscordMembers(client, guildId, missing));
    }
  } catch (err) {
    console.error("memberLabels: fetch member labels:", err);
    try {
      applyDiscord(await fetchDiscordMembers(client, guildId, uniqueIds));
    } catch (retryErr) {
      console.error("memberLabels: retry fetch member labels:", retryErr);
    }
  }

  for (const [userId, label] of labels) {
    const cachedLabel = cached.get(userId);
    if (
      cachedLabel &&
      cachedLabel.displayName === label.displayName &&
      cachedLabel.username === label.username
    ) {
      continue;
    }
    void upsertMember(guildId, userId, undefined, {
      displayName: label.displayName,
      username: label.username,
    });
  }

  return labels;
}

export function labeledDisplayName(
  userId: string,
  labels: Map<string, MemberLabel>,
  initials?: string | null
): string {
  const label = labels.get(userId);
  return resolveMemberDisplayName({
    userId,
    displayName: label?.displayName,
    username: label?.username,
    initials,
  });
}
