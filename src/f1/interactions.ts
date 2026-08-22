import type { ButtonInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { F1_STATS_CUSTOM_ID_PREFIX, F1_STATS_PREVIEW_CUSTOM_ID } from "./config.js";
import { buildExtraStatsEmbed } from "./embeds.js";
import { withF1GuildLock } from "./lock.js";
import { buildPreviewRaceResults } from "./previewResults.js";
import { fetchRaceWeekendResults, isPublishableResults } from "./results.js";
import { fetchSeasonMeetings, findMeetingByKey } from "./schedule.js";
import { resolveMeetingForPreview } from "./testPreview.js";

export async function handleF1Button(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId === F1_STATS_PREVIEW_CUSTOM_ID) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This button can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const meeting = await resolveMeetingForPreview();
    if (!meeting) {
      await interaction.editReply("No Grand Prix is available for this preview.");
      return true;
    }
    const results = buildPreviewRaceResults(meeting);
    await interaction.editReply({
      content: "TEST PREVIEW — sample statistics, not official results.",
      embeds: [buildExtraStatsEmbed(results)],
    });
    return true;
  }

  if (!interaction.customId.startsWith(F1_STATS_CUSTOM_ID_PREFIX)) return false;
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This button can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const rawKey = interaction.customId.slice(F1_STATS_CUSTOM_ID_PREFIX.length);
  const meetingKey = Number(rawKey);
  if (!Number.isFinite(meetingKey)) {
    await interaction.reply({
      content: "This statistics button is invalid.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await withF1GuildLock(interaction.guildId, async () => {
      const meetings = await fetchSeasonMeetings();
      const meeting = findMeetingByKey(meetings, meetingKey);
      if (!meeting) {
        await interaction.editReply("Could not find that Grand Prix anymore.");
        return;
      }
      const results = await fetchRaceWeekendResults(meeting);
      if (!isPublishableResults(results)) {
        await interaction.editReply("Detailed statistics are not available yet.");
        return;
      }
      await interaction.editReply({ embeds: [buildExtraStatsEmbed(results)] });
    });
  } catch (err) {
    console.error("f1 reminder: stats button failed", err);
    await interaction.editReply("Could not load extra statistics right now.").catch(() => undefined);
  }

  return true;
}
