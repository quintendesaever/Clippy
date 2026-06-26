import { useEffect, useMemo, useState } from "react";
import { getTimetable } from "../api";
import { getWeekMonday, toISODate, weekDayDates } from "../lib/dates";
import type { TimetableEventDto } from "../types";

export function useWeekTimetable() {
  const [weekStart, setWeekStart] = useState(() => toISODate(getWeekMonday(new Date())));
  const [eventsByUser, setEventsByUser] = useState<Record<string, TimetableEventDto[]>>({});
  const [timezone, setTimezone] = useState("Europe/Brussels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekMonday = useMemo(() => {
    const [y, m, d] = weekStart.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [weekStart]);

  const dayDates = useMemo(() => weekDayDates(weekMonday), [weekMonday]);
  const from = weekStart;
  const to = dayDates[5];

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
    timezone,
    loading,
    error,
    shiftWeek,
    goToThisWeek,
  };
}
