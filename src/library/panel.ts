import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type Client,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import { getGuildId } from "../config.js";
import { loadMemberLabels } from "../dashboard/memberLabels.js";
import { getGuildTimezone } from "../stats/helpers.js";
import { hasRequiredPermissions } from "../admin/discordPerms.js";
import {
  applyRolloverCleanupMarker,
  cleanupLibraryChannel,
  LIBRARY_CLEANUP_BATCH,
  LIBRARY_MANAGE_MESSAGES,
  LIBRARY_SEND_PERMISSIONS,
  type CleanupMessageLike,
} from "./cleanup.js";
import { getLibrarySettings, isLibraryScheduleActive, upsertLibrarySettings } from "./settings.js";
import { localDayKey } from "./time.js";
import { listLibraryVisits } from "./visits.js";
import { buildDisabledLibraryPayload, buildLibraryPayload } from "./view.js";
import type { LibrarySettings } from "./types.js";
import {
  reconcileLibraryPanelState,
  retireLibraryPanelState,
  storedPanelFromSettings,
  withGuildLibraryLock,
  type LibraryPanelRecord,
  type LibraryReconcileDiscord,
} from "./panelReconcile.js";

export {
  reconcileLibraryPanelState,
  retireLibraryPanelState,
  storedPanelFromSettings,
  withGuildLibraryLock,
  type LibraryPanelRecord,
  type LibraryReconcileDiscord,
  type LibraryReconcileResult,
} from "./panelReconcile.js";

function isMissingDiscordResource(err: unknown): boolean {
  return (
    err instanceof DiscordAPIError &&
    (err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownChannel)
  );
}

function asGuildTextChannel(channel: unknown): GuildTextBasedChannel | null {
  if (
    !channel ||
    typeof channel !== "object" ||
    !("isTextBased" in channel) ||
    typeof channel.isTextBased !== "function" ||
    !channel.isTextBased() ||
    !("isDMBased" in channel) ||
    typeof channel.isDMBased !== "function" ||
    channel.isDMBased() ||
    !("isSendable" in channel) ||
    typeof channel.isSendable !== "function" ||
    !channel.isSendable()
  ) {
    return null;
  }
  return channel as GuildTextBasedChannel;
}

function botPermissionsFor(
  channel: GuildTextBasedChannel,
  client: Client
): ReturnType<GuildTextBasedChannel["permissionsFor"]> {
  const me =
    channel.guild.members.me ??
    (client.user ? channel.guild.members.cache.get(client.user.id) : undefined);
  return me ? channel.permissionsFor(me) : null;
}

async function pinSafely(message: Message): Promise<void> {
  if (message.pinned) return;
  try {
    await message.pin();
  } catch (err) {
    console.warn("library: failed to pin schedule message", err instanceof Error ? err.message : err);
  }
}

function createLiveDiscord(client: Client): LibraryReconcileDiscord {
  return {
    async fetchMessage(channelId, messageId) {
      try {
        const channel = asGuildTextChannel(await client.channels.fetch(channelId));
        if (!channel) return "error";
        await channel.messages.fetch(messageId);
        return "ok";
      } catch (err) {
        if (isMissingDiscordResource(err)) return "missing";
        console.warn("library: failed to fetch schedule message", err instanceof Error ? err.message : err);
        return "error";
      }
    },
    async editMessage(channelId, messageId, payload) {
      try {
        const channel = asGuildTextChannel(await client.channels.fetch(channelId));
        if (!channel) throw new Error("library: channel not sendable");
        const message = await channel.messages.fetch(messageId);
        await message.edit(payload);
        return "ok";
      } catch (err) {
        if (isMissingDiscordResource(err)) return "missing";
        console.warn("library: failed to edit schedule message", err instanceof Error ? err.message : err);
        throw err;
      }
    },
    async sendMessage(channelId, payload) {
      const channel = asGuildTextChannel(await client.channels.fetch(channelId));
      if (!channel) {
        throw new Error("channel missing");
      }
      const permissions = botPermissionsFor(channel, client);
      if (!hasRequiredPermissions(permissions, LIBRARY_SEND_PERMISSIONS)) {
        throw new Error("missing send permissions");
      }
      const sent = await channel.send(payload);
      return { channelId: sent.channelId, messageId: sent.id };
    },
    async pinMessage(channelId, messageId) {
      try {
        const channel = asGuildTextChannel(await client.channels.fetch(channelId));
        if (!channel) return;
        const permissions = botPermissionsFor(channel, client);
        if (!hasRequiredPermissions(permissions, LIBRARY_MANAGE_MESSAGES)) {
          console.warn("library: cannot pin schedule message (missing ManageMessages)");
          return;
        }
        const message = await channel.messages.fetch(messageId);
        await pinSafely(message);
      } catch (err) {
        console.warn("library: failed to pin schedule message", err instanceof Error ? err.message : err);
      }
    },
    async deleteMessage(channelId, messageId) {
      try {
        const channel = asGuildTextChannel(await client.channels.fetch(channelId));
        if (!channel) throw new Error("library: channel not sendable");
        const message = await channel.messages.fetch(messageId);
        await message.delete();
        return "ok";
      } catch (err) {
        if (isMissingDiscordResource(err)) return "missing";
        console.warn("library: failed to delete schedule message", err instanceof Error ? err.message : err);
        throw err;
      }
    },
  };
}

async function buildPayload(client: Client, settings: LibrarySettings, dayKey: string, timezone: string) {
  const visits = await listLibraryVisits(settings.guild_id, dayKey);
  const labels = await loadMemberLabels(
    client,
    settings.guild_id,
    visits.map((visit) => visit.user_id)
  );
  return buildLibraryPayload({
    dayKey,
    timezone,
    openMinutes: settings.open_minutes,
    closeMinutes: settings.close_minutes,
    visits,
    labels,
  });
}

async function runDiscussionCleanup(
  client: Client,
  channelId: string,
  scheduleMessageId: string | null
): Promise<"ok" | "skipped"> {
  let channel: GuildTextBasedChannel | null;
  try {
    channel = asGuildTextChannel(await client.channels.fetch(channelId));
  } catch (err) {
    if (isMissingDiscordResource(err)) {
      console.warn("library: cleanup skipped; channel missing");
      return "skipped";
    }
    throw err;
  }
  if (!channel) {
    throw new Error("library: cleanup channel not sendable");
  }
  const permissions = botPermissionsFor(channel, client);
  const result = await cleanupLibraryChannel({
    scheduleMessageId,
    discord: {
      hasManageMessages: () => hasRequiredPermissions(permissions, LIBRARY_MANAGE_MESSAGES),
      async fetchBatch(before) {
        const fetched = await channel.messages.fetch({
          limit: LIBRARY_CLEANUP_BATCH,
          ...(before ? { before } : {}),
        });
        return [...fetched.values()].map(
          (message): CleanupMessageLike => ({
            id: message.id,
            pinned: message.pinned,
            createdTimestamp: message.createdTimestamp,
          })
        );
      },
      async bulkDelete(ids) {
        const deleted = await channel.bulkDelete(ids, true);
        return deleted.size;
      },
    },
  });

  if (result.skipped) {
    console.warn("library: skipping discussion cleanup (missing ManageMessages)");
    return "skipped";
  }
  if (result.skippedOld > 0) {
    console.warn(
      `library: left ${result.skippedOld} message(s) older than 14 days (bulk delete window)`
    );
  }
  return "ok";
}

async function retireLocked(client: Client, settings: LibrarySettings): Promise<void> {
  const stored = storedPanelFromSettings(settings);
  const result = await retireLibraryPanelState({
    stored,
    payload: buildDisabledLibraryPayload(),
    discord: createLiveDiscord(client),
  });
  if (result === "cleared" || result === "absent") {
    if (settings.message_id || settings.message_channel_id) {
      await upsertLibrarySettings({
        guild_id: settings.guild_id,
        message_id: null,
        message_channel_id: null,
      });
    }
  }
}

async function reconcileLocked(client: Client, guildId: string, now: Date): Promise<void> {
  const settings = await getLibrarySettings(guildId);
  if (!settings) return;
  if (!isLibraryScheduleActive(settings) || !settings.channel_id) {
    try {
      await retireLocked(client, settings);
    } catch (err) {
      console.warn("library: panel retire failed", err instanceof Error ? err.message : err);
    }
    return;
  }

  const timezone = await getGuildTimezone(guildId);
  const dayKey = localDayKey(now, timezone);
  const payload = await buildPayload(client, settings, dayKey, timezone);
  const storedPanel = storedPanelFromSettings(settings);

  try {
    const result = await reconcileLibraryPanelState({
      stored: storedPanel,
      targetChannelId: settings.channel_id,
      payload,
      retirePayload: buildDisabledLibraryPayload(),
      discord: createLiveDiscord(client),
    });
    await upsertLibrarySettings({
      guild_id: guildId,
      message_id: result.panel.messageId,
      message_channel_id: result.panel.channelId,
      schedule_day_key: dayKey,
    });
  } catch (err) {
    console.warn("library: panel reconcile failed", err instanceof Error ? err.message : err);
  }
}

async function maybeCleanupLocked(client: Client, settings: LibrarySettings, dayKey: string): Promise<void> {
  if (!settings.channel_id) return;
  const { persistDayKey } = await applyRolloverCleanupMarker({
    lastCleanupDayKey: settings.last_cleanup_day_key,
    dayKey,
    runCleanup: () => runDiscussionCleanup(client, settings.channel_id as string, settings.message_id),
  });
  if (persistDayKey) {
    await upsertLibrarySettings({
      guild_id: settings.guild_id,
      last_cleanup_day_key: dayKey,
    });
  }
}

export async function reconcileLibraryPanelLocked(
  client: Client,
  guildId: string,
  now = new Date()
): Promise<void> {
  await reconcileLocked(client, guildId, now);
}

export async function reconcileLibraryPanel(client: Client, guildId: string, now = new Date()): Promise<void> {
  await withGuildLibraryLock(guildId, () => reconcileLocked(client, guildId, now));
}

export async function applyLibraryTick(client: Client, now = new Date()): Promise<void> {
  const guildId = getGuildId();
  if (!client.guilds.cache.get(guildId)) return;

  try {
    await withGuildLibraryLock(guildId, async () => {
      const settings = await getLibrarySettings(guildId);
      if (!settings) return;
      if (!isLibraryScheduleActive(settings)) {
        await retireLocked(client, settings);
        return;
      }
      const timezone = await getGuildTimezone(guildId);
      const dayKey = localDayKey(now, timezone);
      try {
        await maybeCleanupLocked(client, settings, dayKey);
      } catch (err) {
        console.warn("library: discussion cleanup failed", err instanceof Error ? err.message : err);
      }
      await reconcileLocked(client, guildId, now);
    });
  } catch (err) {
    console.warn("library: tick failed", err instanceof Error ? err.message : err);
  }
}
