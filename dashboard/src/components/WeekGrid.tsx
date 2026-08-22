import { zonedStartEndMinutes } from "@shared/timetable/dates";
import { descriptionPreview, shortLocation } from "@shared/timetable/eventMeta";
import {
  computeDisplayHourRange,
  packEventsIntoRows,
  type LayoutEvent,
  type RenderCard,
} from "@shared/timetable/layout";
import { useMemo, type CSSProperties } from "react";
import { courseColorMap, courseKeyFromTitle } from "../lib/courseColor";
import { DAY_LABELS, formatDayMonth, formatTime, eventDayKey } from "../lib/dates";
import type { TimetableEventDto } from "../types";

const BASE_ROW_HEIGHT_PX = 64;
const BASE_MIN_EVENT_HEIGHT_PX = 36;
const ACTIVITY_COLOR = "#f0b232";

/** Matches week-grid CSS (0.3rem pad, 0.2rem gap, title/time/meta line heights). */
const CONTENT_PAD_Y_PX = 0.3 * 16 * 2;
const CONTENT_GAP_PX = 0.2 * 16;
const TITLE_LINE_PX = 0.8125 * 16 * 1.3;
const TIME_LINE_PX = 0.7 * 16 * 1.2;
const META_LINE_PX = 0.7 * 16 * 1.25;

type WeekGridProps = {
  dayDates: string[];
  events: TimetableEventDto[];
  timezone: string;
  onEventClick: (event: TimetableEventDto) => void;
  scale?: number;
};

type EventContentVisibility = {
  titleTall: boolean;
  showTime: boolean;
  showLocation: boolean;
  showDescription: boolean;
};

function eventContentVisibility(height: number, scale: number): EventContentVisibility {
  const pad = CONTENT_PAD_Y_PX * scale;
  const gap = CONTENT_GAP_PX * scale;
  const title = TITLE_LINE_PX * scale;
  const time = TIME_LINE_PX * scale;
  const meta = META_LINE_PX * scale;
  const available = height - pad;

  const showTime = available >= title + gap + time;
  const afterTime = showTime ? title + gap + time : title;
  const showLocation = showTime && available >= afterTime + gap + meta;
  const afterLocation = showLocation ? afterTime + gap + meta : afterTime;
  const showDescription = showLocation && available >= afterLocation + gap + meta;
  const afterAll = showDescription ? afterLocation + gap + meta : afterLocation;
  const titleTall = available >= afterAll + title;

  return { titleTall, showTime, showLocation, showDescription };
}

function toLayoutEvents(events: TimetableEventDto[]): LayoutEvent[] {
  return events.map((ev) => ({
    start: new Date(ev.start),
    end: new Date(ev.end),
    title: ev.title,
    userId: ev.userId,
    allDay: ev.allDay,
    source: ev.source ?? "ics",
    typeBadges: ev.typeBadges,
    id: ev.id,
  }));
}

function toRenderCard(ev: TimetableEventDto): RenderCard {
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  return {
    start,
    end,
    title: ev.title,
    userIds: [ev.userId],
    startMs: start.getTime(),
    endMs: end.getTime(),
    source: ev.source ?? "ics",
    typeBadges: ev.typeBadges ?? [],
    id: ev.id,
  };
}

function eventIdentity(ev: TimetableEventDto): string {
  return `${ev.source ?? "ics"}-${ev.id ?? ev.start}-${ev.userId}-${ev.title}`;
}

export default function WeekGrid({
  dayDates,
  events,
  timezone,
  onEventClick,
  scale = 1,
}: WeekGridProps) {
  const { hourStart, hourEnd } = useMemo(
    () => computeDisplayHourRange(toLayoutEvents(events), timezone),
    [events, timezone]
  );

  const hourCount = Math.max(1, hourEnd - hourStart);
  const rowHeight = BASE_ROW_HEIGHT_PX * scale;
  const minEventHeight = BASE_MIN_EVENT_HEIGHT_PX * scale;
  const colorsByCourse = useMemo(
    () => courseColorMap(events.filter((ev) => ev.source !== "activity").map((ev) => ev.title)),
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
        {dayDates.map((day, i) => {
          const allDay = events.filter(
            (ev) => ev.allDay && eventDayKey(ev.start, timezone) === day
          );
          return (
            <div
              key={day}
              className="weekGridDayHeader"
              style={{ gridColumn: i + 2, gridRow: 1 }}
            >
              <span className="weekGridDayName">{DAY_LABELS[i]}</span>
              <span className="weekGridDayDate">{formatDayMonth(day)}</span>
              {allDay.length > 0 && (
                <div className="weekGridAllDay">
                  {allDay.map((ev) => (
                    <button
                      key={eventIdentity(ev)}
                      type="button"
                      className={`weekGridAllDayChip${ev.source === "activity" ? " weekGridAllDayChipActivity" : ""}`}
                      onClick={() => onEventClick(ev)}
                    >
                      {ev.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {Array.from({ length: hourCount }, (_, i) => (
          <div
            key={i}
            className="weekGridTimeLabel"
            style={{ gridColumn: 1, gridRow: i + 2 }}
          >
            {String(hourStart + i).padStart(2, "0")}:00
          </div>
        ))}
        {dayDates.map((day, dayIndex) => {
          const dayEventsRaw = events.filter(
            (ev) => !ev.allDay && eventDayKey(ev.start, timezone) === day
          );
          const seenActivityIds = new Set<string>();
          const dayEvents = dayEventsRaw.filter((ev) => {
            if (ev.source !== "activity" || !ev.id) return true;
            if (seenActivityIds.has(ev.id)) return false;
            seenActivityIds.add(ev.id);
            return true;
          });
          const packed = packEventsIntoRows(dayEvents.map(toRenderCard));
          const colCount = Math.max(packed.length, 1);
          const colByIdentity = new Map<string, number>();
          packed.forEach((column, col) => {
            for (const card of column) {
              const match = dayEvents.find(
                (ev) =>
                  (card.id && ev.id === card.id) ||
                  (ev.title === card.title &&
                    new Date(ev.start).getTime() === card.startMs &&
                    new Date(ev.end).getTime() === card.endMs)
              );
              if (match) colByIdentity.set(eventIdentity(match), col);
            }
          });

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
                const { startMinutes, endMinutes } = zonedStartEndMinutes(
                  new Date(ev.start),
                  new Date(ev.end),
                  timezone
                );
                const startMin = startMinutes - hourStart * 60;
                const endMin = endMinutes - hourStart * 60;
                const top = Math.max(0, (startMin / 60) * rowHeight);
                const height = Math.max(minEventHeight, ((endMin - startMin) / 60) * rowHeight);
                const { titleTall, showTime, showLocation, showDescription } =
                  eventContentVisibility(height, scale);
                const locationLine = ev.locationHidden
                  ? "Campus · lokaal"
                  : shortLocation(ev.location);
                const descriptionLine = ev.description
                  ? descriptionPreview(ev.description, 80)
                  : undefined;
                const isActivity = ev.source === "activity";
                const courseColor = isActivity
                  ? ACTIVITY_COLOR
                  : (colorsByCourse.get(courseKeyFromTitle(ev.title)) ?? "#5865f2");
                const col = colByIdentity.get(eventIdentity(ev)) ?? 0;
                return (
                  <button
                    key={eventIdentity(ev)}
                    type="button"
                    className={`eventCard weekGridEvent${isActivity ? " eventCardActivity" : ""}`}
                    style={
                      {
                        top: `${top}px`,
                        height: `${height}px`,
                        left: `calc(4px + ${col} * ((100% - 8px) / ${colCount}))`,
                        width: `calc((100% - 8px) / ${colCount} - 2px)`,
                        right: "auto",
                        "--course-color": courseColor,
                      } as CSSProperties
                    }
                    onClick={() => onEventClick(ev)}
                    title={`${ev.title} (${formatTime(ev.start, timezone)}–${formatTime(ev.end, timezone)})`}
                  >
                    <span className="weekGridEventBody">
                      <span
                        className={`eventCardTitle${titleTall ? " weekGridEventTitleTall" : ""}`}
                      >
                        {ev.title}
                      </span>
                      {showTime && (
                        <span className="weekGridEventTime">
                          {formatTime(ev.start, timezone)}–{formatTime(ev.end, timezone)}
                        </span>
                      )}
                      {showLocation && locationLine && (
                        <span
                          className={`weekGridEventMeta${ev.locationHidden ? " locationBlurred" : ""}`}
                        >
                          {locationLine}
                        </span>
                      )}
                      {showDescription && descriptionLine && (
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
