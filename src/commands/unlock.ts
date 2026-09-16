import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { logBotAction } from "../audit/events.js";
import {
  checkBotChannelPermission,
  checkUserChannelPermission,
  formatDiscordApiError,
  isLockableTextChannel,
  NOT_TEXT_CHANNEL_REPLY,
  replyEphemeral,
  requireGuild,
  resolveInteractionChannel,
} from "../admin/discordPerms.js";

const unlock: Command = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Restore @everyone sending in this channel (inherit permissions).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
  async execute(interaction) {
    const guild = requireGuild(interaction);
    if (!guild.ok) {
      await replyEphemeral(interaction, guild.message);
      return;
    }

    const channel = await resolveInteractionChannel(interaction);
    if (!isLockableTextChannel(channel)) {
      await replyEphemeral(interaction, NOT_TEXT_CHANNEL_REPLY);
      return;
    }

    const userPerm = await checkUserChannelPermission(
      interaction,
      channel,
      [PermissionFlagsBits.ManageChannels],
      "Manage Channels"
    );
    if (!userPerm.ok) {
      await replyEphemeral(interaction, userPerm.message);
      return;
    }

    const botPerm = checkBotChannelPermission(
      channel,
      interaction.client.user?.id,
      [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels],
      "Manage Roles or Manage Channels",
      "any"
    );
    if (!botPerm.ok) {
      await replyEphemeral(interaction, botPerm.message);
      return;
    }

    try {
      await channel.permissionOverwrites.edit(
        guild.guild.roles.everyone,
        { SendMessages: null },
        { reason: `Unlocked by ${interaction.user.tag} via /unlock` }
      );
    } catch (err) {
      const mapped = formatDiscordApiError(err);
      await replyEphemeral(
        interaction,
        mapped ?? "Could not unlock this channel. Try again later."
      );
      return;
    }

    await interaction.reply({
      content: "This channel is unlocked. Members can send messages again.",
    });

    void logBotAction(interaction.client, {
      guildId: guild.guildId,
      title: "Channel unlocked",
      actor: { id: interaction.user.id, tag: interaction.user.tag },
      target: `#${channel.name}`,
      details: "Reset @everyone Send Messages to inherit.",
    }).catch(() => {});
  },
};

export default unlock;
