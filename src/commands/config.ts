import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../types/command.js";
import {
  applyBotSettingsPatch,
  loadBotSettingsPayload,
  type BotSettingsLogging,
  type BotSettingsPatch,
  type BotSettingsPayload,
} from "../dashboard/botSettings.js";
import { getPublicDashboardUrl } from "../config.js";
import {
  formatDiscordApiError,
  hasRequiredPermissions,
  missingUserPermissionMessage,
  replyEphemeral,
  requireGuild,
  resolveGuildMember,
} from "../admin/discordPerms.js";

const LOGGING_CATEGORY_PATCH: Record<
  string,
  keyof Pick<
    BotSettingsLogging,
    "logMembers" | "logRoles" | "logChannels" | "logBotConfig" | "logCommandErrors"
  >
> = {
  members: "logMembers",
  roles: "logRoles",
  channels: "logChannels",
  bot_config: "logBotConfig",
  command_errors: "logCommandErrors",
};

function onOff(value: boolean): string {
  return value ? "on" : "off";
}

function formatConfigShow(settings: BotSettingsPayload): string {
  const log = settings.logging;
  const channel = log.channelId ? `<#${log.channelId}>` : "`not set`";
  const dashboardUrl = `${getPublicDashboardUrl()}/admin/bot`;
  return [
    "**Clippy server config**",
    `Timezone: **${settings.timezone}**`,
    `Logging: **${log.enabled ? "enabled" : "disabled"}** in ${channel}`,
    `• members: ${onOff(log.logMembers)}`,
    `• roles: ${onOff(log.logRoles)}`,
    `• channels: ${onOff(log.logChannels)}`,
    `• bot_config: ${onOff(log.logBotConfig)}`,
    `• command_errors: ${onOff(log.logCommandErrors)}`,
    "",
    "F1 reminders: Beheer → Bot or `/f1-reminder status`.",
    `Dashboard: ${dashboardUrl}`,
  ].join("\n");
}

function actorOf(interaction: ChatInputCommandInteraction) {
  return { id: interaction.user.id, tag: interaction.user.tag };
}

async function applyPatch(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  patch: BotSettingsPatch
): Promise<void> {
  const result = await applyBotSettingsPatch(guildId, interaction.client, patch, {
    actor: actorOf(interaction),
  });
  if (!result.ok) {
    await interaction.editReply(result.error);
    return;
  }
  await interaction.editReply(formatConfigShow(result.settings));
}

const config: Command = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Show or update Clippy server settings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("show").setDescription("Show the current Clippy server config."))
    .addSubcommand((sub) =>
      sub
        .setName("timezone")
        .setDescription("Set the server timezone used by Clippy.")
        .addStringOption((opt) =>
          opt
            .setName("iana")
            .setDescription("IANA timezone name, e.g. Europe/Brussels")
            .setRequired(true)
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("logging")
        .setDescription("Configure Discord audit logging.")
        .addSubcommand((sub) => sub.setName("enable").setDescription("Enable audit logging."))
        .addSubcommand((sub) => sub.setName("disable").setDescription("Disable audit logging."))
        .addSubcommand((sub) =>
          sub
            .setName("channel")
            .setDescription("Set the channel where audit logs are posted.")
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Text or announcement channel for audit logs")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("category")
            .setDescription("Turn one audit log category on or off.")
            .addStringOption((opt) =>
              opt
                .setName("name")
                .setDescription("Which category to toggle")
                .setRequired(true)
                .addChoices(
                  { name: "members", value: "members" },
                  { name: "roles", value: "roles" },
                  { name: "channels", value: "channels" },
                  { name: "bot_config", value: "bot_config" },
                  { name: "command_errors", value: "command_errors" }
                )
            )
            .addStringOption((opt) =>
              opt
                .setName("state")
                .setDescription("on or off")
                .setRequired(true)
                .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
            )
        )
    ),
  async execute(interaction) {
    const guild = requireGuild(interaction);
    if (!guild.ok) {
      await replyEphemeral(interaction, guild.message);
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
      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand();

      if (group === "logging") {
        if (sub === "enable") {
          await applyPatch(interaction, guild.guildId, { logging: { enabled: true } });
          return;
        }
        if (sub === "disable") {
          await applyPatch(interaction, guild.guildId, { logging: { enabled: false } });
          return;
        }
        if (sub === "channel") {
          const logChannel = interaction.options.getChannel("channel", true);
          await applyPatch(interaction, guild.guildId, { logging: { channelId: logChannel.id } });
          return;
        }
        if (sub === "category") {
          const name = interaction.options.getString("name", true);
          const state = interaction.options.getString("state", true);
          const key = LOGGING_CATEGORY_PATCH[name];
          if (!key) {
            await interaction.editReply("Unknown logging category.");
            return;
          }
          await applyPatch(interaction, guild.guildId, { logging: { [key]: state === "on" } });
          return;
        }
      }

      if (sub === "show") {
        const settings = await loadBotSettingsPayload(guild.guildId, interaction.client);
        await interaction.editReply(formatConfigShow(settings));
        return;
      }

      if (sub === "timezone") {
        const iana = interaction.options.getString("iana", true);
        await applyPatch(interaction, guild.guildId, { timezone: iana });
        return;
      }

      await interaction.editReply("Unknown config subcommand.");
    } catch (err) {
      const mapped = formatDiscordApiError(err);
      await interaction.editReply(mapped ?? "Could not update config. Try again later.");
    }
  },
};

export default config;
