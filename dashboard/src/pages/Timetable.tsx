import { withoutEmptySaturday } from "@shared/timetable/weekDays";
import { useEffect, useMemo, useState } from "react";
import { getCalendars } from "../api";
import AppShell from "../components/AppShell";
import EventPopup from "../components/EventPopup";
import MemberFilter from "../components/MemberFilter";
import PagePanel from "../components/PagePanel";
import TimetableLayoutToggle from "../components/TimetableLayoutToggle";
import WeekAgendaList from "../components/WeekAgendaList";
import WeekAvailabilityChart from "../components/WeekAvailabilityChart";
import WeekNav from "../components/WeekNav";
import WeekTimelineGrid from "../components/WeekTimelineGrid";
import { useTimetableLayout } from "../hooks/useTimetableLayout";
import { useWeekTimetable } from "../hooks/useWeekTimetable";
import { DAY_LABELS, formatWeekRange } from "../lib/dates";
import type { CalendarMember, DiscordUser, TimetableEventDto } from "../types";

export default function Timetable({ user }: { user: DiscordUser }) {
  const {
    dayDates,
    eventsByUser,
    timezone,
    loading,
    error,
    shiftWeek,
    goToThisWeek,
  } = useWeekTimetable();
  const { isMobile, layout, setLayout, showToggle, useAgenda } = useTimetableLayout();

  const [calendars, setCalendars] = useState<CalendarMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [popupEvent, setPopupEvent] = useState<TimetableEventDto | null>(null);

  const avatarByUser = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of calendars) {
      map.set(c.user_id, c.avatar_hash);
    }
    return map;
  }, [calendars]);

  useEffect(() => {
    getCalendars()
      .then((r) => {
        setCalendars(r.calendars);
        setSelected((prev) =>
          prev.size === 0 ? new Set(r.calendars.map((c) => c.user_id)) : prev
        );
      })
      .catch((e) =>
        setCalendarError(e instanceof Error ? e.message : "Kalenders laden mislukt")
      );
  }, []);

  const selectedCalendars = calendars.filter((c) => selected.has(c.user_id));

  const sharedEventsByDay = useMemo(() => {
    const byDay = new Map<string, TimetableEventDto[]>();
    for (const day of dayDates) {
      byDay.set(day, []);
    }
    for (const member of selectedCalendars) {
      for (const ev of eventsByUser[member.user_id] ?? []) {
        const day = ev.start.slice(0, 10);
        if (byDay.has(day)) {
          byDay.get(day)!.push(ev);
        }
      }
    }
    return byDay;
  }, [dayDates, eventsByUser, selectedCalendars]);

  const weekDays = useMemo(
    () =>
      dayDates.map((day, i) => ({
        dayKey: day,
        dayLabel: DAY_LABELS[i],
        events: sharedEventsByDay.get(day) ?? [],
      })),
    [dayDates, sharedEventsByDay]
  );

  const visibleWeekDays = useMemo(
    () => withoutEmptySaturday(weekDays, (d) => d.events.length > 0),
    [weekDays]
  );

  const weekLabel = formatWeekRange(
    dayDates[0],
    visibleWeekDays[visibleWeekDays.length - 1]?.dayKey ?? dayDates[4]
  );

  function toggleMember(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const displayError = error ?? calendarError;

  return (
    <AppShell user={user}>
      <div className="pageLayout timetablePage">
        <div className="pageLayoutContent">
          {displayError && <p className="errorMsg">{displayError}</p>}
          {loading && <p className="timetableLoading">Rooster laden…</p>}

          {!loading && (
            <>
              <div className="timetableToolbar">
                <WeekNav
                  weekLabel={weekLabel}
                  onPrev={() => shiftWeek(-1)}
                  onThisWeek={goToThisWeek}
                  onNext={() => shiftWeek(1)}
                />
                {showToggle && (
                  <TimetableLayoutToggle value={layout} onChange={setLayout} />
                )}
                <MemberFilter calendars={calendars} selected={selected} onToggle={toggleMember} />
              </div>

              {calendars.length === 0 && (
                <p className="timetableEmpty">Nog geen kalenders gekoppeld.</p>
              )}
              {calendars.length > 0 && selectedCalendars.length === 0 && (
                <p className="timetableEmpty">Selecteer minstens één lid.</p>
              )}

              {false && selectedCalendars.length > 0 && (
                <PagePanel>
                  <WeekAvailabilityChart days={visibleWeekDays} />
                </PagePanel>
              )}

              {selectedCalendars.length > 0 && (
                <PagePanel>
                  {useAgenda ? (
                    <WeekAgendaList
                      days={visibleWeekDays}
                      avatarByUser={avatarByUser}
                      onEventClick={setPopupEvent}
                    />
                  ) : (
                    <WeekTimelineGrid
                      days={visibleWeekDays}
                      timezone={timezone}
                      avatarByUser={avatarByUser}
                      onEventClick={setPopupEvent}
                      scrollable={isMobile}
                    />
                  )}
                </PagePanel>
              )}
            </>
          )}
        </div>
      </div>

      {popupEvent && <EventPopup event={popupEvent} onClose={() => setPopupEvent(null)} />}
    </AppShell>
  );
}
