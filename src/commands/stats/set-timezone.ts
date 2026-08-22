import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { supabase } from "../../supabase.js";
import { ensureGuild } from "../../stats/helpers.js";
import { syncGuildMembers } from "../../stats/members.js";
import { isValidIanaTimeZone } from "../../../shared/timetable/dates.js";
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
    )
    .addSubcommand((sub) =>
      sub
        .setName("sync-channels")
        .setDescription("Sync Discord channel names to the stats database")
    )
    .addSubcommand((sub) =>
      sub
        .setName("sync-members")
        .setDescription("Sync Discord member avatars to the members database table")
    ),
  async execute(interaction) {
    if (!interaction.isChatInputCommand() || !interaction.guildId || !interaction.guild) return;

    const sub = interaction.options.getSubcommand();

    if (sub === "set-timezone") {
      const timezone = interaction.options.getString("timezone", true).trim();
      if (!isValidIanaTimeZone(timezone)) {
        await interaction.reply({
          content: `Invalid timezone \`${timezone}\`. Use an IANA name such as \`Europe/Brussels\`.`,
          ephemeral: true,
        });
        return;
      }

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
      return;
    }

    if (sub === "sync-channels") {
      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      const guildId = guild.id;
      await guild.channels.fetch();

      const now = new Date().toISOString();
      const rows = [...guild.channels.cache.values()]
        .filter((channel) => channel.name)
        .map((channel) => ({
          guild_id: guildId,
          channel_id: channel.id,
          name: channel.name!,
          updated_at: now,
        }));

      const INSERT_CHUNK = 80;
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK);
        const { error } = await supabase
          .from("channels")
          .upsert(chunk, { onConflict: "guild_id,channel_id" });
        if (error) {
          await interaction.editReply(`Failed to sync channels: ${error.message}`);
          return;
        }
      }

      const currentIds = new Set(rows.map((row) => row.channel_id));
      const { data: existing, error: selectError } = await supabase
        .from("channels")
        .select("channel_id")
        .eq("guild_id", guildId);

      if (selectError) {
        await interaction.editReply(`Synced ${rows.length} channels but failed to prune stale rows: ${selectError.message}`);
        return;
      }

      const staleIds = (existing ?? [])
        .map((row) => row.channel_id)
        .filter((channelId) => !currentIds.has(channelId));

      if (staleIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("channels")
          .delete()
          .eq("guild_id", guildId)
          .in("channel_id", staleIds);
        if (deleteError) {
          await interaction.editReply(
            `Synced ${rows.length} channels but failed to remove stale rows: ${deleteError.message}`
          );
          return;
        }
      }

      let reply = `Synced **${rows.length}** channel(s) to the database.`;
      if (staleIds.length > 0) {
        reply += ` Removed **${staleIds.length}** deleted channel(s).`;
      }
      await interaction.editReply(reply);
      return;
    }

    if (sub === "sync-members") {
      await interaction.deferReply({ ephemeral: true });

      try {
        const guild = interaction.guild;
        await ensureGuild(guild.id);
        const result = await syncGuildMembers(guild);

        if (result.error) {
          await interaction.editReply(`Failed to sync members: ${result.error}`);
          return;
        }

        await interaction.editReply(
          `Synced **${result.count}** member(s) to the database (user IDs and avatar hashes).`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await interaction.editReply(
          `Failed to sync members: ${message}\n\nIf this mentions privileged intents, enable **Server Members Intent** in the Discord Developer Portal.`
        );
      }
      return;
    }

    await interaction.reply({
      content: "Unknown stats subcommand. Redeploy the bot if you recently added new options.",
      ephemeral: true,
    });
  },
};

export default setTimezone;
