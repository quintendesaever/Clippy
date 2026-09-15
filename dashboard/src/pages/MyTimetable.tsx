import { withoutEmptyWeekendDays } from "@shared/timetable/weekDays";
import { useMemo } from "react";
import PagePanel from "../components/PagePanel";
import TimetablePageShell from "../components/TimetablePageShell";
import TimetableToolbar from "../components/TimetableToolbar";
import WeekAgendaList from "../components/WeekAgendaList";
import WeekGrid from "../components/WeekGrid";
import { useTimetableActivityUi } from "../hooks/useTimetableActivityUi";
import { useTimetableFontScale } from "../hooks/useTimetableFontScale";
import { useTimetableLayout } from "../hooks/useTimetableLayout";
import { useWeekTimetable } from "../hooks/useWeekTimetable";
import { DAY_LABELS, eventDayKey, getWeekMondayKey } from "../lib/dates";
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
  const activityUi = useTimetableActivityUi(activities);

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

  const ownCalendarError = members.find((member) => member.userId === user.id && member.error);
  const hasWeekData = dayDates.length > 0;
  const isCurrentWeek =
    hasWeekData && dayDates[0] === getWeekMondayKey(new Date(), timezone);

  return (
    <TimetablePageShell
      user={user}
      timezone={timezone}
      fontScale={scale}
      avatarByUser={avatarByUser}
      error={error}
      onAddActivity={() => activityUi.openCreate()}
      onDecreaseFont={decrease}
      onIncreaseFont={increase}
      canDecreaseFont={canDecrease}
      canIncreaseFont={canIncrease}
      popupEvent={activityUi.popupEvent}
      onClosePopup={activityUi.closePopup}
      onEditEvent={activityUi.openEdit}
      onPopupDeleted={() => {
        activityUi.closePopup();
        refetch();
      }}
      onPopupChanged={refetch}
      formOpen={activityUi.formOpen}
      formMode={activityUi.formMode}
      editEvent={activityUi.editEvent}
      formPrefill={activityUi.formPrefill}
      onCloseForm={activityUi.closeForm}
      onFormSaved={() => {
        activityUi.closeForm();
        refetch();
      }}
    >
      {hasWeekData && (
        <>
          <TimetableToolbar
            dayDates={dayDates}
            loading={loading}
            onPrev={() => shiftWeek(-1)}
            onThisWeek={goToThisWeek}
            onNext={() => shiftWeek(1)}
            showToggle={showToggle}
            layout={layout}
            onLayoutChange={setLayout}
            timelineLabel="Rooster"
            isCurrentWeek={isCurrentWeek}
          />

          {ownCalendarError && (
            <p className="timetableEmpty">{ownCalendarError.error}</p>
          )}

          <PagePanel className="timetablePanel">
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
                  onEventClick={activityUi.setPopupEvent}
                />
              )
            ) : (
              <WeekGrid
                dayDates={visibleDayDates.length > 0 ? visibleDayDates : dayDates}
                events={personalEvents}
                timezone={timezone}
                onEventClick={activityUi.setPopupEvent}
                scale={scale}
              />
            )}
          </PagePanel>
        </>
      )}
    </TimetablePageShell>
  );
}
