import { withoutEmptySaturday } from "@shared/timetable/weekDays";
import { useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import EventPopup from "../components/EventPopup";
import PagePanel from "../components/PagePanel";
import WeekGrid from "../components/WeekGrid";
import WeekNav from "../components/WeekNav";
import { useWeekTimetable } from "../hooks/useWeekTimetable";
import { eventDayKey } from "../lib/dates";
import type { DiscordUser, TimetableEventDto } from "../types";

export default function MyTimetable({ user }: { user: DiscordUser }) {
  const {
    dayDates,
    eventsByUser,
    loading,
    error,
    shiftWeek,
    goToThisWeek,
  } = useWeekTimetable();

  const [popupEvent, setPopupEvent] = useState<TimetableEventDto | null>(null);

  const personalEvents = useMemo(
    () => eventsByUser[user.id] ?? [],
    [eventsByUser, user.id]
  );

  const visibleDayDates = useMemo(
    () =>
      withoutEmptySaturday(dayDates, (day) =>
        personalEvents.some((ev) => eventDayKey(ev.start) === day)
      ),
    [dayDates, personalEvents]
  );

  return (
    <AppShell user={user}>
      <div className="pageLayout">
        <div className="pageLayoutContent">
          {error && <p className="errorMsg">{error}</p>}
          {loading && <p className="timetableLoading">Rooster laden…</p>}

          {!loading && (
            <>
              <div className="timetableToolbar">
                <WeekNav
                  onPrev={() => shiftWeek(-1)}
                  onThisWeek={goToThisWeek}
                  onNext={() => shiftWeek(1)}
                />
              </div>

              <PagePanel>
                {personalEvents.length === 0 ? (
                  <p className="timetableEmpty">
                    Geen lessen deze week, of geen kalender gekoppeld.
                  </p>
                ) : (
                  <WeekGrid
                    dayDates={visibleDayDates}
                    events={personalEvents}
                    userId={user.id}
                    userAvatar={user.avatar}
                    onEventClick={setPopupEvent}
                  />
                )}
              </PagePanel>
            </>
          )}
        </div>
      </div>

      {popupEvent && <EventPopup event={popupEvent} onClose={() => setPopupEvent(null)} />}
    </AppShell>
  );
}
