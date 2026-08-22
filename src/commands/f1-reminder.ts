import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  type Role,
} from "discord.js";
import type { Command } from "../types/command.js";
import { getF1ReminderSettings, upsertF1ReminderSettings } from "../f1/reminderStorage.js";
import { findNextRace } from "../f1/scheduleService.js";
import { getGuildTimezone, formatInTimezone } from "../stats/helpers.js";
import { buildF1ReminderEmbed } from "../f1/reminderEmbed.js";
import { fetchWeather } from "../f1/openf1.js";

function isTestMode(): boolean {
  const v = process.env.F1_REMINDER_TEST?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const settings = await getF1ReminderSettings(guildId);
  const nextRace = await findNextRace();
  const timezone = await getGuildTimezone(guildId);

  const parts: string[] = [];
  parts.push(`Test mode: **${isTestMode() ? "yes" : "no"}**`);
  parts.push(`Enabled: **${settings?.enabled ? "yes" : "no"}**`);
  parts.push(`Channel: ${settings?.channel_id ? `<#${settings.channel_id}>` : "`not set`"}`);
  parts.push(`Role: ${settings?.role_id ? `<@&${settings.role_id}>` : "`not set`"}`);
  parts.push(`Last notified race id: ${settings?.last_race_id_notified ?? "`none`"}`);
  if (nextRace) {
    const timeStr =
      timezone === "UTC"
        ? nextRace.raceDate.toISOString()
        : formatInTimezone(nextRace.raceDate, timezone);
    parts.push(`Next race: **${nextRace.name}** on **${timeStr}** (${timezone})`);
  } else {
    parts.push("Next race: `unknown`");
  }

  await interaction.editReply({ content: parts.join("\n") });
}

async function saveSettingsOrError(
  interaction: ChatInputCommandInteraction,
  patch: Parameters<typeof upsertF1ReminderSettings>[0],
  success: string
): Promise<void> {
  const saved = await upsertF1ReminderSettings(patch);
  if (!saved) {
    await interaction.editReply("Could not save F1 reminder settings. Try again later.");
    return;
  }
  await interaction.editReply(success);
}

const f1Reminder: Command = {
  data: new SlashCommandBuilder()
    .setName("f1-reminder")
    .setDescription("Configure F1 race weekend reminders for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName("enable").setDescription("Enable F1 weekend reminders for this server.")
    )
    .addSubcommand((sub) =>
      sub.setName("disable").setDescription("Disable F1 weekend reminders for this server.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-channel")
        .setDescription("Set the channel where F1 reminders will be sent.")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel for the reminders (defaults to current channel).")
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-role")
        .setDescription("Set the role that will be mentioned for F1 reminders.")
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Role to mention for the reminders.").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show current F1 reminder settings.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("test-send")
        .setDescription("Send a test reminder immediately (uses configured channel/role).")
    ),
  async execute(interaction) {
    if (!interaction.isChatInputCommand() || !interaction.guild || !interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "status") {
      await handleStatus(interaction);
      return;
    }

    if (sub === "test-send") {
      const settings = await getF1ReminderSettings(guildId);
      if (!settings?.channel_id || !settings?.role_id) {
        await interaction.editReply("Please set both a channel and a role first.");
        return;
      }

      const nextRace = await findNextRace(new Date());
      if (!nextRace) {
        await interaction.editReply("Couldn't find the next race right now.");
        return;
      }

      const channel = await interaction.guild.channels.fetch(settings.channel_id).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        await interaction.editReply("Configured channel is missing or not a text channel.");
        return;
      }

      const tz = await getGuildTimezone(guildId);
      const weather =
        nextRace.meeting_key != null && nextRace.meeting_key > 0
          ? await fetchWeather(nextRace.meeting_key)
          : null;
      const embed = buildF1ReminderEmbed(nextRace, tz, weather);
      const roleMention = `<@&${settings.role_id}>`;

      await (channel as GuildTextBasedChannel).send({
        content: `${roleMention} (test) F1 race weekend reminder.`,
        embeds: [embed],
      });

      await interaction.editReply(`Sent a test reminder in <#${settings.channel_id}>.`);
      return;
    }

    if (sub === "enable") {
      await saveSettingsOrError(
        interaction,
        { guild_id: guildId, enabled: true },
        "F1 weekend reminders have been **enabled**. Make sure to set a channel and role."
      );
      return;
    }

    if (sub === "disable") {
      await saveSettingsOrError(
        interaction,
        { guild_id: guildId, enabled: false },
        "F1 weekend reminders have been **disabled** for this server."
      );
      return;
    }

    if (sub === "set-channel") {
      const channelOption = interaction.options.getChannel("channel");
      const channel =
        (channelOption as GuildTextBasedChannel | null) ??
        (interaction.channel as GuildTextBasedChannel | null);

      if (!channel || !("guildId" in channel)) {
        await interaction.editReply("Please choose a text channel in this server.");
        return;
      }

      await saveSettingsOrError(
        interaction,
        { guild_id: guildId, channel_id: channel.id },
        `F1 reminders will be sent in ${channel}.`
      );
      return;
    }

    if (sub === "set-role") {
      const role = interaction.options.getRole("role") as Role | null;
      if (!role || !interaction.guild.roles.cache.has(role.id)) {
        await interaction.editReply("Please choose a valid role from this server.");
        return;
      }

      await saveSettingsOrError(
        interaction,
        { guild_id: guildId, role_id: role.id },
        `F1 reminders will mention ${role}.`
      );
    }
  },
};

export default f1Reminder;
