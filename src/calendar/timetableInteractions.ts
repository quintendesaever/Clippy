import type { ButtonInteraction } from "discord.js";
import { getWeekDayKeys } from "../../shared/timetable/dates.js";
import { assembleTimetableView, toTimetableReply } from "./timetableViews.js";
import { getTimetablePanel } from "./timetablePanelStorage.js";
import { applyStoredPanelUpdate, withGuildPanelLock } from "./timetablePanel.js";
import { timetableWeekCache } from "./timetableWeekCacheLive.js";

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

  const guildId = interaction.guildId;

  try {
    await withGuildPanelLock(guildId, async () => {
      const entry = await timetableWeekCache.refresh(guildId, { selectedDayKey: dayKey });
      const weekKeys = getWeekDayKeys(entry.weekMonday);

      if (!weekKeys.includes(dayKey)) {
        const panel = await getTimetablePanel(guildId);
        if (panel && interaction.message.id === panel.message_id) {
          const rolled = await timetableWeekCache.refresh(guildId, { preferToday: true });
          await interaction.editReply(toTimetableReply(assembleTimetableView(
            rolled.timetable,
            rolled.selectedDayKey,
            rolled.images.get(rolled.selectedDayKey)
          )));
          return;
        }
        await interaction.followUp({
          content: "Dit rooster is verouderd — gebruik /timetable",
          ephemeral: true,
        });
        return;
      }

      timetableWeekCache.selectDay(guildId, dayKey);
      const png = await timetableWeekCache.getDayImage(guildId, dayKey);
      await interaction.editReply(
        toTimetableReply(assembleTimetableView(entry.timetable, dayKey, png))
      );
    });
  } catch (err) {
    console.error("[Timetable] button error:", err);
    const panel = await getTimetablePanel(guildId);
    if (panel && interaction.message.id === panel.message_id) {
      try {
        await applyStoredPanelUpdate(interaction.client);
      } catch (updateErr) {
        console.error("[Timetable] button recovery failed:", updateErr);
      }
      return true;
    }
    const message = err instanceof Error ? err.message : "Kon rooster niet laden";
    await interaction
      .followUp({ content: `Fout: ${message}`, ephemeral: true })
      .catch(() => undefined);
  }

  return true;
}
