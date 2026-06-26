import { format, subDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { supabase } from "../supabase.js";

const DEFAULT_TIMEZONE = "UTC";

export async function getGuildTimezone(guildId: string): Promise<string> {
  const { data } = await supabase
    .from("guilds")
    .select("timezone")
    .eq("guild_id", guildId)
    .maybeSingle();
  return data?.timezone ?? DEFAULT_TIMEZONE;
}

export async function ensureGuild(guildId: string): Promise<void> {
  const tz = await getGuildTimezone(guildId);
  const { error } = await supabase.from("guilds").upsert(
    { guild_id: guildId, timezone: tz, updated_at: new Date().toISOString() },
    { onConflict: "guild_id" }
  );
  if (error) {
    console.error("stats: ensure guild:", error.message);
  }
}

export async function ensureGuildAndGetTimezone(guildId: string): Promise<string> {
  await ensureGuild(guildId);
  return getGuildTimezone(guildId);
}

export function toLocalHourAndDay(
  utcDate: Date,
  ianaTimezone: string
): { hourLocal: number; dayLocal: string } {
  const zoned = toZonedTime(utcDate, ianaTimezone);
  const hourLocal = zoned.getHours();
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  const dayLocal = `${year}-${month}-${day}`;
  return { hourLocal, dayLocal };
}

export function getTodayInGuildTz(ianaTimezone: string): string {
  const zoned = toZonedTime(new Date(), ianaTimezone);
  return format(zoned, "yyyy-MM-dd");
}

export function getNDaysAgoInGuildTz(ianaTimezone: string, n: number): string {
  const zoned = toZonedTime(subDays(new Date(), n), ianaTimezone);
  return format(zoned, "yyyy-MM-dd");
}

export function getCurrentHourInGuildTz(ianaTimezone: string): number {
  const zoned = toZonedTime(new Date(), ianaTimezone);
  return zoned.getHours();
}

export function getDayLocalFromIso(isoString: string, ianaTimezone: string): string {
  const zoned = toZonedTime(new Date(isoString), ianaTimezone);
  return format(zoned, "yyyy-MM-dd");
}

export function formatInTimezone(utcDate: Date, ianaTimezone: string): string {
  const zoned = toZonedTime(utcDate, ianaTimezone);
  return format(zoned, "EEE, MMM d, yyyy HH:mm zzz");
}
