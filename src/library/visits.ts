import { supabase } from "../supabase.js";
import { upsertMember } from "../stats/members.js";
import type { LibraryVisit, LibraryVisitInput } from "./types.js";

export { applyVisitClear, applyVisitUpsert } from "./visitState.js";

const TABLE_NAME = "library_visits";

export async function listLibraryVisits(guildId: string, dayKey: string): Promise<LibraryVisit[]> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("guild_id", guildId)
    .eq("day_key", dayKey)
    .order("start_at", { ascending: true });

  if (error) {
    console.error("library: list visits error", error);
    return [];
  }
  return (data ?? []) as LibraryVisit[];
}

export async function upsertCallerVisit(input: {
  guildId: string;
  userId: string;
  dayKey: string;
  startAt: Date;
  endAt: Date;
  profile?: { displayName?: string | null; username?: string | null; avatarHash?: string | null };
}): Promise<LibraryVisit | null> {
  await upsertMember(input.guildId, input.userId, input.profile?.avatarHash, {
    displayName: input.profile?.displayName,
    username: input.profile?.username,
    isBot: false,
  });

  const row: LibraryVisitInput = {
    guild_id: input.guildId,
    user_id: input.userId,
    day_key: input.dayKey,
    start_at: input.startAt.toISOString(),
    end_at: input.endAt.toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: "guild_id,user_id,day_key" }
    )
    .select("*")
    .maybeSingle<LibraryVisit>();

  if (error) {
    console.error("library: upsert visit error", error);
    return null;
  }
  return data;
}

export async function clearCallerVisit(input: {
  guildId: string;
  userId: string;
  dayKey: string;
}): Promise<boolean> {
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq("guild_id", input.guildId)
    .eq("user_id", input.userId)
    .eq("day_key", input.dayKey);

  if (error) {
    console.error("library: clear visit error", error);
    return false;
  }
  return true;
}
