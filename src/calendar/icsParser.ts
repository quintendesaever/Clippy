import { fromZonedTime } from "date-fns-tz";
import nodeIcal from "node-ical";
import type { CalendarResponse, ParameterValue, VEvent } from "node-ical";
import { normalizeIcsDescription } from "../../shared/timetable/eventMeta.js";
import { parseActivitySummary } from "./eventUtils.js";
import type { TimetableEvent } from "./types.js";

/** node-ical attaches TZID / UTC as `tz` on Date values; floating times omit it. */
type DateWithIcalTz = Date & { tz?: string };

function paramValueToString(value: ParameterValue | undefined): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  return value.val;
}

function toDate(value: Date | { toJSDate?: () => Date } | string | number | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "toJSDate" in value && typeof value.toJSDate === "function") {
    return value.toJSDate();
  }
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFloatingIcalDate(date: Date): boolean {
  const tz = (date as DateWithIcalTz).tz;
  return typeof tz !== "string" || !tz.trim();
}

/**
 * node-ical stores floating datetimes in the process-local wall clock.
 * Reinterpret those wall components in the calendar/guild zone so Docker UTC
 * hosts do not treat school times as UTC instants.
 */
function asFloatingInTimezone(date: Date, timezone: string): Date {
  return fromZonedTime(
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds()
    ),
    timezone
  );
}

function resolveIcalDate(date: Date, floatingTimezone: string | undefined): Date {
  if (!floatingTimezone || !isFloatingIcalDate(date)) return date;
  return asFloatingInTimezone(date, floatingTimezone);
}

function eventDurationMs(event: VEvent, start: Date): number {
  const end = toDate(event.end);
  if (end) {
    const duration = end.getTime() - start.getTime();
    if (duration > 0) return duration;
  }
  return event.datetype === "date" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
}

function mapInstanceToEvent(
  userId: string,
  initials: string,
  summary: string,
  start: Date,
  end: Date | null,
  allDay: boolean,
  location?: string,
  description?: string
): TimetableEvent {
  const resolvedEnd =
    end ?? new Date(start.getTime() + (allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000));
  const rawTitle = summary.trim() || "Untitled";
  const normalizedDescription = normalizeIcsDescription(description);
  const { title, typeBadges } = parseActivitySummary(rawTitle, normalizedDescription);

  return {
    userId,
    initials,
    title,
    rawTitle,
    typeBadges,
    start,
    end: resolvedEnd,
    allDay,
    location: location?.trim() || undefined,
    description: normalizedDescription,
    source: "ics",
  };
}

function isCancelledStatus(status: unknown): boolean {
  if (typeof status !== "string") return false;
  return status.trim().toUpperCase() === "CANCELLED";
}

function isVEvent(component: CalendarResponse[string]): component is VEvent {
  return Boolean(component && typeof component === "object" && "type" in component && component.type === "VEVENT");
}

function overlapsRange(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return end.getTime() >= rangeStart.getTime() && start.getTime() <= rangeEnd.getTime();
}

/** Widen recurrence expansion so floating→zone reinterpret does not drop edge instances. */
const RECURRENCE_EXPAND_PAD_MS = 36 * 60 * 60 * 1000;

export function parseIcsEvents(
  icsContent: string,
  userId: string,
  initials: string,
  rangeStart: Date,
  rangeEnd: Date,
  /** IANA zone for floating (no TZID / no Z) datetimes; typically member or guild timezone. */
  floatingTimezone?: string
): TimetableEvent[] {
  const parsed = nodeIcal.sync.parseICS(icsContent);
  const events: TimetableEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (!isVEvent(component)) continue;
    if (!component.start) continue;
    if (isCancelledStatus(component.status)) continue;

    const summary = paramValueToString(component.summary) ?? "Untitled";
    const location = paramValueToString(component.location);
    const description = paramValueToString(component.description);

    if (component.rrule) {
      const instances = nodeIcal.expandRecurringEvent(component, {
        from: new Date(rangeStart.getTime() - RECURRENCE_EXPAND_PAD_MS),
        to: new Date(rangeEnd.getTime() + RECURRENCE_EXPAND_PAD_MS),
        expandOngoing: true,
      });

      for (const instance of instances) {
        const rawStart = toDate(instance.start);
        if (!rawStart) continue;
        const start = resolveIcalDate(rawStart, floatingTimezone);
        const rawEnd = toDate(instance.end);
        const end = rawEnd ? resolveIcalDate(rawEnd, floatingTimezone) : null;
        const effectiveEnd =
          end ?? new Date(start.getTime() + (instance.isFullDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000));
        if (!overlapsRange(start, effectiveEnd, rangeStart, rangeEnd)) continue;

        events.push(
          mapInstanceToEvent(
            userId,
            initials,
            paramValueToString(instance.summary) ?? summary,
            start,
            effectiveEnd,
            Boolean(instance.isFullDay),
            location,
            description
          )
        );
      }
      continue;
    }

    const rawStart = toDate(component.start);
    if (!rawStart) continue;

    const start = resolveIcalDate(rawStart, floatingTimezone);
    const rawEnd = toDate(component.end);
    const end = rawEnd ? resolveIcalDate(rawEnd, floatingTimezone) : null;
    const allDay = component.datetype === "date";
    const effectiveEnd = end ?? new Date(start.getTime() + eventDurationMs(component, rawStart));

    if (!overlapsRange(start, effectiveEnd, rangeStart, rangeEnd)) continue;

    events.push(
      mapInstanceToEvent(userId, initials, summary, start, effectiveEnd, allDay, location, description)
    );
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}
