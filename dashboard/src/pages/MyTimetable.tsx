import { withoutEmptySaturday } from "@shared/timetable/weekDays";
import { useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import EventPopup from "../components/EventPopup";
import PagePanel from "../components/PagePanel";
import TimetableFontSizeControls from "../components/TimetableFontSizeControls";
import TimetableLayoutToggle from "../components/TimetableLayoutToggle";
import WeekAgendaList from "../components/WeekAgendaList";
import WeekGrid from "../components/WeekGrid";
import WeekNav from "../components/WeekNav";
import { useTimetableFontScale } from "../hooks/useTimetableFontScale";
import { useTimetableLayout } from "../hooks/useTimetableLayout";
import { useWeekTimetable } from "../hooks/useWeekTimetable";
import { DAY_LABELS, eventDayKey } from "../lib/dates";
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
  const { layout, setLayout, showToggle, useAgenda } = useTimetableLayout();
  const { scale, decrease, increase, canDecrease, canIncrease } = useTimetableFontScale();

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

  const weekDays = useMemo(
    () =>
      visibleDayDates.map((day, i) => ({
        dayKey: day,
        dayLabel: DAY_LABELS[dayDates.indexOf(day)] ?? DAY_LABELS[i],
        events: personalEvents.filter((ev) => eventDayKey(ev.start) === day),
      })),
    [visibleDayDates, dayDates, personalEvents]
  );

  const avatarByUser = useMemo(
    () => new Map<string, string | null>([[user.id, user.avatar]]),
    [user.avatar, user.id]
  );

  return (
    <AppShell user={user}>
      <div
        className="pageLayout timetablePage"
        style={{ "--tt-font-scale": scale } as React.CSSProperties}
      >
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
                {showToggle && (
                  <TimetableLayoutToggle value={layout} onChange={setLayout} />
                )}
              </div>

              <PagePanel>
                {useAgenda ? (
                  personalEvents.length === 0 ? (
                    <p className="timetableEmpty">
                      Geen lessen deze week, of geen kalender gekoppeld.
                    </p>
                  ) : (
                    <WeekAgendaList
                      days={weekDays}
                      avatarByUser={avatarByUser}
                      onEventClick={setPopupEvent}
                    />
                  )
                ) : personalEvents.length === 0 ? (
                  <p className="timetableEmpty">
                    Geen lessen deze week, of geen kalender gekoppeld.
                  </p>
                ) : (
                  <WeekGrid
                    dayDates={visibleDayDates}
                    events={personalEvents}
                    onEventClick={setPopupEvent}
                    scale={scale}
                  />
                )}
              </PagePanel>
            </>
          )}
        </div>
        <TimetableFontSizeControls
          onDecrease={decrease}
          onIncrease={increase}
          canDecrease={canDecrease}
          canIncrease={canIncrease}
        />
      </div>

      {popupEvent && <EventPopup event={popupEvent} onClose={() => setPopupEvent(null)} />}
    </AppShell>
  );
}
