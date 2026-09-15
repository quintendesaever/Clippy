import type { Client } from "discord.js";
import { ChannelType } from "discord.js";
import { supabase } from "../supabase.js";
import { getGuildTimezone } from "../stats/helpers.js";
import { isValidIanaTimeZone } from "../../shared/timetable/dates.js";
import { resolvePredictionUrl } from "../f1/predictionUrl.js";
import { getF1ReminderSettings, upsertF1ReminderSettings } from "../f1/reminderStorage.js";

export type BotSettingsChannelOption = { id: string; name: string };
export type BotSettingsRoleOption = { id: string; name: string };

export type BotSettingsPayload = {
  timezone: string;
  f1: {
    enabled: boolean;
    channelId: string | null;
    roleId: string | null;
    predictionUrl: string | null;
  };
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
};

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
  const [timezone, settings, options] = await Promise.all([
    getGuildTimezone(guildId),
    getF1ReminderSettings(guildId),
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
    channels: options.channels,
    roles: options.roles,
  };
}

export async function applyBotSettingsPatch(
  guildId: string,
  client: Client | null,
  patch: BotSettingsPatch
): Promise<{ ok: true; settings: BotSettingsPayload } | { ok: false; error: string; status: number }> {
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

  return { ok: true, settings: await loadBotSettingsPayload(guildId, client) };
}
