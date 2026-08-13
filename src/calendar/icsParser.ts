import nodeIcal from "node-ical";
import type { CalendarResponse, ParameterValue, VEvent } from "node-ical";
import { normalizeIcsDescription } from "../../shared/timetable/eventMeta.js";
import { parseActivitySummary } from "./eventUtils.js";
import type { TimetableEvent } from "./types.js";

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

function isVEvent(component: CalendarResponse[string]): component is VEvent {
  return Boolean(component && typeof component === "object" && "type" in component && component.type === "VEVENT");
}

export function parseIcsEvents(
  icsContent: string,
  userId: string,
  initials: string,
  rangeStart: Date,
  rangeEnd: Date
): TimetableEvent[] {
  const parsed = nodeIcal.sync.parseICS(icsContent);
  const events: TimetableEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (!isVEvent(component)) continue;
    if (!component.start) continue;

    const summary = paramValueToString(component.summary) ?? "Untitled";
    const location = paramValueToString(component.location);
    const description = paramValueToString(component.description);

    if (component.rrule) {
      const instances = nodeIcal.expandRecurringEvent(component, {
        from: rangeStart,
        to: rangeEnd,
        expandOngoing: true,
      });

      for (const instance of instances) {
        const start = toDate(instance.start);
        if (!start) continue;
        const end = toDate(instance.end);
        events.push(
          mapInstanceToEvent(
            userId,
            initials,
            paramValueToString(instance.summary) ?? summary,
            start,
            end,
            Boolean(instance.isFullDay),
            location,
            description
          )
        );
      }
      continue;
    }

    const start = toDate(component.start);
    if (!start) continue;

    const end = toDate(component.end);
    const allDay = component.datetype === "date";
    const effectiveEnd = end ?? new Date(start.getTime() + eventDurationMs(component, start));

    if (effectiveEnd.getTime() < rangeStart.getTime() || start.getTime() > rangeEnd.getTime()) {
      continue;
    }

    events.push(
      mapInstanceToEvent(userId, initials, summary, start, effectiveEnd, allDay, location, description)
    );
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}
