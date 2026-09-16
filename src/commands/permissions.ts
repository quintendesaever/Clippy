import {
  ChannelType,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type CategoryChannel,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
  type GuildChannel,
  type ThreadChannel,
} from "discord.js";
import type { Command } from "../types/command.js";
import {
  formatDiscordApiError,
  hasRequiredPermissions,
  missingUserPermissionMessage,
  replyEphemeral,
  requireGuild,
  resolveGuildMember,
} from "../admin/discordPerms.js";
import { evaluateAudit } from "../permissions/evaluate.js";
import {
  assertEmbedsWithinDiscordLimits,
  formatAuditEmbeds,
  formatChannelEmbeds,
  formatRoleEmbeds,
  formatUserEmbeds,
} from "../permissions/format.js";
import { inspectChannel, inspectRole, withBotChannelPermissions } from "../permissions/inspect.js";
import { RELEVANT_PERMISSIONS } from "../permissions/flags.js";
import type { ChannelKind, ChannelSnapshot, GuildSnapshot, OverwriteSnapshot, RoleSnapshot, UserInspection } from "../permissions/types.js";

const INSPECTABLE_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildCategory,
] as const;

const THREAD_CHANNEL_TYPES = [
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
] as const;

const CHANNEL_OPTION_TYPES = [...INSPECTABLE_CHANNEL_TYPES, ...THREAD_CHANNEL_TYPES] as const;

const UNSUPPORTED_CHANNEL_REPLY =
  "This inspector supports server text, announcement, and category channels. Threads are resolved to their parent.";

function channelKind(type: ChannelType): ChannelKind | null {
  if (type === ChannelType.GuildText) return "text";
  if (type === ChannelType.GuildAnnouncement) return "announcement";
  if (type === ChannelType.GuildCategory) return "category";
  return null;
}

function isThreadType(type: ChannelType): boolean {
  return (
    type === ChannelType.PublicThread ||
    type === ChannelType.PrivateThread ||
    type === ChannelType.AnnouncementThread
  );
}

function snapshotOverwrites(channel: GuildChannel | CategoryChannel): OverwriteSnapshot[] {
  return [...channel.permissionOverwrites.cache.values()].map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type === OverwriteType.Member ? "member" : "role",
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield,
  }));
}

function snapshotChannel(channel: GuildChannel | CategoryChannel): ChannelSnapshot | null {
  const kind = channelKind(channel.type);
  if (!kind) return null;
  return {
    id: channel.id,
    name: channel.name,
    kind,
    parentId: channel.parentId,
    permissionsLocked: channel.permissionsLocked,
    overwrites: snapshotOverwrites(channel),
  };
}

async function buildGuildSnapshot(guild: Guild): Promise<GuildSnapshot> {
  let rolesFetchIncomplete = false;
  let channelsFetchIncomplete = false;

  try {
    await guild.roles.fetch();
  } catch {
    rolesFetchIncomplete = true;
  }
  try {
    await guild.channels.fetch();
  } catch {
    channelsFetchIncomplete = true;
  }

  let me = guild.members.me ?? null;
  let resolved = true;
  if (!me) {
    try {
      me = await guild.members.fetchMe();
    } catch {
      resolved = false;
      me = null;
    }
  }

  const roles: RoleSnapshot[] = [...guild.roles.cache.values()].map((role) => ({
    id: role.id,
    name: role.name,
    position: role.position,
    permissions: role.permissions.bitfield,
    managed: role.managed,
    mentionable: role.mentionable,
    editable: resolved ? role.editable : null,
  }));

  const channels: ChannelSnapshot[] = [];
  for (const channel of guild.channels.cache.values()) {
    if (!("permissionOverwrites" in channel)) continue;
    const snapshot = snapshotChannel(channel as GuildChannel | CategoryChannel);
    if (snapshot) channels.push(snapshot);
  }

  return {
    id: guild.id,
    name: guild.name,
    roles,
    channels,
    bot: {
      memberId: me?.id ?? null,
      highestRolePosition: me?.roles.highest.position ?? null,
      resolved,
    },
    rolesFetchIncomplete,
    channelsFetchIncomplete,
  };
}

async function resolveGuildChannel(
  guild: Guild,
  channelId: string
): Promise<GuildBasedChannel | null> {
  const cached = guild.channels.cache.get(channelId);
  if (cached) return cached;
  return guild.channels.fetch(channelId).catch(() => null);
}

function threadParentId(channel: GuildBasedChannel): string | null {
  if ("parentId" in channel && isThreadType(channel.type)) {
    return (channel as ThreadChannel).parentId;
  }
  return null;
}

async function resolveInspectableChannel(
  guild: Guild,
  channelId: string
): Promise<{ ok: true; channel: GuildChannel | CategoryChannel } | { ok: false; message: string }> {
  const resolved = await resolveGuildChannel(guild, channelId);
  if (!resolved) {
    return { ok: false, message: "I could not find that channel in this server." };
  }
  if (isThreadType(resolved.type)) {
    const parentId = threadParentId(resolved);
    if (!parentId) {
      return {
        ok: false,
        message: "This thread has no parent channel with permission overwrites.",
      };
    }
    const parent = await resolveGuildChannel(guild, parentId);
    if (!parent) {
      return {
        ok: false,
        message: "This thread's parent channel is not available to inspect.",
      };
    }
    if (!channelKind(parent.type) || !("permissionOverwrites" in parent)) {
      return { ok: false, message: UNSUPPORTED_CHANNEL_REPLY };
    }
    return { ok: true, channel: parent as GuildChannel | CategoryChannel };
  }
  if (!channelKind(resolved.type) || !("permissionOverwrites" in resolved)) {
    return { ok: false, message: UNSUPPORTED_CHANNEL_REPLY };
  }
  return { ok: true, channel: resolved as GuildChannel | CategoryChannel };
}

function botEffectiveOn(channel: GuildChannel | CategoryChannel, guild: Guild) {
  const me = guild.members.me;
  if (!me) return { botEffective: null, botCanView: null as boolean | null };
  const perms = channel.permissionsFor(me);
  if (!perms) return { botEffective: null, botCanView: null as boolean | null };
  return {
    botEffective: RELEVANT_PERMISSIONS.map((bit) => ({ bit, allowed: perms.has(bit) })),
    botCanView: perms.has(PermissionFlagsBits.ViewChannel),
  };
}

async function inspectUser(
  guild: Guild,
  userId: string,
  channel: GuildChannel | CategoryChannel
): Promise<UserInspection | { error: string }> {
  let member = guild.members.cache.get(userId);
  if (!member) {
    try {
      member = await guild.members.fetch(userId);
    } catch {
      return { error: "That user is not a member of this server, or I could not fetch them." };
    }
  }

  const perms = channel.permissionsFor(member);
  const notes: string[] = [];
  const roles = [...member.roles.cache.values()]
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name }));

  return {
    userId: member.id,
    displayName: member.displayName,
    channelId: channel.id,
    channelName: channel.name,
    roles,
    effective: perms
      ? RELEVANT_PERMISSIONS.map((bit) => ({ bit, allowed: perms.has(bit) }))
      : [],
    administrator: member.permissions.has(PermissionFlagsBits.Administrator),
    owner: member.id === guild.ownerId,
    timedOut: member.isCommunicationDisabled(),
    timeoutUntil: member.communicationDisabledUntil?.toISOString() ?? null,
    computed: Boolean(perms),
    notes,
  };
}

async function replyEmbeds(
  interaction: ChatInputCommandInteraction,
  embeds: ReturnType<typeof formatAuditEmbeds>
): Promise<void> {
  try {
    assertEmbedsWithinDiscordLimits(embeds);
  } catch {
    await interaction.editReply("The permission report was too large to send. Try a more specific inspector.");
    return;
  }
  await interaction.editReply({ embeds });
}

const permissionsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("permissions")
    .setDescription("Inspect this server's Discord permissions (read-only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName("audit").setDescription("Audit this server for unexpected permission grants.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("role")
        .setDescription("Show relevant permissions configured for a role.")
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Role to inspect").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Show permission overwrites for a channel or category.")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Text, announcement, or category channel")
            .addChannelTypes(...CHANNEL_OPTION_TYPES)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("user")
        .setDescription("Show a member's effective permissions in a channel.")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Server member to inspect").setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to inspect (defaults to the current channel)")
            .addChannelTypes(...CHANNEL_OPTION_TYPES)
            .setRequired(false)
        )
    ),
  async execute(interaction) {
    const guildResult = requireGuild(interaction);
    if (!guildResult.ok) {
      await replyEphemeral(interaction, guildResult.message);
      return;
    }

    const member = await resolveGuildMember(interaction);
    const userPerms = member?.permissions ?? interaction.memberPermissions;
    if (!hasRequiredPermissions(userPerms, [PermissionFlagsBits.ManageGuild])) {
      await replyEphemeral(interaction, missingUserPermissionMessage("Manage Server"));
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const guild = guildResult.guild;
      const sub = interaction.options.getSubcommand();

      if (sub === "audit") {
        const snapshot = await buildGuildSnapshot(guild);
        const result = evaluateAudit(snapshot);
        await replyEmbeds(interaction, formatAuditEmbeds(snapshot.name, snapshot.id, result));
        return;
      }

      if (sub === "role") {
        const role = interaction.options.getRole("role", true);
        const snapshot = await buildGuildSnapshot(guild);
        const inspection = inspectRole(snapshot, role.id);
        if (!inspection) {
          await interaction.editReply("I could not inspect that role in this server.");
          return;
        }
        await replyEmbeds(interaction, formatRoleEmbeds(inspection));
        return;
      }

      if (sub === "channel") {
        const selected = interaction.options.getChannel("channel", true);
        const resolved = await resolveInspectableChannel(guild, selected.id);
        if (!resolved.ok) {
          await interaction.editReply(resolved.message);
          return;
        }
        const snapshot = await buildGuildSnapshot(guild);
        const inspection = inspectChannel(snapshot, resolved.channel.id);
        if (!inspection) {
          await interaction.editReply("I could not inspect that channel in this server.");
          return;
        }
        const bot = botEffectiveOn(resolved.channel, guild);
        await replyEmbeds(
          interaction,
          formatChannelEmbeds(withBotChannelPermissions(inspection, bot.botEffective, bot.botCanView))
        );
        return;
      }

      if (sub === "user") {
        const user = interaction.options.getUser("user", true);
        const selected = interaction.options.getChannel("channel");
        const channelId = selected?.id ?? interaction.channelId;
        if (!channelId) {
          await interaction.editReply("I could not determine which channel to inspect.");
          return;
        }
        const resolved = await resolveInspectableChannel(guild, channelId);
        if (!resolved.ok) {
          await interaction.editReply(resolved.message);
          return;
        }
        const inspection = await inspectUser(guild, user.id, resolved.channel);
        if ("error" in inspection) {
          await interaction.editReply(inspection.error);
          return;
        }
        await replyEmbeds(interaction, formatUserEmbeds(inspection));
        return;
      }

      await interaction.editReply("Unknown permissions subcommand.");
    } catch (err) {
      const mapped = formatDiscordApiError(err);
      await interaction.editReply(mapped ?? "Could not inspect permissions. Try again later.");
    }
  },
};

export default permissionsCommand;
