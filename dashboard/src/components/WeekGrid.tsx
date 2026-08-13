import { descriptionPreview, shortLocation } from "@shared/timetable/eventMeta";
import { useMemo, type CSSProperties } from "react";
import { courseColorMap, courseKeyFromTitle } from "../lib/courseColor";
import { DAY_LABELS, formatDayMonth, formatTime, eventDayKey } from "../lib/dates";
import type { TimetableEventDto } from "../types";

const HOUR_START = 8;
const HOUR_END = 22;
const BASE_ROW_HEIGHT_PX = 64;
const BASE_MIN_EVENT_HEIGHT_PX = 36;

type WeekGridProps = {
  dayDates: string[];
  events: TimetableEventDto[];
  onEventClick: (event: TimetableEventDto) => void;
  scale?: number;
};

export default function WeekGrid({ dayDates, events, onEventClick, scale = 1 }: WeekGridProps) {
  const hourCount = HOUR_END - HOUR_START;
  const rowHeight = BASE_ROW_HEIGHT_PX * scale;
  const minEventHeight = BASE_MIN_EVENT_HEIGHT_PX * scale;
  const colorsByCourse = useMemo(
    () => courseColorMap(events.map((ev) => ev.title)),
    [events]
  );

  return (
    <div className="weekGridWrap">
      <div
        className="weekGrid"
        style={{
          gridTemplateColumns: `72px repeat(${dayDates.length}, minmax(100px, 1fr))`,
          gridTemplateRows: `auto repeat(${hourCount}, ${rowHeight}px)`,
        }}
      >
        <div className="weekGridCorner" style={{ gridColumn: 1, gridRow: 1 }} />
        {dayDates.map((day, i) => (
          <div
            key={day}
            className="weekGridDayHeader"
            style={{ gridColumn: i + 2, gridRow: 1 }}
          >
            <span className="weekGridDayName">{DAY_LABELS[i]}</span>
            <span className="weekGridDayDate">{formatDayMonth(day)}</span>
          </div>
        ))}
        {Array.from({ length: hourCount }, (_, i) => (
          <div
            key={i}
            className="weekGridTimeLabel"
            style={{ gridColumn: 1, gridRow: i + 2 }}
          >
            {String(HOUR_START + i).padStart(2, "0")}:00
          </div>
        ))}
        {dayDates.map((day, dayIndex) => {
          const dayEvents = events.filter((ev) => eventDayKey(ev.start) === day);
          return (
            <div
              key={day}
              className="weekGridDayColumn"
              style={{
                gridColumn: dayIndex + 2,
                gridRow: `2 / ${hourCount + 2}`,
                height: hourCount * rowHeight,
              }}
            >
              {dayEvents.map((ev) => {
                const start = new Date(ev.start);
                const end = new Date(ev.end);
                const startMin = start.getHours() * 60 + start.getMinutes() - HOUR_START * 60;
                const endMin = end.getHours() * 60 + end.getMinutes() - HOUR_START * 60;
                const top = Math.max(0, (startMin / 60) * rowHeight);
                const height = Math.max(minEventHeight, ((endMin - startMin) / 60) * rowHeight);
                const locationLine = ev.locationHidden
                  ? "Campus · lokaal"
                  : shortLocation(ev.location);
                const descriptionLine = ev.description
                  ? descriptionPreview(ev.description, 80)
                  : undefined;
                const courseColor = colorsByCourse.get(courseKeyFromTitle(ev.title)) ?? "#5865f2";
                return (
                  <button
                    key={`${ev.start}-${ev.title}`}
                    type="button"
                    className="eventCard weekGridEvent"
                    style={
                      {
                        top: `${top}px`,
                        height: `${height}px`,
                        "--course-color": courseColor,
                      } as CSSProperties
                    }
                    onClick={() => onEventClick(ev)}
                  >
                    <span className="weekGridEventBody">
                      <span className="eventCardTitle">{ev.title}</span>
                      <span className="weekGridEventTime">
                        {formatTime(ev.start)}–{formatTime(ev.end)}
                      </span>
                      {locationLine && (
                        <span
                          className={`weekGridEventMeta${ev.locationHidden ? " locationBlurred" : ""}`}
                        >
                          {locationLine}
                        </span>
                      )}
                      {descriptionLine && (
                        <span className="weekGridEventMeta">{descriptionLine}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
