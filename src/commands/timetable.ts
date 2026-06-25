import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildTimetable } from "../calendar/timetableService.js";
import { buildTimetableView, getDefaultDayKey, toTimetableReply } from "../calendar/timetableViews.js";

const timetable: Command = {
  data: new SlashCommandBuilder()
    .setName("timetable")
    .setDescription("Toon het gedeelde serverrooster van gekoppelde ICS-kalenders."),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Dit commando werkt alleen in een server.", ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      const timetableResult = await getGuildTimetable(interaction.guildId);
      const dayKey = getDefaultDayKey(timetableResult);
      const view = await buildTimetableView(timetableResult, dayKey);
      await interaction.editReply(toTimetableReply(view));
    } catch (err) {
      console.error("timetable command error:", err);
      const message = err instanceof Error ? err.message : "Kon rooster niet laden";
      await interaction.editReply({
        content: `Kon rooster niet laden: ${message}`,
        components: [],
        files: [],
      });
    }
  },
};

export default timetable;
