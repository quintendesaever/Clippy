import { dayKeyInTimezone } from "@shared/timetable/dates";
import { useMemo } from "react";
import {
  eventMergeKey,
  groupAllDayEvents,
  groupDayEvents,
  type LayoutEvent,
} from "@shared/timetable/layout";
import { formatAgendaDay, formatTime } from "../lib/dates";
import type { TimetableEventDto } from "../types";
import type { WeekTimelineDay } from "./WeekTimelineGrid";
import AvatarStack from "./AvatarStack";

type WeekAgendaListProps = {
  days: WeekTimelineDay[];
  timezone: string;
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
    id: ev.id,
  }));
}

function lookupKeyForDto(ev: TimetableEventDto): string {
  return eventMergeKey({
    source: eventSource(ev),
    id: ev.id,
    start: new Date(ev.start),
    end: new Date(ev.end),
    title: ev.title,
    typeBadges: ev.typeBadges,
  });
}

export default function WeekAgendaList({
  days,
  timezone,
  avatarByUser,
  onEventClick,
}: WeekAgendaListProps) {
  const today = dayKeyInTimezone(new Date(), timezone);

  const daySections = useMemo(
    () =>
      days.map((day) => {
        const layoutEvents = toLayoutEvents(day.events);
        const lookup = new Map(day.events.map((ev) => [lookupKeyForDto(ev), ev]));
        const allDayItems: AgendaItem[] = groupAllDayEvents(layoutEvents).flatMap((card) => {
          const ev = lookup.get(eventMergeKey(card));
          if (!ev) return [];
          return [
            {
              key: eventMergeKey(card),
              title: card.title,
              timeLabel: "Hele dag",
              userIds: card.userIds,
              event: ev,
            },
          ];
        });
        const timedItems: AgendaItem[] = groupDayEvents(layoutEvents).flatMap((card) => {
          const ev = lookup.get(eventMergeKey(card));
          if (!ev) return [];
          return [
            {
              key: eventMergeKey(card),
              title: card.title,
              timeLabel: `${formatTime(ev.start, timezone)}–${formatTime(ev.end, timezone)}`,
              userIds: card.userIds,
              event: ev,
            },
          ];
        });
        return { ...day, items: [...allDayItems, ...timedItems] };
      }),
    [days, timezone]
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
