import { buildAuditEmbed } from "./embeds.js";
import {
  emptyAuditLogSettings,
  isAuditCategoryEnabled,
  type AuditEvent,
  type AuditLogSettings,
} from "./types.js";

export type AuditSendResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "category_off" | "no_channel" | "send_failed" };

export type AuditDiscordPort = {
  fetchSendableChannel(channelId: string): Promise<{ id: string } | null>;
  sendEmbed(channelId: string, embed: ReturnType<typeof buildAuditEmbed>): Promise<boolean>;
};

export async function deliverAuditEvent(options: {
  event: AuditEvent;
  settings: AuditLogSettings | null;
  discord: AuditDiscordPort;
}): Promise<AuditSendResult> {
  const settings = options.settings ?? emptyAuditLogSettings(options.event.guildId);
  if (!settings.enabled) {
    return { ok: false, reason: "disabled" };
  }
  if (!isAuditCategoryEnabled(settings, options.event.category)) {
    return { ok: false, reason: "category_off" };
  }
  const channelId = settings.channel_id?.trim() || null;
  if (!channelId) {
    console.warn(`audit: no log channel configured for guild ${options.event.guildId}`);
    return { ok: false, reason: "no_channel" };
  }

  const channel = await options.discord.fetchSendableChannel(channelId);
  if (!channel) {
    console.warn(
      `audit: channel ${channelId} missing or not sendable for guild ${options.event.guildId}`
    );
    return { ok: false, reason: "no_channel" };
  }

  const embed = buildAuditEmbed(options.event);
  const sent = await options.discord.sendEmbed(channel.id, embed);
  if (!sent) {
    console.warn(`audit: failed to send embed to channel ${channel.id}`);
    return { ok: false, reason: "send_failed" };
  }
  return { ok: true };
}
