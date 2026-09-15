import { useCallback, useEffect, useMemo, useState } from "react";
import { getTimetable } from "../api";
import { addCalendarDays, getWeekMondayKey, weekDayDates } from "../lib/dates";
import type { TimetableEventDto, TimetableMemberDto } from "../types";

const DEFAULT_TIMEZONE = "Europe/Brussels";

export function useWeekTimetable(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [weekStart, setWeekStart] = useState(() => getWeekMondayKey(new Date(), DEFAULT_TIMEZONE));
  const [eventsByUser, setEventsByUser] = useState<Record<string, TimetableEventDto[]>>({});
  const [activities, setActivities] = useState<TimetableEventDto[]>([]);
  const [members, setMembers] = useState<TimetableMemberDto[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const dayDates = useMemo(() => (enabled ? weekDayDates(weekStart) : []), [enabled, weekStart]);
  const from = weekStart;
  const to = dayDates[6];

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      setEventsByUser({});
      setActivities([]);
      setMembers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTimetable(from, to)
      .then((r) => {
        if (cancelled) return;
        setEventsByUser(r.eventsByUser);
        setActivities(r.activities ?? []);
        setMembers(r.members ?? []);
        setTimezone(r.timezone);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Laden mislukt");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, from, to, reloadToken]);

  function shiftWeek(delta: number) {
    setWeekStart(addCalendarDays(weekStart, delta * 7));
  }

  function goToThisWeek() {
    setWeekStart(getWeekMondayKey(new Date(), timezone));
  }

  return {
    weekStart,
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
  };
}
