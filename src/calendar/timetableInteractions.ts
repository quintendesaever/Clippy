import type { ButtonInteraction } from "discord.js";
import { getGuildTimetable } from "./timetableService.js";
import { buildTimetableView, toTimetableReply } from "./timetableViews.js";

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
    const timetable = await getGuildTimetable(interaction.guildId);
    const view = await buildTimetableView(timetable, dayKey);
    await interaction.editReply(toTimetableReply(view));
  } catch (err) {
    console.error("timetable button error:", err);
    const message = err instanceof Error ? err.message : "Kon rooster niet laden";
    await interaction.editReply({ content: `Fout: ${message}`, components: [], files: [], embeds: [] });
  }

  return true;
}
