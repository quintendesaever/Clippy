import { fromZonedTime } from "date-fns-tz";
import { dayKeyInTimezone } from "../../shared/timetable/dates.js";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type VisitTimeError =
  | "malformed_start"
  | "malformed_end"
  | "end_not_after_start"
  | "outside_hours";

export function parseHhmm(value: string): number | null {
  const match = HHMM.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatMinutesAsHhmm(minutes: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.trunc(minutes)));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function isValidOpenCloseMinutes(openMinutes: number, closeMinutes: number): boolean {
  return (
    Number.isInteger(openMinutes) &&
    Number.isInteger(closeMinutes) &&
    openMinutes >= 0 &&
    closeMinutes <= 1440 &&
    closeMinutes > openMinutes
  );
}

export function zonedDateFromDayAndMinutes(
  dayKey: string,
  minutes: number,
  timezone: string
): Date {
  if (!DAY_KEY.test(dayKey)) {
    throw new Error(`Invalid day key: ${dayKey}`);
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    throw new Error(`Invalid minutes: ${minutes}`);
  }
  const [year, month, day] = dayKey.split("-").map(Number);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return fromZonedTime(new Date(year, month - 1, day, hours, mins, 0, 0), timezone);
}

export function localDayKey(date: Date, timezone: string): string {
  return dayKeyInTimezone(date, timezone);
}

export function validateVisitHhmm(input: {
  startRaw: string;
  endRaw: string;
  openMinutes: number;
  closeMinutes: number;
}):
  | { ok: true; startMinutes: number; endMinutes: number }
  | { ok: false; error: VisitTimeError } {
  const startMinutes = parseHhmm(input.startRaw);
  if (startMinutes === null) return { ok: false, error: "malformed_start" };
  const endMinutes = parseHhmm(input.endRaw);
  if (endMinutes === null) return { ok: false, error: "malformed_end" };
  if (endMinutes <= startMinutes) return { ok: false, error: "end_not_after_start" };
  if (startMinutes < input.openMinutes || endMinutes > input.closeMinutes) {
    return { ok: false, error: "outside_hours" };
  }
  return { ok: true, startMinutes, endMinutes };
}

export function visitTimeErrorMessage(
  error: VisitTimeError,
  openMinutes: number,
  closeMinutes: number
): string {
  switch (error) {
    case "malformed_start":
      return "Start time must be 24-hour HH:mm (for example 09:30).";
    case "malformed_end":
      return "End time must be 24-hour HH:mm (for example 12:00).";
    case "end_not_after_start":
      return "End time must be after start time.";
    case "outside_hours":
      return `Times must be within library hours (${formatMinutesAsHhmm(openMinutes)}–${formatMinutesAsHhmm(closeMinutes)}).`;
  }
}
