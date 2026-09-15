import { withoutEmptyWeekendDays } from "@shared/timetable/weekDays";
import { useEffect, useMemo, useState } from "react";
import { getCalendar, getCalendars } from "../api";
import MemberFilter from "../components/MemberFilter";
import PagePanel from "../components/PagePanel";
import SharedTimetableGate from "../components/SharedTimetableGate";
import TimetablePageShell from "../components/TimetablePageShell";
import TimetableToolbar from "../components/TimetableToolbar";
import WeekAgendaList from "../components/WeekAgendaList";
import WeekTimelineGrid from "../components/WeekTimelineGrid";
import { useTimetableActivityUi } from "../hooks/useTimetableActivityUi";
import { useTimetableFontScale } from "../hooks/useTimetableFontScale";
import { useTimetableLayout } from "../hooks/useTimetableLayout";
import { useWeekTimetable } from "../hooks/useWeekTimetable";
import { DAY_LABELS, eventDayKey, getWeekMondayKey } from "../lib/dates";
import type { CalendarMember, DiscordUser } from "../types";

type AccessState = "loading" | "allowed" | "blocked" | "error";

export default function Timetable({ user }: { user: DiscordUser }) {
  const [access, setAccess] = useState<AccessState>("loading");
  const [accessError, setAccessError] = useState<string | null>(null);
  const allowed = access === "allowed";

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
  } = useWeekTimetable({ enabled: allowed, scope: "shared" });
  const { isMobile, layout, setLayout, showToggle, useAgenda } = useTimetableLayout();
  const { scale, decrease, increase, canDecrease, canIncrease } = useTimetableFontScale();
  const activityUi = useTimetableActivityUi(activities);

  const [calendars, setCalendars] = useState<CalendarMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const avatarByUser = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of calendars) {
      map.set(c.user_id, c.avatar_hash);
    }
    map.set(user.id, user.avatar);
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
  }, [activities, calendars, user.avatar, user.id]);

  useEffect(() => {
    let cancelled = false;
    setAccess("loading");
    setAccessError(null);
    getCalendar()
      .then((r) => {
        if (cancelled) return;
        setAccess(r.calendar?.ics_url?.trim() ? "allowed" : "blocked");
      })
      .catch((err) => {
        if (cancelled) return;
        setAccess("error");
        setAccessError(err instanceof Error ? err.message : "Kalenderstatus laden mislukt");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;
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
  }, [allowed]);

  const selectedCalendars = calendars.filter((c) => selected.has(c.user_id));

  const sharedEventsByDay = useMemo(() => {
    const byDay = new Map<string, typeof activities>();
    for (const day of dayDates) {
      byDay.set(day, []);
    }
    for (const member of selectedCalendars) {
      for (const ev of eventsByUser[member.user_id] ?? []) {
        const day = eventDayKey(ev.start, timezone);
        if (byDay.has(day)) {
          byDay.get(day)!.push(ev);
        }
      }
    }
    for (const activity of activities) {
      const day = eventDayKey(activity.start, timezone);
      if (byDay.has(day)) {
        byDay.get(day)!.push(activity);
      }
    }
    return byDay;
  }, [activities, dayDates, eventsByUser, selectedCalendars, timezone]);

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
    () => withoutEmptyWeekendDays(weekDays, (d) => d.events.length > 0),
    [weekDays]
  );

  const showSchedule =
    selectedCalendars.length > 0 || activities.length > 0 || calendars.length === 0;
  const hasWeekData = dayDates.length > 0;
  const memberErrors = members.filter((member) => member.error);
  const isCurrentWeek =
    hasWeekData && dayDates[0] === getWeekMondayKey(new Date(), timezone);

  function toggleMember(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  if (access === "loading") {
    return (
      <TimetablePageShell
        user={user}
        timezone={timezone}
        fontScale={scale}
        avatarByUser={avatarByUser}
        onAddActivity={() => {}}
        onDecreaseFont={decrease}
        onIncreaseFont={increase}
        canDecreaseFont={canDecrease}
        canIncreaseFont={canIncrease}
        popupEvent={null}
        onClosePopup={() => {}}
        onEditEvent={() => {}}
        onPopupDeleted={() => {}}
        onPopupChanged={() => {}}
        formOpen={false}
        formMode="create"
        editEvent={null}
        formPrefill={null}
        onCloseForm={() => {}}
        onFormSaved={() => {}}
        hideChrome
      >
        <p className="timetableLoading">Rooster laden…</p>
      </TimetablePageShell>
    );
  }

  if (access === "error") {
    return (
      <TimetablePageShell
        user={user}
        timezone={timezone}
        fontScale={scale}
        avatarByUser={avatarByUser}
        error={accessError}
        onAddActivity={() => {}}
        onDecreaseFont={decrease}
        onIncreaseFont={increase}
        canDecreaseFont={canDecrease}
        canIncreaseFont={canIncrease}
        popupEvent={null}
        onClosePopup={() => {}}
        onEditEvent={() => {}}
        onPopupDeleted={() => {}}
        onPopupChanged={() => {}}
        formOpen={false}
        formMode="create"
        editEvent={null}
        formPrefill={null}
        onCloseForm={() => {}}
        onFormSaved={() => {}}
        hideChrome
      >
        <p className="timetableEmpty">Kon niet controleren of je kalender gekoppeld is. Probeer opnieuw.</p>
      </TimetablePageShell>
    );
  }

  if (access === "blocked") {
    return (
      <TimetablePageShell
        user={user}
        timezone={timezone}
        fontScale={scale}
        avatarByUser={avatarByUser}
        onAddActivity={() => {}}
        onDecreaseFont={decrease}
        onIncreaseFont={increase}
        canDecreaseFont={canDecrease}
        canIncreaseFont={canIncrease}
        popupEvent={null}
        onClosePopup={() => {}}
        onEditEvent={() => {}}
        onPopupDeleted={() => {}}
        onPopupChanged={() => {}}
        formOpen={false}
        formMode="create"
        editEvent={null}
        formPrefill={null}
        onCloseForm={() => {}}
        onFormSaved={() => {}}
        hideChrome
      >
        <SharedTimetableGate />
      </TimetablePageShell>
    );
  }

  return (
    <TimetablePageShell
      user={user}
      timezone={timezone}
      fontScale={scale}
      avatarByUser={avatarByUser}
      error={error ?? calendarError}
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
            timelineLabel="Tijdlijn"
            isCurrentWeek={isCurrentWeek}
            filter={
              <MemberFilter
                members={calendars.map((c) => ({
                  userId: c.user_id,
                  label: c.initials,
                  avatarHash: c.avatar_hash,
                }))}
                selected={selected}
                onToggle={toggleMember}
              />
            }
          />

          {calendars.length === 0 && activities.length === 0 && (
            <p className="timetableEmpty">
              Nog geen kalenders gekoppeld. Je kan al wel een gedeelde activiteit toevoegen.
            </p>
          )}
          {calendars.length > 0 && selectedCalendars.length === 0 && activities.length === 0 && (
            <p className="timetableEmpty">Selecteer minstens één lid.</p>
          )}
          {memberErrors.map((member) => (
            <p key={member.userId} className="timetableEmpty">
              {member.error}
            </p>
          ))}

          {showSchedule && (
            <PagePanel className="timetablePanel">
              {useAgenda ? (
                <WeekAgendaList
                  days={visibleWeekDays}
                  timezone={timezone}
                  avatarByUser={avatarByUser}
                  onEventClick={activityUi.setPopupEvent}
                />
              ) : (
                <WeekTimelineGrid
                  days={visibleWeekDays}
                  timezone={timezone}
                  avatarByUser={avatarByUser}
                  onEventClick={activityUi.setPopupEvent}
                  scrollable={isMobile}
                />
              )}
            </PagePanel>
          )}
        </>
      )}
    </TimetablePageShell>
  );
}
