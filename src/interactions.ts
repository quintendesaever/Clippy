import type { Client, Collection } from "discord.js";
import type { Command } from "./types/command.js";
import { logCommandError } from "./audit/events.js";
import { handleTimetableButton } from "./calendar/interactions.js";
import { handleF1Button } from "./f1/interactions.js";
import { handleLibraryButton, handleLibraryModal } from "./library/interactions.js";
import { F1_STATS_CUSTOM_ID_PREFIX, F1_STATS_PREVIEW_CUSTOM_ID } from "./f1/config.js";
import { recordDiscordAnalyticsEvent } from "./dashboard/analytics/events.js";

export function registerInteractionHandler(client: Client, commands: Collection<string, Command>): void {
  client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton()) {
      try {
        const handledTimetable = await handleTimetableButton(interaction);
        if (handledTimetable) {
          const dayKey = interaction.customId.slice("timetable:day:".length);
          if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
            recordDiscordAnalyticsEvent({
              guildId: interaction.guildId,
              user: interaction.user,
              eventType: "timetable.day",
              metadata: { dayKey },
            });
          }
          return;
        }
        const handledF1 = await handleF1Button(interaction);
        if (handledF1) {
          if (interaction.customId === F1_STATS_PREVIEW_CUSTOM_ID) {
            recordDiscordAnalyticsEvent({
              guildId: interaction.guildId,
              user: interaction.user,
              eventType: "f1.stats",
              metadata: { preview: true },
            });
          } else if (interaction.customId.startsWith(F1_STATS_CUSTOM_ID_PREFIX)) {
            const meetingKey = Number(interaction.customId.slice(F1_STATS_CUSTOM_ID_PREFIX.length));
            if (Number.isFinite(meetingKey)) {
              recordDiscordAnalyticsEvent({
                guildId: interaction.guildId,
                user: interaction.user,
                eventType: "f1.stats",
                metadata: { meetingKey },
              });
            }
          }
          return;
        }
        const handledLibrary = await handleLibraryButton(interaction);
        if (handledLibrary) return;
      } catch (err) {
        console.error("Error handling button:", err);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      try {
        const handledLibrary = await handleLibraryModal(interaction);
        if (!handledLibrary) {
          console.warn(`No handler for modal: ${interaction.customId}`);
        }
      } catch (err) {
        console.error("Error handling modal:", err);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) {
      console.warn(`No handler for slash command: ${interaction.commandName}`);
      const payload = {
        content: "This command is not available on the running bot version. Ask an admin to redeploy.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
      return;
    }

    try {
      await command.execute(interaction);
      let subcommand: string | null = null;
      try {
        subcommand = interaction.options.getSubcommand(false);
      } catch {
        subcommand = null;
      }
      recordDiscordAnalyticsEvent({
        guildId: interaction.guildId,
        user: interaction.user,
        eventType: `command.${interaction.commandName}`,
        metadata: {
          command: interaction.commandName,
          ...(subcommand ? { subcommand } : {}),
        },
      });
    } catch (err) {
      console.error(`Error executing ${interaction.commandName}:`, err);
      void logCommandError(client, {
        guildId: interaction.guildId,
        commandName: interaction.commandName,
        error: err,
        user: interaction.user,
      });
      const payload = { content: "Something went wrong.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });
}
