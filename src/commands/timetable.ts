import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { handleTimetableCommand } from "../calendar/timetablePanel.js";

const timetable: Command = {
  data: new SlashCommandBuilder()
    .setName("timetable")
    .setDescription("Toon het gedeelde serverrooster (ICS + activiteiten)."),
  async execute(interaction) {
    await handleTimetableCommand(interaction);
  },
};

export default timetable;
