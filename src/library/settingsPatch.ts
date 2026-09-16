import {
  DEFAULT_CLOSE_MINUTES,
  DEFAULT_OPEN_MINUTES,
  type LibraryPublicSettings,
  type LibrarySettings,
  type LibrarySettingsPatch,
} from "./types.js";
import { formatMinutesAsHhmm, isValidOpenCloseMinutes } from "./time.js";

export function emptyLibrarySettings(guildId: string): LibrarySettings {
  return {
    guild_id: guildId,
    enabled: false,
    channel_id: null,
    open_minutes: DEFAULT_OPEN_MINUTES,
    close_minutes: DEFAULT_CLOSE_MINUTES,
    message_id: null,
    schedule_day_key: null,
    last_cleanup_day_key: null,
  };
}

export function toPublicLibrarySettings(
  row: LibrarySettings | null,
  guildId: string
): LibraryPublicSettings {
  const settings = row ?? emptyLibrarySettings(guildId);
  return {
    enabled: Boolean(settings.enabled),
    channelId: settings.channel_id,
    openMinutes: settings.open_minutes,
    closeMinutes: settings.close_minutes,
  };
}

export function resolveLibrarySettingsPatch(input: {
  current: LibraryPublicSettings;
  patch: LibrarySettingsPatch;
  validChannelIds: ReadonlySet<string> | null;
}): { ok: true; next: LibraryPublicSettings } | { ok: false; error: string } {
  const next: LibraryPublicSettings = {
    enabled: input.patch.enabled ?? input.current.enabled,
    channelId: input.patch.channelId !== undefined ? input.patch.channelId : input.current.channelId,
    openMinutes: input.patch.openMinutes ?? input.current.openMinutes,
    closeMinutes: input.patch.closeMinutes ?? input.current.closeMinutes,
  };

  if (input.patch.channelId !== undefined && input.patch.channelId !== null) {
    if (input.validChannelIds && input.validChannelIds.size > 0 && !input.validChannelIds.has(input.patch.channelId)) {
      return { ok: false, error: "Kies een geldig tekstkanaal in deze server." };
    }
  }

  if (!isValidOpenCloseMinutes(next.openMinutes, next.closeMinutes)) {
    return {
      ok: false,
      error: `Opening en sluiting moeten HH:mm zijn, en sluiting moet later zijn dan opening (nu ${formatMinutesAsHhmm(next.openMinutes)}–${formatMinutesAsHhmm(next.closeMinutes)}).`,
    };
  }

  if (next.enabled && !next.channelId) {
    return { ok: false, error: "Kies een kanaal voordat je het bibliotheekrooster inschakelt." };
  }

  return { ok: true, next };
}
