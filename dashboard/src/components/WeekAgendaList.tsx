import { useMemo } from "react";
import { groupDayEvents, type LayoutEvent } from "@shared/timetable/layout";
import { formatAgendaDay, formatTime, toISODate } from "../lib/dates";
import type { TimetableEventDto } from "../types";
import type { WeekTimelineDay } from "./WeekTimelineGrid";
import AvatarStack from "./AvatarStack";

type WeekAgendaListProps = {
  days: WeekTimelineDay[];
  avatarByUser: Map<string, string | null>;
  onEventClick: (event: TimetableEventDto) => void;
};

type AgendaItem = {
  key: string;
  title: string;
  timeLabel: string;
  userIds: string[];
  event: TimetableEventDto;
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

function findEvent(events: TimetableEventDto[], title: string, startMs: number, endMs: number) {
  return events.find(
    (ev) =>
      !ev.allDay &&
      ev.title.toLowerCase() === title.toLowerCase() &&
      new Date(ev.start).getTime() === startMs &&
      new Date(ev.end).getTime() === endMs
  );
}

function groupAllDayEvents(events: TimetableEventDto[]): AgendaItem[] {
  const groups = new Map<string, AgendaItem>();
  for (const ev of events) {
    if (!ev.allDay) continue;
    const key = `${ev.start}|${ev.end}|${ev.title.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.userIds.includes(ev.userId)) existing.userIds.push(ev.userId);
      continue;
    }
    groups.set(key, {
      key,
      title: ev.title,
      timeLabel: "Hele dag",
      userIds: [ev.userId],
      event: ev,
    });
  }
  return [...groups.values()];
}

function timedAgendaItems(events: TimetableEventDto[]): AgendaItem[] {
  return groupDayEvents(toLayoutEvents(events)).flatMap((card) => {
    const ev = findEvent(events, card.title, card.startMs, card.endMs);
    if (!ev) return [];
    return [
      {
        key: `${card.startMs}-${card.title}`,
        title: card.title,
        timeLabel: `${formatTime(ev.start)}–${formatTime(ev.end)}`,
        userIds: card.userIds,
        event: ev,
      },
    ];
  });
}

export default function WeekAgendaList({
  days,
  avatarByUser,
  onEventClick,
}: WeekAgendaListProps) {
  const today = toISODate(new Date());

  const daySections = useMemo(
    () =>
      days.map((day) => ({
        ...day,
        items: [...groupAllDayEvents(day.events), ...timedAgendaItems(day.events)],
      })),
    [days]
  );

  return (
    <div className="weekAgenda">
      {daySections.map((day) => (
        <section
          key={day.dayKey}
          className={`weekAgendaDay${day.dayKey === today ? " weekAgendaDayToday" : ""}`}
        >
          <h2 className="weekAgendaDayHeader">{formatAgendaDay(day.dayKey)}</h2>
          {day.items.length === 0 ? (
            <p className="weekAgendaEmpty">Geen lessen</p>
          ) : (
            <div className="weekAgendaList">
              {day.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="agendaCard"
                  onClick={() => onEventClick(item.event)}
                >
                  <AvatarStack userIds={item.userIds} avatarByUser={avatarByUser} size="sm" />
                  <span className="agendaCardText">
                    <span className="agendaCardTitle">{item.title}</span>
                    <span className="agendaCardTime">{item.timeLabel}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
