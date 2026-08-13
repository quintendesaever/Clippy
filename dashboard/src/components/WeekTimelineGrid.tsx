import { useMemo } from "react";
import {
  clipEventToGrid,
  createTimelineLayout,
  formatHourLabel,
  groupDayEvents,
  packEventsIntoRows,
  timeToPercent,
  type LayoutEvent,
  type RenderCard,
} from "@shared/timetable/layout";
import { TIMETABLE_WIDTH } from "@shared/timetable/theme";
import { DEFAULT_HOUR_END, DEFAULT_HOUR_START } from "../lib/availability";
import { formatDayMonth, formatTime } from "../lib/dates";
import type { TimetableEventDto } from "../types";
import EventCard from "./EventCard";

const DASHBOARD_GRID_INSET = 0;
const FIXED_HOUR_RANGE = { hourStart: DEFAULT_HOUR_START, hourEnd: DEFAULT_HOUR_END };

export type WeekTimelineDay = {
  dayKey: string;
  dayLabel: string;
  events: TimetableEventDto[];
};

type WeekTimelineGridProps = {
  days: WeekTimelineDay[];
  timezone: string;
  avatarByUser: Map<string, string | null>;
  onEventClick: (event: TimetableEventDto) => void;
  onEmptySlotClick?: (dayKey: string, hour: number, minute: number) => void;
  scrollable?: boolean;
};

function formatCardTimeRange(start: Date, end: Date): string {
  return `${formatTime(start.toISOString())}–${formatTime(end.toISOString())}`;
}

function eventSource(ev: TimetableEventDto): "ics" | "activity" {
  return ev.source ?? "ics";
}

function toLayoutEvents(events: TimetableEventDto[]): LayoutEvent[] {
  return events.map((ev) => ({
    start: new Date(ev.start),
    end: new Date(ev.end),
    title: ev.title,
    userId: ev.userId,
    allDay: ev.allDay,
    source: eventSource(ev),
  }));
}

function buildEventLookup(events: TimetableEventDto[]): Map<string, TimetableEventDto> {
  const map = new Map<string, TimetableEventDto>();
  for (const ev of events) {
    const key = `${eventSource(ev)}|${ev.start}|${ev.end}|${ev.title.toLowerCase()}`;
    map.set(key, ev);
  }
  return map;
}

function lookupKeyForCard(card: RenderCard): string {
  return `${card.source}|${card.start.toISOString()}|${card.end.toISOString()}|${card.title.toLowerCase()}`;
}

function cardPositionPercent(
  card: RenderCard,
  timezone: string,
  layout: ReturnType<typeof createTimelineLayout>
) {
  const times = clipEventToGrid(card.start, card.end, timezone, layout);
  if (!times) return null;

  const left = timeToPercent(times.startHour, times.startMinute, layout);
  const right = timeToPercent(times.endHour, times.endMinute, layout);
  return {
    leftPercent: left,
    widthPercent: right - left,
  };
}

export default function WeekTimelineGrid({
  days,
  timezone,
  avatarByUser,
  onEventClick,
  onEmptySlotClick,
  scrollable = false,
}: WeekTimelineGridProps) {
  const allEvents = useMemo(() => days.flatMap((d) => d.events), [days]);

  const layout = useMemo(
    () =>
      createTimelineLayout(
        toLayoutEvents(allEvents),
        timezone,
        TIMETABLE_WIDTH,
        DASHBOARD_GRID_INSET,
        FIXED_HOUR_RANGE
      ),
    [allEvents, timezone]
  );

  const hours = useMemo(
    () => Array.from({ length: layout.hourCount + 1 }, (_, i) => layout.hourStart + i),
    [layout]
  );

  const dayRows = useMemo(
    () =>
      days.map((day) => {
        const layoutEvents = toLayoutEvents(day.events);
        const grouped = groupDayEvents(layoutEvents);
        const packed = packEventsIntoRows(grouped);
        const isEmpty = packed.length === 0;
        const rows = isEmpty ? [[]] : packed;
        return {
          ...day,
          packedRows: rows,
          isEmpty,
          eventLookup: buildEventLookup(day.events),
        };
      }),
    [days]
  );

  function handleCardClick(
    card: RenderCard,
    eventLookup: Map<string, TimetableEventDto>
  ) {
    const ev = eventLookup.get(lookupKeyForCard(card));
    if (ev) onEventClick(ev);
  }

  function handleTrackClick(
    dayKey: string,
    e: React.MouseEvent<HTMLDivElement>
  ) {
    if (!onEmptySlotClick) return;
    if ((e.target as HTMLElement).closest(".eventCard")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const totalMinutes = layout.hourCount * 60;
    const minutesFromStart = Math.round((ratio * totalMinutes) / 30) * 30;
    const absolute = layout.hourStart * 60 + minutesFromStart;
    const hour = Math.floor(absolute / 60);
    const minute = absolute % 60;
    onEmptySlotClick(dayKey, hour, minute);
  }

  return (
    <div className={`weekTimelineGridWrap${scrollable ? " weekTimelineGridWrapScroll" : ""}`}>
      <div className="weekTimelineGrid">
        <div className="weekTimelineHeader">
          <div className="weekTimelineCorner" />
          <div className="weekTimelineHourHeader">
            {hours.map((hour) => (
              <div key={hour} className="timelineHourLabel">
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>
        </div>

        {dayRows.map((day) => (
          <div key={day.dayKey} className="weekTimelineDaySection">
            <div className="weekTimelineDayLabel">
              <span className="weekTimelineDayName">{day.dayLabel}</span>
              <span className="weekTimelineDayDate">{formatDayMonth(day.dayKey)}</span>
            </div>
            <div className="weekTimelineDayBody">
              <div className="weekTimelineGridOverlay" aria-hidden>
                {Array.from({ length: layout.hourCount + 1 }, (_, i) => (
                  <div
                    key={i}
                    className="timelineGridLine"
                    style={{ left: `${(i / layout.hourCount) * 100}%` }}
                  />
                ))}
              </div>
              {day.packedRows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className={`weekTimelineTrack${day.isEmpty ? " weekTimelineTrackEmpty" : ""}${
                    onEmptySlotClick ? " weekTimelineTrackClickable" : ""
                  }`}
                  onClick={
                    onEmptySlotClick ? (e) => handleTrackClick(day.dayKey, e) : undefined
                  }
                >
                  {row.map((card, cardIndex) => {
                    const pos = cardPositionPercent(card, timezone, layout);
                    if (!pos) return null;
                    const key = lookupKeyForCard(card);
                    const ev = day.eventLookup.get(key);
                    return (
                      <EventCard
                        key={`${card.source}-${card.startMs}-${cardIndex}`}
                        title={card.title}
                        timeLabel={formatCardTimeRange(card.start, card.end)}
                        userIds={card.userIds}
                        avatarByUser={avatarByUser}
                        leftPercent={pos.leftPercent}
                        widthPercent={pos.widthPercent}
                        isActivity={ev?.source === "activity" || card.source === "activity"}
                        onClick={() => handleCardClick(card, day.eventLookup)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
