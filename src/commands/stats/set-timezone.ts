import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { supabase } from "../../supabase.js";
import type { Command } from "../../types/command.js";

export const setTimezone: Command = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Stats-related settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("set-timezone")
        .setDescription("Set this server's timezone for stats (IANA, e.g. Europe/Brussels)")
        .addStringOption((opt) =>
          opt
            .setName("timezone")
            .setDescription("IANA timezone (e.g. Europe/Brussels, America/New_York)")
            .setRequired(true)
        )
    ),
  async execute(interaction) {
    if (!interaction.isChatInputCommand() || !interaction.guildId) return;

    const sub = interaction.options.getSubcommand();
    if (sub !== "set-timezone") return;

    const timezone = interaction.options.getString("timezone", true).trim();

    const { error } = await supabase.from("guilds").upsert(
      {
        guild_id: interaction.guildId,
        timezone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "guild_id" }
    );

    if (error) {
      await interaction.reply({
        content: `Failed to set timezone: ${error.message}`,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: `Server timezone for stats set to \`${timezone}\`.`,
      ephemeral: true,
    });
  },
};

export default setTimezone;
