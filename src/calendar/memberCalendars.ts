import { supabase } from "../supabase.js";
import type { MemberCalendar } from "./types.js";

export async function getGuildMemberCalendars(guildId: string): Promise<MemberCalendar[]> {
  const { data, error } = await supabase
    .from("member_calendars")
    .select("user_id, initials, timezone, ics_url")
    .eq("guild_id", guildId)
    .not("ics_url", "is", null);

  if (error) {
    throw new Error(`Failed to load member calendars: ${error.message}`);
  }

  return (data ?? [])
    .filter((row): row is typeof row & { ics_url: string } => Boolean(row.ics_url?.trim()))
    .map((row) => ({
      user_id: row.user_id,
      initials: row.initials,
      timezone: row.timezone,
      ics_url: row.ics_url.trim(),
    }));
}

export async function getGuildCalendarMembers(guildId: string): Promise<
  { user_id: string; initials: string; timezone: string; ics_url: string | null }[]
> {
  const { data, error } = await supabase
    .from("member_calendars")
    .select("user_id, initials, timezone, ics_url")
    .eq("guild_id", guildId)
    .order("initials");

  if (error) {
    throw new Error(`Failed to load members: ${error.message}`);
  }

  return data ?? [];
}
