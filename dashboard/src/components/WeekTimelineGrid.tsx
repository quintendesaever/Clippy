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
import { formatDayMonth } from "../lib/dates";
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
};

function toLayoutEvents(events: TimetableEventDto[]): LayoutEvent[] {
  return events.map((ev) => ({
    start: new Date(ev.start),
    end: new Date(ev.end),
    title: ev.title,
    userId: ev.userId,
    allDay: ev.allDay,
  }));
}

function buildEventLookup(events: TimetableEventDto[]): Map<string, TimetableEventDto> {
  const map = new Map<string, TimetableEventDto>();
  for (const ev of events) {
    const key = `${ev.start}|${ev.end}|${ev.title.toLowerCase()}`;
    map.set(key, ev);
  }
  return map;
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
    const key = `${card.start.toISOString()}|${card.end.toISOString()}|${card.title.toLowerCase()}`;
    const ev = eventLookup.get(key);
    if (ev) onEventClick(ev);
  }

  return (
    <div className="weekTimelineGridWrap">
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
            {day.packedRows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className={`weekTimelineTrack${day.isEmpty ? " weekTimelineTrackEmpty" : ""}`}
              >
                {Array.from({ length: layout.hourCount + 1 }, (_, i) => (
                  <div
                    key={i}
                    className="timelineGridLine"
                    style={{ left: `${(i / layout.hourCount) * 100}%` }}
                  />
                ))}
                {row.map((card, cardIndex) => {
                  const pos = cardPositionPercent(card, timezone, layout);
                  if (!pos) return null;
                  return (
                    <EventCard
                      key={`${card.startMs}-${cardIndex}`}
                      title={card.title}
                      userIds={card.userIds}
                      avatarByUser={avatarByUser}
                      leftPercent={pos.leftPercent}
                      widthPercent={pos.widthPercent}
                      onClick={() => handleCardClick(card, day.eventLookup)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
