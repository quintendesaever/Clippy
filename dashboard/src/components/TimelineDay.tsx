import { useMemo } from "react";
import {
  clipEventToGrid,
  createTimelineLayout,
  formatHourLabel,
  groupDayEvents,
  packEventsIntoRows,
  timeToPercent,
  type LayoutEvent,
} from "@shared/timetable/layout";
import { GRID_INSET_X, TIMETABLE_WIDTH } from "@shared/timetable/theme";
import type { TimetableEventDto } from "../types";
import { formatDayMonth } from "../lib/dates";
import EventCard from "./EventCard";

type TimelineDayProps = {
  dayKey: string;
  dayLabel: string;
  events: TimetableEventDto[];
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

export default function TimelineDay({
  dayKey,
  dayLabel,
  events,
  timezone,
  avatarByUser,
  onEventClick,
}: TimelineDayProps) {
  const layoutEvents = useMemo(() => toLayoutEvents(events), [events]);
  const layout = useMemo(
    () => createTimelineLayout(layoutEvents, timezone, TIMETABLE_WIDTH, GRID_INSET_X),
    [layoutEvents, timezone]
  );
  const packedRows = useMemo(() => {
    const grouped = groupDayEvents(layoutEvents);
    return packEventsIntoRows(grouped);
  }, [layoutEvents]);

  const rowCount = Math.max(packedRows.length, 1);
  const hours = Array.from({ length: layout.hourCount }, (_, i) => layout.hourStart + i);

  const eventLookup = useMemo(() => {
    const map = new Map<string, TimetableEventDto>();
    for (const ev of events) {
      const key = `${ev.start}|${ev.end}|${ev.title.toLowerCase()}`;
      map.set(key, ev);
    }
    return map;
  }, [events]);

  function handleCardClick(card: { start: Date; end: Date; title: string; userIds: string[] }) {
    const key = `${card.start.toISOString()}|${card.end.toISOString()}|${card.title.toLowerCase()}`;
    const ev = eventLookup.get(key);
    if (ev) onEventClick(ev);
  }

  if (events.length === 0) {
    return (
      <section className="timelineDay">
        <div className="timelineDayLabel">
          {dayLabel} {formatDayMonth(dayKey)}
        </div>
        <p className="timetableEmpty">Geen lessen.</p>
      </section>
    );
  }

  return (
    <section className="timelineDay">
      <div className="timelineDayLabel">
        {dayLabel} {formatDayMonth(dayKey)}
      </div>
      <div className="timelineDayScroll">
        <div className="timelineDayInner">
          <div
            className="timelineHourHeader"
            style={{
              gridTemplateColumns: `repeat(${layout.hourCount}, 1fr)`,
              paddingLeft: `${(GRID_INSET_X / TIMETABLE_WIDTH) * 100}%`,
              paddingRight: `${(GRID_INSET_X / TIMETABLE_WIDTH) * 100}%`,
            }}
          >
            {hours.map((hour) => (
              <div key={hour} className="timelineHourLabel">
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {Array.from({ length: rowCount }, (_, rowIndex) => (
            <div key={rowIndex} className="timelineRow">
              {Array.from({ length: layout.hourCount + 1 }, (_, i) => {
                const leftPct =
                  GRID_INSET_X / TIMETABLE_WIDTH * 100 +
                  (i / layout.hourCount) * (100 - (2 * GRID_INSET_X) / TIMETABLE_WIDTH * 100);
                return (
                  <div
                    key={i}
                    className="timelineGridLine"
                    style={{ left: `${leftPct}%` }}
                  />
                );
              })}
              {(packedRows[rowIndex] ?? []).map((card, cardIndex) => {
                const times = clipEventToGrid(card.start, card.end, timezone, layout);
                if (!times) return null;

                const left = timeToPercent(times.startHour, times.startMinute, layout);
                const right = timeToPercent(times.endHour, times.endMinute, layout);
                const insetPct = (GRID_INSET_X / TIMETABLE_WIDTH) * 100;
                const trackPct = 100 - 2 * insetPct;
                const leftPercent = insetPct + (left / 100) * trackPct;
                const widthPercent = ((right - left) / 100) * trackPct;

                return (
                  <EventCard
                    key={`${card.startMs}-${cardIndex}`}
                    title={card.title}
                    userIds={card.userIds}
                    avatarByUser={avatarByUser}
                    leftPercent={leftPercent}
                    widthPercent={widthPercent}
                    onClick={() => handleCardClick(card)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
