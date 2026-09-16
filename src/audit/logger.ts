import {
  PermissionFlagsBits,
  type Client,
  type GuildTextBasedChannel,
} from "discord.js";
import { deliverAuditEvent, type AuditDiscordPort, type AuditSendResult } from "./deliver.js";
import { getAuditLogSettings } from "./settings.js";
import type { AuditEvent, AuditLogSettings } from "./types.js";

export type { AuditDiscordPort, AuditSendResult } from "./deliver.js";
export { deliverAuditEvent } from "./deliver.js";

function canSendAuditEmbed(channel: GuildTextBasedChannel, client: Client): boolean {
  const me = channel.guild.members.me ?? channel.guild.members.cache.get(client.user?.id ?? "");
  if (!me) return true;
  const permissions = channel.permissionsFor(me);
  if (!permissions) return false;
  return (
    permissions.has(PermissionFlagsBits.SendMessages) &&
    permissions.has(PermissionFlagsBits.EmbedLinks)
  );
}

export function createAuditDiscordPort(client: Client): AuditDiscordPort {
  return {
    async fetchSendableChannel(channelId) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) return null;
      if (!canSendAuditEmbed(channel, client)) return null;
      return { id: channel.id };
    },
    async sendEmbed(channelId, embed) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) return false;
        if (!canSendAuditEmbed(channel, client)) return false;
        await channel.send({ embeds: [embed] });
        return true;
      } catch (err) {
        console.warn("audit: send message failed", err);
        return false;
      }
    },
  };
}

export async function sendAuditEvent(
  client: Client,
  event: AuditEvent,
  settingsOverride?: AuditLogSettings | null
): Promise<AuditSendResult> {
  try {
    const settings =
      settingsOverride !== undefined
        ? settingsOverride
        : await getAuditLogSettings(event.guildId);
    return await deliverAuditEvent({
      event,
      settings,
      discord: createAuditDiscordPort(client),
    });
  } catch (err) {
    console.warn("audit: sendAuditEvent failed", err);
    return { ok: false, reason: "send_failed" };
  }
}
