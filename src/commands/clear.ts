import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types/command.js";
import { logBotAction } from "../audit/events.js";
import {
  CLEAR_CONFIRM_AT,
  CLEAR_MAX,
  CLEAR_MIN,
  formatClearResult,
  isValidClearCount,
  selectClearTargets,
} from "../admin/clearHelpers.js";
import {
  checkBotChannelPermission,
  checkUserChannelPermission,
  formatDiscordApiError,
  isClearableTextChannel,
  NOT_TEXT_CHANNEL_REPLY,
  replyEphemeral,
  requireGuild,
  resolveInteractionChannel,
} from "../admin/discordPerms.js";

async function clearMessages(
  interaction: Parameters<Command["execute"]>[0],
  count: number
): Promise<void> {
  const guild = requireGuild(interaction);
  if (!guild.ok) {
    await replyEphemeral(interaction, guild.message);
    return;
  }

  const channel = await resolveInteractionChannel(interaction);
  if (!isClearableTextChannel(channel)) {
    await replyEphemeral(interaction, NOT_TEXT_CHANNEL_REPLY);
    return;
  }

  const userPerm = await checkUserChannelPermission(
    interaction,
    channel,
    [PermissionFlagsBits.ManageMessages],
    "Manage Messages"
  );
  if (!userPerm.ok) {
    await replyEphemeral(interaction, userPerm.message);
    return;
  }

  const botPerm = checkBotChannelPermission(
    channel,
    interaction.client.user?.id,
    [PermissionFlagsBits.ManageMessages],
    "Manage Messages"
  );
  if (!botPerm.ok) {
    await replyEphemeral(interaction, botPerm.message);
    return;
  }

  if (!isValidClearCount(count)) {
    await replyEphemeral(interaction, `Count must be between ${CLEAR_MIN} and ${CLEAR_MAX}.`);
    return;
  }

  if (count >= CLEAR_CONFIRM_AT && !interaction.replied && !interaction.deferred) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`admin-clear:ok:${interaction.id}`)
        .setLabel(`Delete ${count}`)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`admin-clear:no:${interaction.id}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      content: `Delete up to **${count}** recent messages in this channel? Pinned messages are skipped.`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    const prompt = await interaction.fetchReply();
    const click = await prompt
      .awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (btn) =>
          btn.user.id === interaction.user.id && btn.customId.startsWith("admin-clear:"),
      })
      .catch(() => null);

    if (!click || click.customId.startsWith("admin-clear:no:")) {
      if (click) await click.deferUpdate();
      await interaction.editReply({
        content: "Clear cancelled.",
        components: [],
      });
      return;
    }
    await click.deferUpdate();
  } else if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  try {
    const fetched = await channel.messages.fetch({ limit: count });
    const { deletable, skippedPinned, skippedOld } = selectClearTargets(fetched.values());
    let deleted = 0;

    if (deletable.length === 1) {
      await deletable[0]!.delete();
      deleted = 1;
    } else if (deletable.length > 1) {
      const removed = await channel.bulkDelete(deletable, true);
      deleted = removed.size;
    }

    const result = formatClearResult(deleted, skippedPinned, skippedOld);
    await replyEphemeral(interaction, result);

    if (deleted > 0) {
      void logBotAction(interaction.client, {
        guildId: guild.guildId,
        title: "Messages cleared",
        actor: { id: interaction.user.id, tag: interaction.user.tag },
        target: `#${channel.name}`,
        details: `Deleted ${deleted} of ${count} requested (${skippedPinned} pinned, ${skippedOld} too old).`,
      }).catch(() => {});
    }
  } catch (err) {
    const mapped = formatDiscordApiError(err);
    await replyEphemeral(interaction, mapped ?? "Could not delete messages. Try again later.");
  }
}

const clear: Command = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete recent messages in this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addIntegerOption((opt) =>
      opt
        .setName("count")
        .setDescription("Number of recent messages to delete (1–100). Pinned messages are skipped.")
        .setRequired(true)
        .setMinValue(CLEAR_MIN)
        .setMaxValue(CLEAR_MAX)
    ),
  async execute(interaction) {
    const count = interaction.options.getInteger("count", true);
    await clearMessages(interaction, count);
  },
};

export default clear;
