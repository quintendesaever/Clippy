import { useCallback, useEffect, useMemo, useState } from "react";
import { getTimetable } from "../api";
import { getWeekMonday, toISODate, weekDayDates } from "../lib/dates";
import type { TimetableEventDto } from "../types";

export function useWeekTimetable() {
  const [weekStart, setWeekStart] = useState(() => toISODate(getWeekMonday(new Date())));
  const [eventsByUser, setEventsByUser] = useState<Record<string, TimetableEventDto[]>>({});
  const [activities, setActivities] = useState<TimetableEventDto[]>([]);
  const [timezone, setTimezone] = useState("Europe/Brussels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const weekMonday = useMemo(() => {
    const [y, m, d] = weekStart.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [weekStart]);

  const dayDates = useMemo(() => weekDayDates(weekMonday), [weekMonday]);
  const from = weekStart;
  const to = dayDates[5];

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getTimetable(from, to)
      .then((r) => {
        setEventsByUser(r.eventsByUser);
        setActivities(r.activities ?? []);
        setTimezone(r.timezone);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Laden mislukt"))
      .finally(() => setLoading(false));
  }, [from, to, reloadToken]);

  function shiftWeek(delta: number) {
    setWeekStart(toISODate(new Date(weekMonday.getTime() + delta * 7 * 86400000)));
  }

  function goToThisWeek() {
    setWeekStart(toISODate(getWeekMonday(new Date())));
  }

  return {
    weekStart,
    weekMonday,
    dayDates,
    eventsByUser,
    activities,
    timezone,
    loading,
    error,
    shiftWeek,
    goToThisWeek,
    refetch,
  };
}
