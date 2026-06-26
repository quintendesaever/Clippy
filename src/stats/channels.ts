import { supabase } from "../supabase.js";

export async function ensureChannel(
  guildId: string,
  channelId: string,
  name?: string
): Promise<void> {
  const { error } = await supabase.from("channels").upsert(
    {
      guild_id: guildId,
      channel_id: channelId,
      name: name ?? "unknown",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "guild_id,channel_id" }
  );
  if (error) {
    console.error("stats: ensure channel:", error.message);
  }
}
