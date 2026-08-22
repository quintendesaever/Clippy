import { toZonedTime } from "date-fns-tz";

export const MAX_TIMETABLE_RANGE_DAYS = 14;

export function dayKeyInTimezone(date: Date, timezone: string): string {
  const zoned = toZonedTime(date, timezone);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTimeInTimezone(isoOrDate: string | Date, timezone: string): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const zoned = toZonedTime(date, timezone);
  return `${String(zoned.getHours()).padStart(2, "0")}:${String(zoned.getMinutes()).padStart(2, "0")}`;
}

export function zonedMinutes(date: Date, timezone: string): number {
  const zoned = toZonedTime(date, timezone);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

/** Treat a midnight end (00:00 after start) as 24:00 on the start day. */
export function zonedStartEndMinutes(
  start: Date,
  end: Date,
  timezone: string
): { startMinutes: number; endMinutes: number } {
  const startMinutes = zonedMinutes(start, timezone);
  let endMinutes = zonedMinutes(end, timezone);
  if (end.getTime() > start.getTime() && endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  return { startMinutes, endMinutes };
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function inclusiveDaySpan(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function getWeekMondayKey(date: Date, timezone: string): string {
  const zoned = toZonedTime(date, timezone);
  const day = zoned.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(zoned);
  monday.setDate(zoned.getDate() + diff);
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const dayNum = String(monday.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}

export function getWeekDayKeys(weekStartDayKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStartDayKey, i));
}

export function isValidIanaTimeZone(timezone: string): boolean {
  if (!timezone.trim()) return false;
  try {
    const supported = (
      Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    if (typeof supported === "function") {
      return supported("timeZone").includes(timezone);
    }
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
