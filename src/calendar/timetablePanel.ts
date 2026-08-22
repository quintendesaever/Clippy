import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type ChatInputCommandInteraction,
  type Client,
  type Message,
  type SendableChannels,
} from "discord.js";
import { dayKeyInTimezone, getWeekMondayKey } from "../../shared/timetable/dates.js";
import { getGuildId } from "../config.js";
import { getGuildTimezone } from "../stats/helpers.js";
import {
  deleteTimetablePanel,
  getTimetablePanel,
  upsertTimetablePanel,
  type TimetablePanel,
} from "./timetablePanelStorage.js";
import { assembleTimetableView, toTimetableReply, type TimetableView } from "./timetableViews.js";
import { TIMETABLE_VALIDATE_INTERVAL_MS, type WeekCacheEntry } from "./timetableWeekCache.js";
import { timetableWeekCache } from "./timetableWeekCacheLive.js";
import type { PanelRecord } from "./timetablePanelReconcile.js";

const guildLocks = new Map<string, Promise<unknown>>();

export function withGuildPanelLock<T>(guildId: string, fn: () => Promise<T>): Promise<T> {
  const previous = guildLocks.get(guildId) ?? Promise.resolve();
  const current = previous.then(fn, fn);
  guildLocks.set(
    guildId,
    current.then(
      () => undefined,
      () => undefined
    )
  );
  return current;
}

export function timetablePanelJumpUrl(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

export { reconcileTimetablePanel } from "./timetablePanelReconcile.js";
export type { PanelRecord, ReconcileDiscord, ReconcileResult } from "./timetablePanelReconcile.js";

export function viewFromCacheEntry(entry: WeekCacheEntry, dayKey?: string): TimetableView {
  const selected = dayKey ?? entry.selectedDayKey;
  return assembleTimetableView(entry.timetable, selected, entry.images.get(selected));
}

function isMissingDiscordResource(err: unknown): boolean {
  return (
    err instanceof DiscordAPIError &&
    (err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownChannel)
  );
}

async function pinSafely(message: { pin?: () => Promise<unknown>; pinned?: boolean }): Promise<void> {
  if (!message.pin || message.pinned) return;
  try {
    await message.pin();
  } catch (err) {
    console.warn("[Timetable] Failed to pin panel:", err instanceof Error ? err.message : err);
  }
}

export async function fetchStoredPanelMessage(
  client: Client,
  panel: TimetablePanel
): Promise<Message | null> {
  try {
    const channel = await client.channels.fetch(panel.channel_id);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return null;
    return await channel.messages.fetch(panel.message_id);
  } catch (err) {
    if (isMissingDiscordResource(err)) return null;
    console.error("[Timetable] Failed to fetch panel message:", err);
    return null;
  }
}

function asGuildSendableChannel(channel: unknown): SendableChannels {
  if (
    !channel ||
    typeof channel !== "object" ||
    !("isSendable" in channel) ||
    typeof channel.isSendable !== "function" ||
    !channel.isSendable() ||
    !("isDMBased" in channel) ||
    typeof channel.isDMBased !== "function" ||
    channel.isDMBased()
  ) {
    throw new Error("Geen tekstkanaal om het roosterpanel in te plaatsen.");
  }
  return channel as SendableChannels;
}

async function resolveSendChannel(
  interaction: ChatInputCommandInteraction
): Promise<SendableChannels> {
  const channel =
    interaction.channel ??
    (await interaction.client.channels.fetch(interaction.channelId).catch(() => null));
  return asGuildSendableChannel(channel);
}

async function persistPanel(
  guildId: string,
  channelId: string,
  messageId: string,
  weekKey: string
): Promise<void> {
  await upsertTimetablePanel({
    guild_id: guildId,
    channel_id: channelId,
    message_id: messageId,
    week_key: weekKey,
  });
}

async function editOrRecreatePanelMessage(
  client: Client,
  stored: TimetablePanel,
  view: TimetableView,
  fallbackChannelId: string,
  weekKey: string
): Promise<{ panel: PanelRecord; recreated: boolean }> {
  const message = await fetchStoredPanelMessage(client, stored);
  if (message) {
    try {
      await message.edit(toTimetableReply(view));
      const panel = {
        guildId: stored.guild_id,
        channelId: message.channelId,
        messageId: message.id,
        weekKey,
      };
      if (stored.week_key !== weekKey) {
        await persistPanel(panel.guildId, panel.channelId, panel.messageId, weekKey);
      }
      return { panel, recreated: false };
    } catch (err) {
      if (!isMissingDiscordResource(err)) throw err;
    }
  }

  let channel: SendableChannels;
  try {
    channel = asGuildSendableChannel(
      await client.channels.fetch(fallbackChannelId).catch(() => null)
    );
  } catch (err) {
    await deleteTimetablePanel(stored.guild_id);
    throw err;
  }
  const sent = await channel.send(toTimetableReply(view));
  await pinSafely(sent);
  await persistPanel(stored.guild_id, sent.channelId, sent.id, weekKey);
  console.log(`[Timetable] Recreated missing panel for guild ${stored.guild_id}`);
  return {
    panel: {
      guildId: stored.guild_id,
      channelId: sent.channelId,
      messageId: sent.id,
      weekKey,
    },
    recreated: true,
  };
}

export async function handleTimetableCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Dit commando werkt alleen in een server.", ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;
  const existing = await getTimetablePanel(guildId);
  const ephemeral = Boolean(existing);
  await interaction.deferReply({ ephemeral });

  try {
    await withGuildPanelLock(guildId, async () => {
      const entry = await timetableWeekCache.refresh(guildId, {
        force: true,
        skipIcsCache: true,
        preferToday: true,
      });
      const view = viewFromCacheEntry(entry);
      const stored = await getTimetablePanel(guildId);

      if (!stored) {
        if (ephemeral) {
          const channel = await resolveSendChannel(interaction);
          const sent = await channel.send(toTimetableReply(view));
          await pinSafely(sent);
          await persistPanel(guildId, sent.channelId, sent.id, entry.weekMonday);
          await interaction.editReply({
            content: `Roosterpanel aangemaakt — [bekijk rooster](${timetablePanelJumpUrl(guildId, sent.channelId, sent.id)})`,
          });
          return;
        }

        await interaction.editReply(toTimetableReply(view));
        const message = await interaction.fetchReply();
        await pinSafely(message);
        await persistPanel(guildId, message.channelId, message.id, entry.weekMonday);
        return;
      }

      if (!ephemeral) {
        const result = await editOrRecreatePanelMessage(
          interaction.client,
          stored,
          view,
          interaction.channelId,
          entry.weekMonday
        );
        await interaction.deleteReply().catch(() => undefined);
        const label = result.recreated ? "opnieuw aangemaakt" : "bijgewerkt";
        await interaction.followUp({
          content: `Roosterpanel ${label} — [bekijk rooster](${timetablePanelJumpUrl(guildId, result.panel.channelId, result.panel.messageId)})`,
          ephemeral: true,
        });
        return;
      }

      const result = await editOrRecreatePanelMessage(
        interaction.client,
        stored,
        view,
        interaction.channelId,
        entry.weekMonday
      );
      const label = result.recreated ? "opnieuw aangemaakt" : "bijgewerkt";
      await interaction.editReply({
        content: `Roosterpanel ${label} — [bekijk rooster](${timetablePanelJumpUrl(guildId, result.panel.channelId, result.panel.messageId)})`,
      });
    });
  } catch (err) {
    console.error("[Timetable] command error:", err);
    const message = err instanceof Error ? err.message : "Kon rooster niet laden";
    const payload = { content: `Kon rooster niet laden: ${message}`, components: [], files: [], embeds: [] };
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload).catch(() => undefined);
    }
  }
}

export async function applyStoredPanelUpdate(
  client: Client,
  options: { preferToday?: boolean; force?: boolean; skipIcsCache?: boolean } = {}
): Promise<"updated" | "missing" | "skipped"> {
  const guildId = getGuildId();
  const stored = await getTimetablePanel(guildId);
  if (!stored) return "missing";

  const message = await fetchStoredPanelMessage(client, stored);
  if (!message) {
    await deleteTimetablePanel(guildId);
    console.log("[Timetable] Stored panel message missing; waiting for /timetable");
    return "missing";
  }

  const entry = await timetableWeekCache.refresh(guildId, {
    force: options.force,
    skipIcsCache: options.skipIcsCache,
    preferToday: options.preferToday,
  });
  try {
    await message.edit(toTimetableReply(viewFromCacheEntry(entry)));
  } catch (err) {
    if (isMissingDiscordResource(err)) {
      await deleteTimetablePanel(guildId);
      console.log("[Timetable] Stored panel message missing; waiting for /timetable");
      return "missing";
    }
    throw err;
  }

  if (stored.week_key !== entry.weekMonday) {
    await persistPanel(guildId, stored.channel_id, stored.message_id, entry.weekMonday);
  }
  return "updated";
}

export async function applyTimetablePanelTick(
  client: Client,
  options: { startup?: boolean } = {}
): Promise<void> {
  const guildId = getGuildId();
  const stored = await getTimetablePanel(guildId);
  if (!stored) return;

  const cache = timetableWeekCache.peek(guildId);
  const timezone = cache?.timetable.guildTimezone ?? (await getGuildTimezone(guildId));
  const now = Date.now();
  const todayKey = dayKeyInTimezone(new Date(now), timezone);
  const weekMonday = getWeekMondayKey(new Date(now), timezone);

  const weekChanged = !cache || cache.weekMonday !== weekMonday;
  const dayChanged = !cache || cache.calendarDayKey !== todayKey;
  const needsValidation = !cache || now - cache.validatedAt >= TIMETABLE_VALIDATE_INTERVAL_MS;

  if (!options.startup && !weekChanged && !dayChanged && !needsValidation) {
    return;
  }

  if (
    !options.startup &&
    weekChanged &&
    cache &&
    now - cache.lastFetchAttemptAt < TIMETABLE_VALIDATE_INTERVAL_MS
  ) {
    return;
  }

  await withGuildPanelLock(guildId, async () => {
    if (!weekChanged && dayChanged && cache && !needsValidation) {
      const message = await fetchStoredPanelMessage(client, stored);
      if (!message) {
        await deleteTimetablePanel(guildId);
        console.log("[Timetable] Stored panel message missing; waiting for /timetable");
        return;
      }
      cache.calendarDayKey = todayKey;
      cache.selectedDayKey = todayKey;
      try {
        await message.edit(toTimetableReply(viewFromCacheEntry(cache, todayKey)));
      } catch (err) {
        if (isMissingDiscordResource(err)) {
          await deleteTimetablePanel(guildId);
          console.log("[Timetable] Stored panel message missing; waiting for /timetable");
          return;
        }
        throw err;
      }
      console.log(`[Timetable] Day rollover for guild ${guildId}`);
      return;
    }

    await applyStoredPanelUpdate(client, {
      preferToday: weekChanged || dayChanged || Boolean(options.startup),
      force: Boolean(options.startup),
    });
  });
}

