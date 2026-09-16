import type { ButtonInteraction } from "discord.js";
import { getWeekDayKeys } from "../../shared/timetable/dates.js";
import { assembleTimetableView, toTimetableReply } from "./timetableViews.js";
import { getTimetablePanel, upsertTimetablePanel } from "./timetablePanelStorage.js";
import { applyStoredPanelUpdate, withGuildPanelLock } from "./timetablePanel.js";
import { canRollStaleTimetableMessage, TIMETABLE_RECENT_MESSAGE_LIMIT } from "./timetableRoll.js";
import { timetableWeekCache } from "./timetableWeekCacheLive.js";

const STALE_TIMETABLE_MESSAGE = "Dit rooster is verouderd — gebruik /timetable";

async function isMessageInRecentChannelHistory(
  interaction: ButtonInteraction,
  messageId: string
): Promise<boolean> {
  try {
    const channel =
      interaction.channel ??
      (await interaction.client.channels.fetch(interaction.channelId).catch(() => null));
    if (!channel || !channel.isTextBased()) return false;
    const recent = await channel.messages.fetch({ limit: TIMETABLE_RECENT_MESSAGE_LIMIT });
    return recent.has(messageId);
  } catch {
    return false;
  }
}

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
        const isStoredPanel = Boolean(panel && interaction.message.id === panel.message_id);
        const inRecentHistory = isStoredPanel
          ? true
          : await isMessageInRecentChannelHistory(interaction, interaction.message.id);

        if (!canRollStaleTimetableMessage({ isStoredPanel, inRecentHistory })) {
          await interaction.followUp({
            content: STALE_TIMETABLE_MESSAGE,
            ephemeral: true,
          });
          return;
        }

        const rolled = await timetableWeekCache.refresh(guildId, { preferToday: true });
        try {
          await interaction.editReply(
            toTimetableReply(
              assembleTimetableView(
                rolled.timetable,
                rolled.selectedDayKey,
                rolled.images.get(rolled.selectedDayKey)
              )
            )
          );
        } catch {
          await interaction.followUp({
            content: STALE_TIMETABLE_MESSAGE,
            ephemeral: true,
          });
          return;
        }

        if (isStoredPanel && panel && panel.week_key !== rolled.weekMonday) {
          await upsertTimetablePanel({
            guild_id: guildId,
            channel_id: panel.channel_id,
            message_id: panel.message_id,
            week_key: rolled.weekMonday,
          });
        }
        console.log(`[Timetable] Week rollover via button for guild ${guildId}`);
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
