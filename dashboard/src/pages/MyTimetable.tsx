import { withoutEmptyWeekendDays } from "@shared/timetable/weekDays";
import { useEffect, useMemo, useState } from "react";
import ActivityForm, { type ActivityFormPrefill } from "../components/ActivityForm";
import AppShell from "../components/AppShell";
import EventPopup from "../components/EventPopup";
import PagePanel from "../components/PagePanel";
import TimetableAddActivityButton from "../components/TimetableAddActivityButton";
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

function isPersonalActivity(event: TimetableEventDto, userId: string): boolean {
  return event.createdBy === userId || (event.participantIds ?? []).includes(userId);
}

export default function MyTimetable({ user }: { user: DiscordUser }) {
  const {
    dayDates,
    eventsByUser,
    activities,
    members,
    timezone,
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

  const personalActivities = useMemo(
    () => activities.filter((activity) => isPersonalActivity(activity, user.id)),
    [activities, user.id]
  );

  const personalEvents = useMemo(() => {
    const mine = eventsByUser[user.id] ?? [];
    return [...mine, ...personalActivities].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
  }, [personalActivities, eventsByUser, user.id]);

  const visibleDayDates = useMemo(
    () =>
      withoutEmptyWeekendDays(dayDates, (day) =>
        personalEvents.some((ev) => eventDayKey(ev.start, timezone) === day)
      ),
    [dayDates, personalEvents, timezone]
  );

  const weekDays = useMemo(
    () =>
      visibleDayDates.map((day, i) => ({
        dayKey: day,
        dayLabel: DAY_LABELS[dayDates.indexOf(day)] ?? DAY_LABELS[i],
        events: personalEvents.filter((ev) => eventDayKey(ev.start, timezone) === day),
      })),
    [visibleDayDates, dayDates, personalEvents, timezone]
  );

  const avatarByUser = useMemo(() => {
    const map = new Map<string, string | null>([[user.id, user.avatar]]);
    for (const activity of activities) {
      if (!map.has(activity.userId)) {
        map.set(activity.userId, null);
      }
      for (const participantId of activity.participantIds ?? []) {
        if (!map.has(participantId)) {
          map.set(participantId, null);
        }
      }
    }
    return map;
  }, [activities, user.avatar, user.id]);

  useEffect(() => {
    if (!popupEvent?.id) return;
    const updated = activities.find((activity) => activity.id === popupEvent.id);
    if (updated) setPopupEvent(updated);
  }, [activities, popupEvent?.id]);

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

  const ownCalendarError = members.find((member) => member.userId === user.id && member.error);
  const hasWeekData = dayDates.length > 0;

  return (
    <AppShell user={user}>
      <div
        className="pageLayout timetablePage"
        style={{ "--tt-font-scale": scale } as React.CSSProperties}
      >
        <div className="pageLayoutContent">
          {error && <p className="errorMsg">{error}</p>}
          {loading && <p className="timetableLoading">Rooster laden…</p>}

          {hasWeekData && (
            <>
              <div className="timetableToolbar">
                <WeekNav
                  onPrev={() => shiftWeek(-1)}
                  onThisWeek={goToThisWeek}
                  onNext={() => shiftWeek(1)}
                  disabled={loading}
                />
                {showToggle && (
                  <TimetableLayoutToggle value={layout} onChange={setLayout} />
                )}
                <span className="timetableWeekLabel">
                  {formatWeekRange(dayDates[0], dayDates[dayDates.length - 1])}
                </span>
              </div>

              {ownCalendarError && (
                <p className="timetableEmpty">{ownCalendarError.error}</p>
              )}

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
                      timezone={timezone}
                      avatarByUser={avatarByUser}
                      onEventClick={setPopupEvent}
                    />
                  )
                ) : (
                  <WeekGrid
                    dayDates={visibleDayDates.length > 0 ? visibleDayDates : dayDates}
                    events={personalEvents}
                    timezone={timezone}
                    onEventClick={setPopupEvent}
                    scale={scale}
                  />
                )}
              </PagePanel>
            </>
          )}
        </div>
        <TimetableAddActivityButton onClick={() => openCreate()} />
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
          timezone={timezone}
          avatarByUser={avatarByUser}
          onClose={() => setPopupEvent(null)}
          onEdit={openEdit}
          onDeleted={() => {
            setPopupEvent(null);
            refetch();
          }}
          onChanged={refetch}
        />
      )}
      {formOpen && (
        <ActivityForm
          mode={formMode}
          timezone={timezone}
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
