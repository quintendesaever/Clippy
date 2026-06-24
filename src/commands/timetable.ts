import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildTimetable } from "../calendar/timetableService.js";
import { buildTimetableEmbeds } from "../calendar/timetableEmbed.js";
import type { TimetableRange } from "../calendar/types.js";

const timetable: Command = {
  data: new SlashCommandBuilder()
    .setName("timetable")
    .setDescription("Show the shared server timetable from linked ICS calendars.")
    .addSubcommand((sub) =>
      sub.setName("today").setDescription("Events scheduled for today")
    )
    .addSubcommand((sub) =>
      sub.setName("week").setDescription("Events scheduled for the next 7 days")
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand(true);
    const range: TimetableRange = subcommand === "week" ? "week" : "today";

    try {
      const timetableResult = await getGuildTimetable(interaction.guildId, range);
      const embeds = buildTimetableEmbeds(timetableResult, range);
      await interaction.editReply({ embeds });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load timetable";
      await interaction.editReply({ content: `Could not load timetable: ${message}` });
    }
  },
};

export default timetable;
