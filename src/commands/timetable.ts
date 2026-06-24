import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildTimetable } from "../calendar/timetableService.js";
import { buildTimetableEmbeds } from "../calendar/timetableEmbed.js";
import type { TimetableRange } from "../calendar/types.js";

const timetable: Command = {
  data: new SlashCommandBuilder()
    .setName("timetable")
    .setDescription("Toon het gedeelde serverrooster van gekoppelde ICS-kalenders.")
    .addSubcommand((sub) =>
      sub.setName("today").setDescription("Lessen van vandaag")
    )
    .addSubcommand((sub) =>
      sub.setName("week").setDescription("Lessen deze week (dag per dag)")
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Dit commando werkt alleen in een server.", ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand(true);
    const range: TimetableRange = subcommand === "week" ? "week" : "today";

    try {
      const timetableResult = await getGuildTimetable(interaction.guildId, range);
      const view = await buildTimetableEmbeds(timetableResult, range);
      await interaction.editReply({
        embeds: view.embeds,
        components: view.components,
        files: view.files ?? [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Kon rooster niet laden";
      await interaction.editReply({ content: `Kon rooster niet laden: ${message}` });
    }
  },
};

export default timetable;
