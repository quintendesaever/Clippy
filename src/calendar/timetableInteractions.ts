import type { ButtonInteraction } from "discord.js";
import { getGuildTimetableForDay } from "./timetableService.js";
import { buildDaySwimlaneView } from "./timetableViews.js";

export async function handleTimetableButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("timetable:day:")) return false;
  if (!interaction.guildId) {
    await interaction.reply({ content: "Alleen bruikbaar in een server.", ephemeral: true });
    return true;
  }

  const dayKey = interaction.customId.slice("timetable:day:".length);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    await interaction.reply({ content: "Ongeldige dag.", ephemeral: true });
    return true;
  }

  await interaction.deferUpdate();

  try {
    const timetable = await getGuildTimetableForDay(interaction.guildId, dayKey);
    const view = buildDaySwimlaneView(timetable, dayKey, { showWeekNav: true });
    await interaction.editReply({ embeds: view.embeds, components: view.components });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kon rooster niet laden";
    await interaction.editReply({ content: `Fout: ${message}`, embeds: [], components: [] });
  }

  return true;
}
