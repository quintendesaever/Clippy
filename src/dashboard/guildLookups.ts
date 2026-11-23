import type { Client } from "discord.js";
import { getGuildId } from "../config.js";

export function createGuildLookups(getClient: () => Client | null): {
  botConfirmsGuildMember(userId: string): Promise<boolean | null>;
  getGuildMemberDisplayName(userId: string): Promise<string | null>;
} {
  async function botConfirmsGuildMember(userId: string): Promise<boolean | null> {
    const guildId = getGuildId();
    const guild = getClient()?.guilds.cache.get(guildId);
    if (!guild) return null;
    try {
      await guild.members.fetch(userId);
      return true;
    } catch {
      return false;
    }
  }

  async function getGuildMemberDisplayName(userId: string): Promise<string | null> {
    const guildId = getGuildId();
    const guild = getClient()?.guilds.cache.get(guildId);
    if (!guild) return null;
    try {
      const member = await guild.members.fetch(userId);
      return member.displayName;
    } catch {
      return null;
    }
  }

  return { botConfirmsGuildMember, getGuildMemberDisplayName };
}
