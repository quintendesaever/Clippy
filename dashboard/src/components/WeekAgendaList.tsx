import { useMemo } from "react";
import { groupDayEvents, typeBadgeKey, type LayoutEvent } from "@shared/timetable/layout";
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

function findEvent(
  events: TimetableEventDto[],
  title: string,
  startMs: number,
  endMs: number,
  source: "ics" | "activity",
  typeBadges: string[]
) {
  const badges = typeBadgeKey(typeBadges);
  return events.find(
    (ev) =>
      !ev.allDay &&
      eventSource(ev) === source &&
      ev.title.toLowerCase() === title.toLowerCase() &&
      typeBadgeKey(ev.typeBadges) === badges &&
      new Date(ev.start).getTime() === startMs &&
      new Date(ev.end).getTime() === endMs
  );
}

function groupAllDayEvents(events: TimetableEventDto[]): AgendaItem[] {
  const groups = new Map<string, AgendaItem>();
  for (const ev of events) {
    if (!ev.allDay) continue;
    const key = `${eventSource(ev)}|${ev.start}|${ev.end}|${ev.title.toLowerCase()}|${typeBadgeKey(ev.typeBadges)}`;
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
    const ev = findEvent(events, card.title, card.startMs, card.endMs, card.source, card.typeBadges);
    if (!ev) return [];
    return [
      {
        key: `${card.source}-${card.startMs}-${card.title}-${typeBadgeKey(card.typeBadges)}`,
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
            <p className="weekAgendaEmpty">Geen lessen of activiteiten</p>
          ) : (
            <div className="weekAgendaList">
              {day.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`agendaCard${item.event.source === "activity" ? " agendaCardActivity" : ""}`}
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
