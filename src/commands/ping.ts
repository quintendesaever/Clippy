import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";

const ping: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),
  async execute(interaction) {
    await interaction.reply({ content: "Pong!" });
  },
};

export default ping;
