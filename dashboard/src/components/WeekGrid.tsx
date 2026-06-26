import { DAY_LABELS, formatDayMonth, formatTime, eventDayKey } from "../lib/dates";
import type { TimetableEventDto } from "../types";
import { UserAvatar } from "./Avatar";

const HOUR_START = 8;
const HOUR_END = 22;
const ROW_HEIGHT_PX = 44;

type WeekGridProps = {
  dayDates: string[];
  events: TimetableEventDto[];
  userId: string;
  userAvatar: string | null;
  onEventClick: (event: TimetableEventDto) => void;
};

export default function WeekGrid({
  dayDates,
  events,
  userId,
  userAvatar,
  onEventClick,
}: WeekGridProps) {
  const hourCount = HOUR_END - HOUR_START;

  return (
    <div className="weekGridWrap">
      <div
        className="weekGrid"
        style={{
          gridTemplateColumns: `56px repeat(6, minmax(100px, 1fr))`,
          gridTemplateRows: `32px repeat(${hourCount}, ${ROW_HEIGHT_PX}px)`,
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
                const height = Math.max(28, ((endMin - startMin) / 60) * ROW_HEIGHT_PX);
                return (
                  <button
                    key={`${ev.start}-${ev.title}`}
                    type="button"
                    className="weekGridEvent"
                    style={{ top: `${top}px`, height: `${height}px` }}
                    onClick={() => onEventClick(ev)}
                  >
                    <UserAvatar userId={userId} avatar={userAvatar} size="sm" />
                    <span className="weekGridEventBody">
                      <span className="weekGridEventTitle">{ev.title}</span>
                      <span className="weekGridEventTime">
                        {formatTime(ev.start)}–{formatTime(ev.end)}
                      </span>
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
