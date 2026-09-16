import { supabase } from "../supabase.js";
import { ensureChannel } from "../stats/channels.js";
import { ensureGuild } from "../stats/helpers.js";
import type { LibrarySettings } from "./types.js";
import { emptyLibrarySettings } from "./settingsPatch.js";

export {
  emptyLibrarySettings,
  resolveLibrarySettingsPatch,
  toPublicLibrarySettings,
} from "./settingsPatch.js";

const TABLE_NAME = "library_settings";

export async function getLibrarySettings(guildId: string): Promise<LibrarySettings | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("guild_id", guildId)
    .maybeSingle<LibrarySettings>();

  if (error) {
    console.error("library: get settings error", error);
    return null;
  }
  return data ?? null;
}

export async function upsertLibrarySettings(
  partial: Partial<LibrarySettings> & { guild_id: string }
): Promise<LibrarySettings | null> {
  const existing = await getLibrarySettings(partial.guild_id);
  const base = existing ?? emptyLibrarySettings(partial.guild_id);
  const payload: LibrarySettings = {
    ...base,
    ...partial,
    updated_at: new Date().toISOString(),
  };

  await ensureGuild(payload.guild_id);
  if (payload.channel_id) {
    await ensureChannel(payload.guild_id, payload.channel_id);
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(payload, { onConflict: "guild_id" })
    .select("*")
    .maybeSingle<LibrarySettings>();

  if (error) {
    console.error("library: upsert settings error", error);
    return null;
  }
  return data;
}
