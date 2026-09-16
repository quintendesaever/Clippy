import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
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
import {
  botEffectiveOn,
  buildGuildSnapshot,
  inspectGuildMember,
  resolveInspectableChannel,
  THREAD_CHANNEL_TYPES,
  INSPECTABLE_CHANNEL_TYPES,
} from "../permissions/snapshot.js";

const CHANNEL_OPTION_TYPES = [...INSPECTABLE_CHANNEL_TYPES, ...THREAD_CHANNEL_TYPES] as const;

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
        const inspection = await inspectGuildMember(guild, user.id, resolved.channel);
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
