import { zonedStartEndMinutes } from "./dates.js";
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
  /** Activity row id — required so distinct activities do not merge. */
  id?: string;
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
  id?: string;
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
    const { startMinutes, endMinutes } = zonedStartEndMinutes(event.start, event.end, timezone);
    minMinutes = Math.min(minMinutes, startMinutes);
    maxMinutes = Math.max(maxMinutes, endMinutes);
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
  const { startMinutes, endMinutes } = zonedStartEndMinutes(start, end, timezone);
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

export function eventMergeKey(event: {
  source?: "ics" | "activity";
  id?: string;
  start: Date | string | number;
  end: Date | string | number;
  title: string;
  typeBadges?: string[];
}): string {
  const source = event.source ?? "ics";
  if (source === "activity" && event.id) {
    return `activity|${event.id}`;
  }
  const startMs =
    event.start instanceof Date
      ? event.start.getTime()
      : typeof event.start === "number"
        ? event.start
        : new Date(event.start).getTime();
  const endMs =
    event.end instanceof Date
      ? event.end.getTime()
      : typeof event.end === "number"
        ? event.end
        : new Date(event.end).getTime();
  return `${source}|${startMs}|${endMs}|${event.title.toLowerCase()}|${typeBadgeKey(event.typeBadges)}`;
}

function toRenderCard(event: LayoutEvent, source: "ics" | "activity"): RenderCard {
  return {
    start: event.start,
    end: event.end,
    title: event.title,
    userIds: [event.userId],
    startMs: event.start.getTime(),
    endMs: event.end.getTime(),
    source,
    typeBadges: event.typeBadges ?? [],
    ...(event.id ? { id: event.id } : {}),
  };
}

export function groupDayEvents(events: LayoutEvent[]): RenderCard[] {
  const groups = new Map<string, RenderCard>();

  for (const event of events) {
    if (event.allDay) continue;

    const source = event.source ?? "ics";
    const key = eventMergeKey({ ...event, source });
    const existing = groups.get(key);
    if (existing) {
      if (!existing.userIds.includes(event.userId)) {
        existing.userIds.push(event.userId);
      }
      continue;
    }

    groups.set(key, toRenderCard(event, source));
  }

  return [...groups.values()].sort((a, b) => a.startMs - b.startMs);
}

export function groupAllDayEvents(events: LayoutEvent[]): RenderCard[] {
  const groups = new Map<string, RenderCard>();

  for (const event of events) {
    if (!event.allDay) continue;

    const source = event.source ?? "ics";
    const key = eventMergeKey({ ...event, source });
    const existing = groups.get(key);
    if (existing) {
      if (!existing.userIds.includes(event.userId)) {
        existing.userIds.push(event.userId);
      }
      continue;
    }

    groups.set(key, toRenderCard(event, source));
  }

  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
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

function countUsers(cards: RenderCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    for (const userId of card.userIds) {
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
    }
  }
  return counts;
}

function compareUsersByPriority(a: string, b: string, counts: Map<string, number>): number {
  const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
  if (diff !== 0) return diff;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function primaryOwner(card: RenderCard, rank: Map<string, number>): string {
  let best = card.userIds[0] ?? "";
  let bestRank = rank.get(best) ?? Number.POSITIVE_INFINITY;
  for (let i = 1; i < card.userIds.length; i++) {
    const userId = card.userIds[i]!;
    const userRank = rank.get(userId) ?? Number.POSITIVE_INFINITY;
    if (userRank < bestRank) {
      best = userId;
      bestRank = userRank;
    }
  }
  return best;
}

function sublaneFits(lane: RenderCard[], sublane: RenderCard[]): boolean {
  return !sublane.some((card) => lane.some((existing) => cardsOverlap(existing, card)));
}

function compareCardsInLane(a: RenderCard, b: RenderCard): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  return a.title.localeCompare(b.title);
}

/**
 * Per-day vertical layout: rank users by that day's activity count, keep each
 * user's cards together, then compact non-overlapping users into shared lanes.
 */
export function calculateDayLayout(events: LayoutEvent[]): RenderCard[][] {
  const cards = groupDayEvents(events);
  if (cards.length === 0) return [];

  const counts = countUsers(cards);
  const userOrder = [...counts.keys()].sort((a, b) => compareUsersByPriority(a, b, counts));
  const rank = new Map(userOrder.map((userId, index) => [userId, index]));

  const byOwner = new Map<string, RenderCard[]>();
  for (const card of cards) {
    const owner = primaryOwner(card, rank);
    const owned = byOwner.get(owner);
    if (owned) owned.push(card);
    else byOwner.set(owner, [card]);
  }

  const lanes: RenderCard[][] = [];
  for (const userId of userOrder) {
    const owned = byOwner.get(userId);
    if (!owned?.length) continue;

    owned.sort(compareCardsInLane);
    const sublanes = packEventsIntoRows(owned);
    for (const sublane of sublanes) {
      let placed = false;
      for (const lane of lanes) {
        if (sublaneFits(lane, sublane)) {
          lane.push(...sublane);
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push([...sublane]);
    }
  }

  for (const lane of lanes) {
    lane.sort(compareCardsInLane);
  }
  return lanes;
}
