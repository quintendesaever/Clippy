import type { Client } from "discord.js";
import { ChannelType } from "discord.js";
import { supabase } from "../supabase.js";
import { getGuildTimezone } from "../stats/helpers.js";
import { isValidIanaTimeZone } from "../../shared/timetable/dates.js";
import { resolvePredictionUrl } from "../f1/predictionUrl.js";
import { getF1ReminderSettings, upsertF1ReminderSettings } from "../f1/reminderStorage.js";
import { summarizeBotSettingsChanges } from "../audit/botConfigSummary.js";
import { logBotConfigChange } from "../audit/events.js";
import { getAuditLogSettings, upsertAuditLogSettings } from "../audit/settings.js";
import { emptyAuditLogSettings, type AuditLogSettings } from "../audit/types.js";
import {
  getLibrarySettings,
  resolveLibrarySettingsPatch,
  toPublicLibrarySettings,
  upsertLibrarySettings,
} from "../library/settings.js";
import { reconcileLibraryPanel } from "../library/panel.js";
import type { LibraryPublicSettings, LibrarySettingsPatch } from "../library/types.js";

export type BotSettingsChannelOption = { id: string; name: string };
export type BotSettingsRoleOption = { id: string; name: string };

export type BotSettingsLogging = {
  enabled: boolean;
  channelId: string | null;
  logMembers: boolean;
  logRoles: boolean;
  logChannels: boolean;
  logBotConfig: boolean;
  logCommandErrors: boolean;
};

export type BotSettingsPayload = {
  timezone: string;
  f1: {
    enabled: boolean;
    channelId: string | null;
    roleId: string | null;
    predictionUrl: string | null;
  };
  library: LibraryPublicSettings;
  logging: BotSettingsLogging;
  channels: BotSettingsChannelOption[];
  roles: BotSettingsRoleOption[];
};

export type BotSettingsPatch = {
  timezone?: string;
  f1?: {
    enabled?: boolean;
    channelId?: string | null;
    roleId?: string | null;
    predictionUrl?: string | null;
  };
  library?: LibrarySettingsPatch;
  logging?: {
    enabled?: boolean;
    channelId?: string | null;
    logMembers?: boolean;
    logRoles?: boolean;
    logChannels?: boolean;
    logBotConfig?: boolean;
    logCommandErrors?: boolean;
  };
};

export type BotSettingsPatchActor = { id: string; tag?: string | null };

function loggingFromRow(guildId: string, settings: AuditLogSettings | null): BotSettingsLogging {
  const row = settings ?? emptyAuditLogSettings(guildId);
  return {
    enabled: row.enabled,
    channelId: row.channel_id,
    logMembers: row.log_members,
    logRoles: row.log_roles,
    logChannels: row.log_channels,
    logBotConfig: row.log_bot_config,
    logCommandErrors: row.log_command_errors,
  };
}

function settingsForBotConfigAudit(
  previous: AuditLogSettings | null,
  next: AuditLogSettings | null,
  guildId: string
): AuditLogSettings {
  const prev = previous ?? emptyAuditLogSettings(guildId);
  const nxt = next ?? emptyAuditLogSettings(guildId);
  const canSend = (row: AuditLogSettings) =>
    Boolean(row.enabled && row.channel_id && row.log_bot_config);
  if (canSend(nxt)) return nxt;
  if (canSend(prev)) return prev;
  if (nxt.enabled && nxt.channel_id) return nxt;
  if (prev.enabled && prev.channel_id) return prev;
  return nxt;
}

async function listGuildOptions(
  client: Client | null,
  guildId: string
): Promise<{ channels: BotSettingsChannelOption[]; roles: BotSettingsRoleOption[] }> {
  const guild = client?.guilds.cache.get(guildId);
  if (!guild) return { channels: [], roles: [] };

  await Promise.all([
    guild.channels.fetch().catch(() => null),
    guild.roles.fetch().catch(() => null),
  ]);

  const channels = [...guild.channels.cache.values()]
    .filter(
      (channel) =>
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement
    )
    .map((channel) => ({ id: channel.id, name: channel.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));

  const roles = [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && !role.managed)
    .map((role) => ({ id: role.id, name: role.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));

  return { channels, roles };
}

export async function loadBotSettingsPayload(
  guildId: string,
  client: Client | null
): Promise<BotSettingsPayload> {
  const [timezone, settings, library, logging, options] = await Promise.all([
    getGuildTimezone(guildId),
    getF1ReminderSettings(guildId),
    getLibrarySettings(guildId),
    getAuditLogSettings(guildId),
    listGuildOptions(client, guildId),
  ]);

  return {
    timezone,
    f1: {
      enabled: Boolean(settings?.enabled),
      channelId: settings?.channel_id ?? null,
      roleId: settings?.role_id ?? null,
      predictionUrl: settings?.prediction_url ?? null,
    },
    library: toPublicLibrarySettings(library, guildId),
    logging: loggingFromRow(guildId, logging),
    channels: options.channels,
    roles: options.roles,
  };
}

export async function applyBotSettingsPatch(
  guildId: string,
  client: Client | null,
  patch: BotSettingsPatch,
  options?: { actor?: BotSettingsPatchActor | null }
): Promise<{ ok: true; settings: BotSettingsPayload } | { ok: false; error: string; status: number }> {
  const previousPayload = await loadBotSettingsPayload(guildId, client);
  const previousLogging = await getAuditLogSettings(guildId);

  if (patch.timezone !== undefined) {
    const timezone = patch.timezone.trim();
    if (!isValidIanaTimeZone(timezone)) {
      return {
        ok: false,
        status: 400,
        error: "Ongeldige tijdzone. Gebruik een IANA-naam zoals Europe/Brussels.",
      };
    }
    const { error } = await supabase.from("guilds").upsert(
      {
        guild_id: guildId,
        timezone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "guild_id" }
    );
    if (error) {
      return { ok: false, status: 500, error: error.message };
    }
  }

  if (patch.f1) {
    const { channels, roles } = await listGuildOptions(client, guildId);
    const channelIds = new Set(channels.map((row) => row.id));
    const roleIds = new Set(roles.map((row) => row.id));

    if (patch.f1.channelId !== undefined && patch.f1.channelId !== null) {
      if (channels.length > 0 && !channelIds.has(patch.f1.channelId)) {
        return { ok: false, status: 400, error: "Kies een geldig tekstkanaal in deze server." };
      }
    }
    if (patch.f1.roleId !== undefined && patch.f1.roleId !== null) {
      if (roles.length > 0 && !roleIds.has(patch.f1.roleId)) {
        return { ok: false, status: 400, error: "Kies een geldige rol in deze server." };
      }
    }

    let predictionUrl: string | null | undefined = patch.f1.predictionUrl;
    if (predictionUrl !== undefined) {
      const raw = predictionUrl?.trim() ?? "";
      if (!raw || raw.toLowerCase() === "clear" || raw.toLowerCase() === "none") {
        predictionUrl = null;
      } else {
        const resolved = resolvePredictionUrl(raw, null);
        if (!resolved) {
          return {
            ok: false,
            status: 400,
            error:
              "Gebruik een publieke http(s)-URL zonder inloggegevens (geen localhost of privéhosts).",
          };
        }
        predictionUrl = resolved;
      }
    }

    const saved = await upsertF1ReminderSettings({
      guild_id: guildId,
      ...(patch.f1.enabled !== undefined ? { enabled: patch.f1.enabled } : {}),
      ...(patch.f1.channelId !== undefined ? { channel_id: patch.f1.channelId } : {}),
      ...(patch.f1.roleId !== undefined ? { role_id: patch.f1.roleId } : {}),
      ...(predictionUrl !== undefined ? { prediction_url: predictionUrl } : {}),
    });
    if (!saved) {
      return { ok: false, status: 500, error: "F1-instellingen opslaan mislukt." };
    }
  }

  if (patch.library) {
    const { channels } = await listGuildOptions(client, guildId);
    const channelIds = new Set(channels.map((row) => row.id));
    const current = toPublicLibrarySettings(await getLibrarySettings(guildId), guildId);
    const resolved = resolveLibrarySettingsPatch({
      current,
      patch: patch.library,
      validChannelIds: channelIds,
    });
    if (!resolved.ok) {
      return { ok: false, status: 400, error: resolved.error };
    }
    const saved = await upsertLibrarySettings({
      guild_id: guildId,
      enabled: resolved.next.enabled,
      channel_id: resolved.next.channelId,
      open_minutes: resolved.next.openMinutes,
      close_minutes: resolved.next.closeMinutes,
    });
    if (!saved) {
      return { ok: false, status: 500, error: "Bibliotheekinstellingen opslaan mislukt." };
    }
  }

  if (patch.logging) {
    const { channels } = await listGuildOptions(client, guildId);
    const channelIds = new Set(channels.map((row) => row.id));

    if (patch.logging.channelId !== undefined && patch.logging.channelId !== null) {
      if (channels.length > 0 && !channelIds.has(patch.logging.channelId)) {
        return { ok: false, status: 400, error: "Kies een geldig tekstkanaal in deze server." };
      }
    }

    const saved = await upsertAuditLogSettings({
      guild_id: guildId,
      ...(patch.logging.enabled !== undefined ? { enabled: patch.logging.enabled } : {}),
      ...(patch.logging.channelId !== undefined ? { channel_id: patch.logging.channelId } : {}),
      ...(patch.logging.logMembers !== undefined ? { log_members: patch.logging.logMembers } : {}),
      ...(patch.logging.logRoles !== undefined ? { log_roles: patch.logging.logRoles } : {}),
      ...(patch.logging.logChannels !== undefined ? { log_channels: patch.logging.logChannels } : {}),
      ...(patch.logging.logBotConfig !== undefined
        ? { log_bot_config: patch.logging.logBotConfig }
        : {}),
      ...(patch.logging.logCommandErrors !== undefined
        ? { log_command_errors: patch.logging.logCommandErrors }
        : {}),
    });
    if (!saved) {
      return { ok: false, status: 500, error: "Logging-instellingen opslaan mislukt." };
    }
  }

  const settings = await loadBotSettingsPayload(guildId, client);
  const changes = summarizeBotSettingsChanges(previousPayload, settings);
  if (changes.length > 0 && client) {
    const nextLogging = await getAuditLogSettings(guildId);
    void logBotConfigChange(client, {
      guildId,
      actor: options?.actor,
      details: changes.join("\n"),
      settings: settingsForBotConfigAudit(previousLogging, nextLogging, guildId),
    }).catch((err) => console.warn("audit: bot config log failed", err));
  }

  if (
    client &&
    (patch.library !== undefined ||
      (patch.timezone !== undefined && settings.library.enabled && settings.library.channelId))
  ) {
    try {
      await reconcileLibraryPanel(client, guildId);
    } catch (err) {
      console.warn(
        "library: reconcile after settings save failed",
        err instanceof Error ? err.message : err
      );
    }
  }

  return { ok: true, settings };
}
