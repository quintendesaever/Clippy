import {
  type Client,
  type GuildBasedChannel,
  type GuildMember,
  type PartialGuildMember,
  type Role,
  type User,
} from "discord.js";
import { sendAuditEvent, type AuditSendResult } from "./logger.js";
import { sanitizeAuditText } from "./embeds.js";
import type { AuditActor, AuditLogSettings } from "./types.js";
import {
  channelTypeLabel,
  isAuditableChannelType,
  summarizeChannelUpdate,
  summarizeRoleUpdate,
  type ChannelSnapshot,
  type RoleSnapshot,
} from "./summaries.js";

export {
  channelTypeLabel,
  isAuditableChannelType,
  summarizeChannelUpdate,
  summarizeRoleUpdate,
};
export type { ChannelSnapshot, RoleSnapshot };

function memberActor(member: GuildMember | PartialGuildMember | User): AuditActor {
  if ("username" in member && !("guild" in member)) {
    return { id: member.id, tag: member.username };
  }
  const user = "user" in member ? member.user : null;
  return { id: member.id, tag: user?.username ?? null };
}

function roleSnapshot(role: Role): RoleSnapshot {
  return {
    id: role.id,
    name: role.name,
    hexColor: role.hexColor,
    permissions: role.permissions.bitfield,
    managed: role.managed,
  };
}

function channelSnapshot(channel: GuildBasedChannel): ChannelSnapshot {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: "parentId" in channel ? channel.parentId : null,
  };
}

export async function logMemberJoin(client: Client, member: GuildMember): Promise<AuditSendResult> {
  return sendAuditEvent(client, {
    guildId: member.guild.id,
    category: "members",
    title: "Member joined",
    severity: "success",
    actor: memberActor(member),
  });
}

export async function logMemberLeave(
  client: Client,
  member: GuildMember | PartialGuildMember
): Promise<AuditSendResult> {
  return sendAuditEvent(client, {
    guildId: member.guild.id,
    category: "members",
    title: "Member left",
    severity: "warn",
    actor: memberActor(member),
  });
}

export async function logRoleCreate(client: Client, role: Role): Promise<AuditSendResult> {
  return sendAuditEvent(client, {
    guildId: role.guild.id,
    category: "roles",
    title: "Role created",
    severity: "info",
    target: `@${role.name} (${role.id})`,
  });
}

export async function logRoleDelete(client: Client, role: Role): Promise<AuditSendResult> {
  return sendAuditEvent(client, {
    guildId: role.guild.id,
    category: "roles",
    title: "Role deleted",
    severity: "warn",
    target: `@${role.name} (${role.id})`,
  });
}

export async function logRoleUpdate(
  client: Client,
  oldRole: Role,
  newRole: Role
): Promise<AuditSendResult | { ok: false; reason: "unchanged" }> {
  const details = summarizeRoleUpdate(roleSnapshot(oldRole), roleSnapshot(newRole));
  if (!details) return { ok: false, reason: "unchanged" };
  return sendAuditEvent(client, {
    guildId: newRole.guild.id,
    category: "roles",
    title: "Role updated",
    severity: "info",
    target: `@${newRole.name} (${newRole.id})`,
    details: details.join("\n"),
  });
}

export async function logChannelCreate(
  client: Client,
  channel: GuildBasedChannel
): Promise<AuditSendResult | { ok: false; reason: "skipped" }> {
  if (!isAuditableChannelType(channel.type)) return { ok: false, reason: "skipped" };
  return sendAuditEvent(client, {
    guildId: channel.guild.id,
    category: "channels",
    title: "Channel created",
    severity: "info",
    target: `#${channel.name} (${channel.id})`,
    details: `Type: ${channelTypeLabel(channel.type)}`,
  });
}

export async function logChannelDelete(
  client: Client,
  channel: GuildBasedChannel
): Promise<AuditSendResult | { ok: false; reason: "skipped" }> {
  if (!isAuditableChannelType(channel.type)) return { ok: false, reason: "skipped" };
  return sendAuditEvent(client, {
    guildId: channel.guild.id,
    category: "channels",
    title: "Channel deleted",
    severity: "warn",
    target: `#${channel.name} (${channel.id})`,
    details: `Type: ${channelTypeLabel(channel.type)}`,
  });
}

export async function logChannelUpdate(
  client: Client,
  oldChannel: GuildBasedChannel,
  newChannel: GuildBasedChannel
): Promise<AuditSendResult | { ok: false; reason: "unchanged" | "skipped" }> {
  if (!isAuditableChannelType(oldChannel.type) && !isAuditableChannelType(newChannel.type)) {
    return { ok: false, reason: "skipped" };
  }
  const details = summarizeChannelUpdate(channelSnapshot(oldChannel), channelSnapshot(newChannel));
  if (!details) return { ok: false, reason: "unchanged" };
  return sendAuditEvent(client, {
    guildId: newChannel.guild.id,
    category: "channels",
    title: "Channel updated",
    severity: "info",
    target: `#${newChannel.name} (${newChannel.id})`,
    details: details.join("\n"),
  });
}

export async function logBotConfigChange(
  client: Client,
  input: {
    guildId: string;
    actor?: AuditActor | null;
    details: string;
    settings?: AuditLogSettings | null;
  }
): Promise<AuditSendResult> {
  return sendAuditEvent(
    client,
    {
      guildId: input.guildId,
      category: "bot_config",
      title: "Bot settings updated",
      severity: "info",
      actor: input.actor,
      details: input.details,
    },
    input.settings
  );
}

/** Public hook for future admin-command audit (#61). */
export async function logBotAction(
  client: Client,
  input: {
    guildId: string;
    title: string;
    actor?: AuditActor | null;
    target?: string | null;
    details?: string | null;
  }
): Promise<AuditSendResult> {
  return sendAuditEvent(client, {
    guildId: input.guildId,
    category: "bot_config",
    title: input.title,
    severity: "info",
    actor: input.actor,
    target: input.target ?? null,
    details: input.details ?? null,
  });
}

export async function logCommandError(
  client: Client,
  input: {
    guildId: string | null;
    commandName: string;
    error: unknown;
    user?: User | null;
  }
): Promise<AuditSendResult | { ok: false; reason: "no_guild" }> {
  if (!input.guildId) return { ok: false, reason: "no_guild" };
  const raw =
    input.error instanceof Error
      ? input.error.message
      : typeof input.error === "string"
        ? input.error
        : "Unknown error";
  return sendAuditEvent(client, {
    guildId: input.guildId,
    category: "command_errors",
    title: "Command failed",
    severity: "error",
    actor: input.user ? { id: input.user.id, tag: input.user.username } : null,
    target: `/${input.commandName}`,
    details: sanitizeAuditText(raw),
  });
}
