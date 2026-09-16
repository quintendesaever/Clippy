import {
  MessageFlags,
  type ButtonInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
} from "discord.js";
import { getGuildTimezone } from "../stats/helpers.js";
import { getLibrarySettings, isLibraryScheduleActive } from "./settings.js";
import { reconcileLibraryPanelLocked, withGuildLibraryLock } from "./panel.js";
import {
  formatMinutesAsHhmm,
  localDayKey,
  validateVisitHhmm,
  visitTimeErrorMessage,
  zonedDateFromDayAndMinutes,
} from "./time.js";
import { clearCallerVisit, upsertCallerVisit } from "./visits.js";
import { buildVisitModal, isLibraryButtonId, isLibraryModalId } from "./view.js";
import {
  LIBRARY_END_HOUR_FIELD,
  LIBRARY_END_MINUTE_FIELD,
  LIBRARY_PLAN_BUTTON_ID,
  LIBRARY_START_HOUR_FIELD,
  LIBRARY_START_MINUTE_FIELD,
} from "./types.js";

export { buildVisitModal, isLibraryButtonId, isLibraryModalId } from "./view.js";

function memberProfile(member: GuildMember | null, user: { username: string; avatar: string | null }) {
  return {
    displayName: member?.displayName ?? user.username,
    username: user.username,
    avatarHash: member?.user.avatar ?? user.avatar,
  };
}

export async function handleLibraryButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!isLibraryButtonId(interaction.customId)) return false;

  if (interaction.customId === LIBRARY_PLAN_BUTTON_ID) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This button can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const settings = await getLibrarySettings(interaction.guildId);
    if (!isLibraryScheduleActive(settings)) {
      await interaction.reply({
        content: "Library scheduling is not enabled.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.showModal(buildVisitModal());
    return true;
  }

  if (!interaction.guildId) {
    await interaction.reply({
      content: "This button can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId;

  try {
    await withGuildLibraryLock(guildId, async () => {
      const settings = await getLibrarySettings(guildId);
      if (!isLibraryScheduleActive(settings)) {
        await interaction.editReply("Library scheduling is not enabled.");
        return;
      }
      const timezone = await getGuildTimezone(guildId);
      const dayKey = localDayKey(new Date(), timezone);
      const cleared = await clearCallerVisit({
        guildId,
        userId: interaction.user.id,
        dayKey,
      });
      if (!cleared) {
        await interaction.editReply("Could not clear your visit right now.");
        return;
      }
      await reconcileLibraryPanelLocked(interaction.client, guildId);
      await interaction.editReply("Your visit for today was cleared.");
    });
  } catch (err) {
    console.warn("library: clear visit failed", err instanceof Error ? err.message : err);
    await interaction.editReply("Could not clear your visit right now.").catch(() => undefined);
  }

  return true;
}

export async function handleLibraryModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!isLibraryModalId(interaction.customId)) return false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guildId) {
    await interaction.editReply("This form can only be used in a server.");
    return true;
  }

  const guildId = interaction.guildId;
  const selected = (fieldId: string) =>
    interaction.fields.getStringSelectValues(fieldId)[0] ?? "";
  const startRaw = `${selected(LIBRARY_START_HOUR_FIELD)}:${selected(LIBRARY_START_MINUTE_FIELD)}`;
  const endRaw = `${selected(LIBRARY_END_HOUR_FIELD)}:${selected(LIBRARY_END_MINUTE_FIELD)}`;

  try {
    await withGuildLibraryLock(guildId, async () => {
      const settings = await getLibrarySettings(guildId);
      if (!isLibraryScheduleActive(settings)) {
        await interaction.editReply("Library scheduling is not enabled.");
        return;
      }

      const parsed = validateVisitHhmm({
        startRaw,
        endRaw,
        openMinutes: settings.open_minutes,
        closeMinutes: settings.close_minutes,
      });
      if (!parsed.ok) {
        await interaction.editReply(
          visitTimeErrorMessage(parsed.error, settings.open_minutes, settings.close_minutes)
        );
        return;
      }

      const timezone = await getGuildTimezone(guildId);
      const dayKey = localDayKey(new Date(), timezone);
      const startAt = zonedDateFromDayAndMinutes(dayKey, parsed.startMinutes, timezone);
      const endAt = zonedDateFromDayAndMinutes(dayKey, parsed.endMinutes, timezone);
      const member = interaction.guild?.members.cache.get(interaction.user.id) ?? null;

      const saved = await upsertCallerVisit({
        guildId,
        userId: interaction.user.id,
        dayKey,
        startAt,
        endAt,
        profile: memberProfile(member, interaction.user),
      });
      if (!saved) {
        await interaction.editReply("Could not save your visit right now.");
        return;
      }

      await reconcileLibraryPanelLocked(interaction.client, guildId);
      await interaction.editReply(
        `Your visit is planned for ${formatMinutesAsHhmm(parsed.startMinutes)}–${formatMinutesAsHhmm(parsed.endMinutes)}.`
      );
    });
  } catch (err) {
    console.warn("library: visit submit failed", err instanceof Error ? err.message : err);
    await interaction.editReply("Could not save your visit right now.").catch(() => undefined);
  }

  return true;
}
