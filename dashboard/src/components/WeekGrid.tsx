import { descriptionPreview, shortLocation } from "@shared/timetable/eventMeta";
import { DAY_LABELS, formatDayMonth, formatTime, eventDayKey } from "../lib/dates";
import type { TimetableEventDto } from "../types";

const HOUR_START = 8;
const HOUR_END = 22;
const ROW_HEIGHT_PX = 64;

type WeekGridProps = {
  dayDates: string[];
  events: TimetableEventDto[];
  onEventClick: (event: TimetableEventDto) => void;
};

export default function WeekGrid({ dayDates, events, onEventClick }: WeekGridProps) {
  const hourCount = HOUR_END - HOUR_START;

  return (
    <div className="weekGridWrap">
      <div
        className="weekGrid"
        style={{
          gridTemplateColumns: `72px repeat(${dayDates.length}, minmax(100px, 1fr))`,
          gridTemplateRows: `auto repeat(${hourCount}, ${ROW_HEIGHT_PX}px)`,
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
                height: hourCount * ROW_HEIGHT_PX,
              }}
            >
              {dayEvents.map((ev) => {
                const start = new Date(ev.start);
                const end = new Date(ev.end);
                const startMin = start.getHours() * 60 + start.getMinutes() - HOUR_START * 60;
                const endMin = end.getHours() * 60 + end.getMinutes() - HOUR_START * 60;
                const top = Math.max(0, (startMin / 60) * ROW_HEIGHT_PX);
                const height = Math.max(36, ((endMin - startMin) / 60) * ROW_HEIGHT_PX);
                const locationLine = ev.locationHidden
                  ? "Campus · lokaal"
                  : shortLocation(ev.location);
                const descriptionLine = ev.description
                  ? descriptionPreview(ev.description)
                  : undefined;
                return (
                  <button
                    key={`${ev.start}-${ev.title}`}
                    type="button"
                    className="eventCard weekGridEvent"
                    style={{ top: `${top}px`, height: `${height}px` }}
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
