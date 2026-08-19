import { useMemo } from "react";
import {
  clipEventToGrid,
  createTimelineLayout,
  formatHourLabel,
  groupDayEvents,
  packEventsIntoRows,
  timeToPercent,
  typeBadgeKey,
  type LayoutEvent,
  type RenderCard,
} from "@shared/timetable/layout";
import { TIMETABLE_WIDTH, GRID_INSET_X } from "@shared/timetable/theme";
import { formatDayMonth, formatTime } from "../lib/dates";
import type { TimetableEventDto } from "../types";
import EventCard from "./EventCard";

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
    typeBadges: ev.typeBadges,
  }));
}

function eventLookupKey(
  source: "ics" | "activity",
  start: string,
  end: string,
  title: string,
  typeBadges: string[] | undefined
): string {
  return `${source}|${start}|${end}|${title.toLowerCase()}|${typeBadgeKey(typeBadges)}`;
}

function buildEventLookup(events: TimetableEventDto[]): Map<string, TimetableEventDto> {
  const map = new Map<string, TimetableEventDto>();
  for (const ev of events) {
    map.set(
      eventLookupKey(eventSource(ev), ev.start, ev.end, ev.title, ev.typeBadges),
      ev
    );
  }
  return map;
}

function lookupKeyForCard(card: RenderCard): string {
  return eventLookupKey(
    card.source,
    card.start.toISOString(),
    card.end.toISOString(),
    card.title,
    card.typeBadges
  );
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
  scrollable = false,
}: WeekTimelineGridProps) {
  const allEvents = useMemo(() => days.flatMap((d) => d.events), [days]);

  const layout = useMemo(
    () =>
      createTimelineLayout(
        toLayoutEvents(allEvents),
        timezone,
        TIMETABLE_WIDTH,
        GRID_INSET_X
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

  return (
    <div className={`weekTimelineGridWrap${scrollable ? " weekTimelineGridWrapScroll" : ""}`}>
      <div className="weekTimelineGrid">
        <div className="weekTimelineHeader">
          <div className="weekTimelineCorner" />
          <div className="weekTimelineHourHeader">
            {hours.map((hour) => (
              <div
                key={hour}
                className="timelineHourLabel"
                style={{ left: `${timeToPercent(hour, 0, layout)}%` }}
              >
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
                    style={{ left: `${timeToPercent(layout.hourStart + i, 0, layout)}%` }}
                  />
                ))}
              </div>
              {day.packedRows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className={`weekTimelineTrack${day.isEmpty ? " weekTimelineTrackEmpty" : ""}`}
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
                        typeBadges={card.typeBadges}
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
