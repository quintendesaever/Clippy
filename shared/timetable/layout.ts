import { toZonedTime } from "date-fns-tz";
import {
  DEFAULT_DISPLAY_HOUR_END,
  DEFAULT_DISPLAY_HOUR_START,
  HOUR_MAX,
  HOUR_MIN,
} from "./theme.js";

export type LayoutEvent = {
  start: Date;
  end: Date;
  title: string;
  userId: string;
  allDay: boolean;
  /** Distinguishes ICS lessons from shared activities when merging cards. */
  source?: "ics" | "activity";
  typeBadges?: string[];
};

export type RenderCard = {
  start: Date;
  end: Date;
  title: string;
  userIds: string[];
  startMs: number;
  endMs: number;
  source: "ics" | "activity";
  typeBadges: string[];
};

export type TimelineLayout = {
  hourStart: number;
  hourEnd: number;
  hourCount: number;
  colWidth: number;
  gridInset: number;
};

export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function computeDisplayHourRange(
  events: LayoutEvent[],
  timezone: string
): { hourStart: number; hourEnd: number } {
  const timed = events.filter((event) => !event.allDay);
  if (timed.length === 0) {
    return { hourStart: DEFAULT_DISPLAY_HOUR_START, hourEnd: DEFAULT_DISPLAY_HOUR_END };
  }

  let minMinutes = Infinity;
  let maxMinutes = -Infinity;
  for (const event of timed) {
    const start = toZonedTime(event.start, timezone);
    const end = toZonedTime(event.end, timezone);
    minMinutes = Math.min(minMinutes, start.getHours() * 60 + start.getMinutes());
    maxMinutes = Math.max(maxMinutes, end.getHours() * 60 + end.getMinutes());
  }

  const eventStartHour = Math.floor(minMinutes / 60);
  const eventEndHour = Math.max(Math.ceil(maxMinutes / 60), eventStartHour + 1);

  const hourStart = Math.max(
    HOUR_MIN,
    Math.min(DEFAULT_DISPLAY_HOUR_START, eventStartHour)
  );
  const hourEnd = Math.min(
    HOUR_MAX,
    Math.max(DEFAULT_DISPLAY_HOUR_END, eventEndHour)
  );

  return { hourStart, hourEnd };
}

export type FixedHourRange = {
  hourStart: number;
  hourEnd: number;
};

export function createTimelineLayout(
  events: LayoutEvent[],
  timezone: string,
  width: number,
  gridInset: number,
  fixedRange?: FixedHourRange
): TimelineLayout {
  const { hourStart, hourEnd } = fixedRange ?? computeDisplayHourRange(events, timezone);
  const hourCount = Math.max(hourEnd - hourStart, 1);
  return {
    hourStart,
    hourEnd,
    hourCount,
    colWidth: (width - 2 * gridInset) / hourCount,
    gridInset,
  };
}

/** Hours from the timeline origin (`hourStart:00`). */
export function hoursFromStart(hour: number, minute: number, layout: TimelineLayout): number {
  return hour - layout.hourStart + minute / 60;
}

/** Full axis width in the same units as `timeToX` (inner grid plus side insets). */
export function layoutAxisWidth(layout: TimelineLayout): number {
  return 2 * layout.gridInset + layout.colWidth * layout.hourCount;
}

/**
 * Map a clock time onto the shared horizontal axis.
 * `hourStart:00` is the first tick; `hourEnd:00` is the last tick.
 * Labels, grid lines, and event edges all use this function.
 */
export function timeToX(hour: number, minute: number, layout: TimelineLayout): number {
  return layout.gridInset + hoursFromStart(hour, minute, layout) * layout.colWidth;
}

export function timeToPercent(
  hour: number,
  minute: number,
  layout: TimelineLayout
): number {
  const total = layoutAxisWidth(layout);
  if (total <= 0) return 0;
  return (timeToX(hour, minute, layout) / total) * 100;
}

export function clipEventToGrid(
  start: Date,
  end: Date,
  timezone: string,
  layout: TimelineLayout
): { startHour: number; startMinute: number; endHour: number; endMinute: number } | null {
  const startZoned = toZonedTime(start, timezone);
  const endZoned = toZonedTime(end, timezone);
  const startMinutes = startZoned.getHours() * 60 + startZoned.getMinutes();
  const endMinutes = endZoned.getHours() * 60 + endZoned.getMinutes();
  const gridStart = layout.hourStart * 60;
  const gridEnd = layout.hourEnd * 60;

  if (endMinutes <= gridStart || startMinutes >= gridEnd) return null;

  const clippedStart = Math.max(startMinutes, gridStart);
  const clippedEnd = Math.min(endMinutes, gridEnd);
  if (clippedEnd <= clippedStart) return null;

  return {
    startHour: Math.floor(clippedStart / 60),
    startMinute: clippedStart % 60,
    endHour: Math.floor(clippedEnd / 60),
    endMinute: clippedEnd % 60,
  };
}

export function typeBadgeKey(badges: string[] | undefined): string {
  return [...(badges ?? [])].map((badge) => badge.toUpperCase()).sort().join(",");
}

export function groupDayEvents(events: LayoutEvent[]): RenderCard[] {
  const groups = new Map<string, RenderCard>();

  for (const event of events) {
    if (event.allDay) continue;

    const source = event.source ?? "ics";
    const typeBadges = event.typeBadges ?? [];
    const key = `${source}|${event.start.getTime()}|${event.end.getTime()}|${event.title.toLowerCase()}|${typeBadgeKey(typeBadges)}`;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.userIds.includes(event.userId)) {
        existing.userIds.push(event.userId);
      }
      continue;
    }

    groups.set(key, {
      start: event.start,
      end: event.end,
      title: event.title,
      userIds: [event.userId],
      startMs: event.start.getTime(),
      endMs: event.end.getTime(),
      source,
      typeBadges,
    });
  }

  return [...groups.values()].sort((a, b) => a.startMs - b.startMs);
}

export function cardsOverlap(a: RenderCard, b: RenderCard): boolean {
  return a.startMs < b.endMs && a.endMs > b.startMs;
}

export function packEventsIntoRows(cards: RenderCard[]): RenderCard[][] {
  const rows: RenderCard[][] = [];
  for (const card of cards) {
    let placed = false;
    for (const row of rows) {
      if (!row.some((existing) => cardsOverlap(existing, card))) {
        row.push(card);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([card]);
  }
  return rows;
}
