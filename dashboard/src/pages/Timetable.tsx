import { useEffect, useMemo, useState } from "react";
import { getCalendars, getTimetable } from "../api";
import AppShell from "../components/AppShell";
import EventPopup from "../components/EventPopup";
import MemberFilter from "../components/MemberFilter";
import PageLayout from "../components/PageLayout";
import PagePanel from "../components/PagePanel";
import WeekAvailabilityChart from "../components/WeekAvailabilityChart";
import WeekGrid from "../components/WeekGrid";
import WeekNav from "../components/WeekNav";
import WeekTimelineGrid from "../components/WeekTimelineGrid";
import {
  DAY_LABELS,
  formatDayMonth,
  getWeekMonday,
  toISODate,
  weekDayDates,
} from "../lib/dates";
import type { CalendarMember, DiscordUser, TimetableEventDto } from "../types";

type Tab = "shared" | "personal";

export default function Timetable({ user }: { user: DiscordUser }) {
  const [tab, setTab] = useState<Tab>("shared");
  const [calendars, setCalendars] = useState<CalendarMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [weekStart, setWeekStart] = useState(() => toISODate(getWeekMonday(new Date())));
  const [eventsByUser, setEventsByUser] = useState<Record<string, TimetableEventDto[]>>({});
  const [timezone, setTimezone] = useState("Europe/Brussels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popupEvent, setPopupEvent] = useState<TimetableEventDto | null>(null);

  const weekMonday = useMemo(() => {
    const [y, m, d] = weekStart.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [weekStart]);

  const dayDates = useMemo(() => weekDayDates(weekMonday), [weekMonday]);
  const from = weekStart;
  const to = dayDates[5];

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
      .catch((e) => setError(e instanceof Error ? e.message : "Laden mislukt"));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getTimetable(from, to)
      .then((r) => {
        setEventsByUser(r.eventsByUser);
        setTimezone(r.timezone);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Laden mislukt"))
      .finally(() => setLoading(false));
  }, [from, to]);

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

  const personalEvents = eventsByUser[user.id] ?? [];

  function toggleMember(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function shiftWeek(delta: number) {
    setWeekStart(toISODate(new Date(weekMonday.getTime() + delta * 7 * 86400000)));
  }

  const title = tab === "shared" ? "Gedeeld rooster" : "Mijn rooster";
  const subtitle = `Week van ${formatDayMonth(weekStart)} – ${formatDayMonth(dayDates[5])}`;

  return (
    <AppShell user={user}>
      <PageLayout
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <div className="topBarTabs">
              <button
                type="button"
                className={`topBarTab ${tab === "shared" ? "topBarTabActive" : ""}`}
                onClick={() => setTab("shared")}
              >
                Gedeeld
              </button>
              <button
                type="button"
                className={`topBarTab ${tab === "personal" ? "topBarTabActive" : ""}`}
                onClick={() => setTab("personal")}
              >
                Mijn rooster
              </button>
            </div>
            <WeekNav
              onPrev={() => shiftWeek(-1)}
              onThisWeek={() => setWeekStart(toISODate(getWeekMonday(new Date())))}
              onNext={() => shiftWeek(1)}
            />
          </>
        }
      >
        {error && <p className="errorMsg">{error}</p>}
        {loading && <p className="timetableLoading">Rooster laden…</p>}

        {!loading && tab === "shared" && (
          <PagePanel>
            <MemberFilter calendars={calendars} selected={selected} onToggle={toggleMember} />

            {calendars.length === 0 && (
              <p className="timetableEmpty">Nog geen kalenders gekoppeld.</p>
            )}
            {calendars.length > 0 && selectedCalendars.length === 0 && (
              <p className="timetableEmpty">Selecteer minstens één lid.</p>
            )}

            {selectedCalendars.length > 0 && (
              <>
                <WeekAvailabilityChart days={weekDays} />
                <WeekTimelineGrid
                  days={weekDays}
                  timezone={timezone}
                  avatarByUser={avatarByUser}
                  onEventClick={setPopupEvent}
                />
              </>
            )}

            <div className="timetableLegend">
              <span>
                <strong>H</strong> = Hoorcollege · <strong>P</strong> = Practicum · <strong>W</strong> =
                Werkcollege
              </span>
              <span>Tijden in {timezone}</span>
            </div>
          </PagePanel>
        )}

        {!loading && tab === "personal" && (
          <PagePanel>
            {personalEvents.length === 0 ? (
              <p className="timetableEmpty">
                Geen lessen deze week, of geen kalender gekoppeld.
              </p>
            ) : (
              <WeekGrid
                dayDates={dayDates}
                events={personalEvents}
                userId={user.id}
                userAvatar={user.avatar}
                onEventClick={setPopupEvent}
              />
            )}
          </PagePanel>
        )}
      </PageLayout>

      {popupEvent && <EventPopup event={popupEvent} onClose={() => setPopupEvent(null)} />}
    </AppShell>
  );
}
