import { withoutEmptySaturday } from "@shared/timetable/weekDays";
import { useMemo, useState } from "react";
import ActivityForm, {
  prefillFromSlot,
  type ActivityFormPrefill,
} from "../components/ActivityForm";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
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
import { DAY_LABELS, eventDayKey, formatWeekRange } from "../lib/dates";
import type { DiscordUser, TimetableEventDto } from "../types";

export default function MyTimetable({ user }: { user: DiscordUser }) {
  const {
    dayDates,
    eventsByUser,
    activities,
    loading,
    error,
    shiftWeek,
    goToThisWeek,
    refetch,
  } = useWeekTimetable();
  const { layout, setLayout, showToggle, useAgenda } = useTimetableLayout();
  const { scale, decrease, increase, canDecrease, canIncrease } = useTimetableFontScale();

  const [popupEvent, setPopupEvent] = useState<TimetableEventDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editEvent, setEditEvent] = useState<TimetableEventDto | null>(null);
  const [formPrefill, setFormPrefill] = useState<ActivityFormPrefill | null>(null);

  const personalEvents = useMemo(() => {
    const mine = eventsByUser[user.id] ?? [];
    return [...mine, ...activities].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
  }, [activities, eventsByUser, user.id]);

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

  const avatarByUser = useMemo(() => {
    const map = new Map<string, string | null>([[user.id, user.avatar]]);
    for (const activity of activities) {
      if (!map.has(activity.userId)) {
        map.set(activity.userId, null);
      }
    }
    return map;
  }, [activities, user.avatar, user.id]);

  function openCreate(prefill?: ActivityFormPrefill | null) {
    setFormMode("create");
    setEditEvent(null);
    setFormPrefill(prefill ?? null);
    setFormOpen(true);
  }

  function openEdit(event: TimetableEventDto) {
    setFormMode("edit");
    setEditEvent(event);
    setFormPrefill(null);
    setFormOpen(true);
  }

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
                <span className="timetableWeekLabel">
                  {formatWeekRange(dayDates[0], dayDates[dayDates.length - 1])}
                </span>
                <Button size="small" onClick={() => openCreate()}>
                  Activiteit toevoegen
                </Button>
              </div>

              <PagePanel>
                {useAgenda ? (
                  personalEvents.length === 0 ? (
                    <p className="timetableEmpty">
                      Geen lessen of activiteiten deze week. Koppel een kalender of voeg een
                      activiteit toe.
                    </p>
                  ) : (
                    <WeekAgendaList
                      days={weekDays}
                      avatarByUser={avatarByUser}
                      onEventClick={setPopupEvent}
                    />
                  )
                ) : (
                  <WeekGrid
                    dayDates={visibleDayDates.length > 0 ? visibleDayDates : dayDates}
                    events={personalEvents}
                    onEventClick={setPopupEvent}
                    onEmptySlotClick={(dayKey, hour, minute) =>
                      openCreate(prefillFromSlot(dayKey, hour, minute))
                    }
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

      {popupEvent && (
        <EventPopup
          event={popupEvent}
          currentUserId={user.id}
          onClose={() => setPopupEvent(null)}
          onEdit={openEdit}
          onDeleted={refetch}
        />
      )}
      {formOpen && (
        <ActivityForm
          mode={formMode}
          initial={editEvent}
          prefill={formPrefill}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refetch();
          }}
        />
      )}
    </AppShell>
  );
}
