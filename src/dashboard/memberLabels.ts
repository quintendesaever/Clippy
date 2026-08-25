import type { Client } from "discord.js";

export type MemberLabel = { displayName: string; username: string };

export async function loadMemberLabels(
  client: Client | null,
  guildId: string,
  userIds: string[]
): Promise<Map<string, MemberLabel>> {
  const labels = new Map<string, MemberLabel>();
  const guild = client?.guilds.cache.get(guildId);
  if (!guild || userIds.length === 0) return labels;
  try {
    await guild.members.fetch();
    for (const userId of userIds) {
      const member = guild.members.cache.get(userId);
      if (member) {
        labels.set(userId, { displayName: member.displayName, username: member.user.username });
      }
    }
  } catch (err) {
    console.error("memberLabels: fetch member labels:", err);
  }
  return labels;
}
