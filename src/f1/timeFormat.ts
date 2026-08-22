import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/** Same convention as formatInTimezone, without importing the stats/Supabase helpers. */
export function formatF1DateTime(utcDate: Date, ianaTimezone: string): string {
  const zoned = toZonedTime(utcDate, ianaTimezone);
  return format(zoned, "EEE, MMM d, yyyy HH:mm zzz");
}
