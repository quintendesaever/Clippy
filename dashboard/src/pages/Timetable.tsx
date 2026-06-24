import { useEffect, useMemo, useState } from "react";
import { getCalendars, getTimetable } from "../api";
import AppLayout from "../components/AppLayout";
import type { CalendarMember, DiscordUser, TimetableEventDto } from "../types";

const HOUR_START = 8;
const HOUR_END = 20;
const PERSONAL_HOUR_END = 22;
const ROW_HEIGHT_PX = 44;
const SWIMLANE_ROW_HEIGHT = 56;
const DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za"];
const MEMBER_COLORS = [
  "#a855f7", "#eab308", "#22c55e", "#0ea5e9", "#ef4444", "#ec4899",
  "#06b6d4", "#3b82f6", "#f97316", "#14b8a6", "#8b5cf6",
];

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayMonth(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function eventDayKey(iso: string): string {
  return iso.slice(0, 10);
}

type Tab = "shared" | "personal";

export default function Timetable({ user }: { user: DiscordUser }) {
  const [tab, setTab] = useState<Tab>("shared");
  const [calendars, setCalendars] = useState<CalendarMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [weekStart, setWeekStart] = useState(() => toISODate(getWeekMonday(new Date())));
  const [selectedDay, setSelectedDay] = useState(() => toISODate(new Date()));
  const [eventsByUser, setEventsByUser] = useState<Record<string, TimetableEventDto[]>>({});
  const [timezone, setTimezone] = useState("Europe/Brussels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popupEvent, setPopupEvent] = useState<TimetableEventDto | null>(null);

  const weekMonday = useMemo(() => {
    const [y, m, d] = weekStart.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [weekStart]);

  const dayDates = useMemo(
    () =>
      DAY_LABELS.map((_, i) =>
        toISODate(new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate() + i))
      ),
    [weekMonday]
  );

  const from = weekStart;
  const to = dayDates[5];

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

  useEffect(() => {
    if (dayDates.includes(toISODate(new Date()))) {
      setSelectedDay(toISODate(new Date()));
    } else {
      setSelectedDay(dayDates[0]);
    }
  }, [weekStart, dayDates]);

  const selectedCalendars = calendars.filter((c) => selected.has(c.user_id));
  const colorByUser = new Map(selectedCalendars.map((c) => [c.user_id, c.color]));

  const toggleMember = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const sharedDayEvents = useMemo(() => {
    const byMember = new Map<string, TimetableEventDto[]>();
    for (const member of selectedCalendars) {
      const list = (eventsByUser[member.user_id] ?? []).filter(
        (ev) => eventDayKey(ev.start) === selectedDay
      );
      if (list.length > 0) byMember.set(member.user_id, list);
    }
    return byMember;
  }, [eventsByUser, selectedCalendars, selectedDay]);

  const personalEvents = eventsByUser[user.id] ?? [];

  return (
    <AppLayout user={user} wide>
      <div className="pageTabs">
        <button
          type="button"
          className={`tab ${tab === "shared" ? "tabActive" : ""}`}
          onClick={() => setTab("shared")}
        >
          Gedeeld rooster
        </button>
        <button
          type="button"
          className={`tab ${tab === "personal" ? "tabActive" : ""}`}
          onClick={() => setTab("personal")}
        >
          Mijn rooster
        </button>
      </div>

      {error && <p className="errorMsg">{error}</p>}

      {tab === "shared" && (
        <section className="timetableSection">
          {calendars.length > 0 && (
            <div className="timetableUsersRow">
              <span className="timetableLegendTitle">Leden:</span>
              {calendars.map((c) => (
                <button
                  key={c.user_id}
                  type="button"
                  className={`timetableUserChip ${selected.has(c.user_id) ? "timetableUserChipSelected" : ""}`}
                  onClick={() => toggleMember(c.user_id)}
                >
                  <span className="timetableUserChipColor" style={{ background: c.color }} />
                  {c.initials}
                </button>
              ))}
            </div>
          )}

          <header className="timetableHeader">
            <h2 className="timetableTitle">
              Gedeeld rooster — week van {formatDayMonth(weekStart)}
            </h2>
            <div className="timetableWeekNav">
              <button
                type="button"
                className="btn btnSecondary timetableNavBtn"
                onClick={() =>
                  setWeekStart(toISODate(new Date(weekMonday.getTime() - 7 * 86400000)))
                }
              >
                ← Vorige week
              </button>
              <button
                type="button"
                className="btn btnSecondary timetableNavBtn"
                onClick={() => setWeekStart(toISODate(getWeekMonday(new Date())))}
              >
                Deze week
              </button>
              <button
                type="button"
                className="btn btnSecondary timetableNavBtn"
                onClick={() =>
                  setWeekStart(toISODate(new Date(weekMonday.getTime() + 7 * 86400000)))
                }
              >
                Volgende week →
              </button>
            </div>
          </header>

          <div className="dayTabs">
            {dayDates.map((day, i) => (
              <button
                key={day}
                type="button"
                className={`dayTab ${selectedDay === day ? "dayTabActive" : ""}`}
                onClick={() => setSelectedDay(day)}
              >
                {DAY_LABELS[i]} {formatDayMonth(day)}
              </button>
            ))}
          </div>

          {loading && <p className="timetableLoading">Rooster laden…</p>}
          {!loading && calendars.length === 0 && (
            <p className="timetableEmpty">Nog geen kalenders gekoppeld.</p>
          )}
          {!loading && selectedCalendars.length === 0 && calendars.length > 0 && (
            <p className="timetableEmpty">Selecteer minstens één lid.</p>
          )}
          {!loading && selectedCalendars.length > 0 && sharedDayEvents.size === 0 && (
            <p className="timetableEmpty">Geen lessen op deze dag.</p>
          )}

          {!loading && sharedDayEvents.size > 0 && (
            <div className="swimlaneWrap">
              <div className="swimlaneTimeHeader">
                <div className="swimlaneCorner" />
                {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                  <div key={i} className="swimlaneHourLabel">
                    {String(HOUR_START + i).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {[...sharedDayEvents.entries()].map(([userId, events]) => {
                const member = calendars.find((c) => c.user_id === userId);
                const color = colorByUser.get(userId) ?? "#5865f2";
                return (
                  <div key={userId} className="swimlaneRow">
                    <div className="swimlaneMemberLabel" style={{ borderLeftColor: color }}>
                      {member?.initials ?? "?"}
                    </div>
                    <div
                      className="swimlaneTrack"
                      style={{ height: SWIMLANE_ROW_HEIGHT }}
                    >
                      {events.map((ev) => {
                        const start = new Date(ev.start);
                        const end = new Date(ev.end);
                        const startMin = start.getHours() * 60 + start.getMinutes() - HOUR_START * 60;
                        const endMin = end.getHours() * 60 + end.getMinutes() - HOUR_START * 60;
                        const totalMin = (HOUR_END - HOUR_START) * 60;
                        const left = Math.max(0, (startMin / totalMin) * 100);
                        const width = Math.max(2, ((endMin - startMin) / totalMin) * 100);
                        return (
                          <button
                            key={`${ev.start}-${ev.title}`}
                            type="button"
                            className="swimlaneEvent"
                            style={{
                              left: `${left}%`,
                              width: `${Math.min(width, 100 - left)}%`,
                              backgroundColor: color,
                            }}
                            onClick={() => setPopupEvent(ev)}
                            title={ev.title}
                          >
                            <span className="swimlaneEventTitle">{ev.title}</span>
                            {ev.typeBadges.length > 0 && (
                              <span className="swimlaneEventBadge">{ev.typeBadges.join("")}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="timetableLegends">
            <span>
              <strong>H</strong> = Hoorcollege · <strong>P</strong> = Practicum · <strong>W</strong> = Werkcollege
            </span>
            <span className="timetableLegendTz">Tijden in {timezone}</span>
          </div>
        </section>
      )}

      {tab === "personal" && (
        <section className="timetableSection personalTimetable">
          <header className="timetableHeader">
            <h2 className="timetableTitle">Mijn rooster — week van {formatDayMonth(weekStart)}</h2>
            <div className="timetableWeekNav">
              <button
                type="button"
                className="btn btnSecondary timetableNavBtn"
                onClick={() =>
                  setWeekStart(toISODate(new Date(weekMonday.getTime() - 7 * 86400000)))
                }
              >
                ← Vorige week
              </button>
              <button
                type="button"
                className="btn btnSecondary timetableNavBtn"
                onClick={() => setWeekStart(toISODate(getWeekMonday(new Date())))}
              >
                Deze week
              </button>
              <button
                type="button"
                className="btn btnSecondary timetableNavBtn"
                onClick={() =>
                  setWeekStart(toISODate(new Date(weekMonday.getTime() + 7 * 86400000)))
                }
              >
                Volgende week →
              </button>
            </div>
          </header>

          {loading && <p className="timetableLoading">Rooster laden…</p>}
          {!loading && (
            <div className="personalTimetableGridWrap">
              <div
                className="personalTimetableGrid"
                style={{
                  gridTemplateColumns: `56px repeat(6, minmax(100px, 1fr))`,
                  gridTemplateRows: `32px repeat(${PERSONAL_HOUR_END - HOUR_START}, ${ROW_HEIGHT_PX}px)`,
                }}
              >
                <div className="personalTimetableCorner" style={{ gridColumn: 1, gridRow: 1 }} />
                {dayDates.map((day, i) => (
                  <div
                    key={day}
                    className="personalTimetableDayHeader"
                    style={{ gridColumn: i + 2, gridRow: 1 }}
                  >
                    <span className="timetableDayName">{DAY_LABELS[i]}</span>
                    <span className="timetableDayDate">{formatDayMonth(day)}</span>
                  </div>
                ))}
                {Array.from({ length: PERSONAL_HOUR_END - HOUR_START }, (_, i) => (
                  <div
                    key={i}
                    className="personalTimetableTimeLabel"
                    style={{ gridColumn: 1, gridRow: i + 2 }}
                  >
                    {String(HOUR_START + i).padStart(2, "0")}:00
                  </div>
                ))}
                {dayDates.map((day, dayIndex) => {
                  const dayEvents = personalEvents.filter((ev) => eventDayKey(ev.start) === day);
                  return (
                    <div
                      key={day}
                      className="personalTimetableDayColumn"
                      style={{
                        gridColumn: dayIndex + 2,
                        gridRow: `2 / ${PERSONAL_HOUR_END - HOUR_START + 2}`,
                        height: (PERSONAL_HOUR_END - HOUR_START) * ROW_HEIGHT_PX,
                      }}
                    >
                      {dayEvents.map((ev) => {
                        const start = new Date(ev.start);
                        const end = new Date(ev.end);
                        const startMin = start.getHours() * 60 + start.getMinutes() - HOUR_START * 60;
                        const endMin = end.getHours() * 60 + end.getMinutes() - HOUR_START * 60;
                        const top = Math.max(0, (startMin / 60) * ROW_HEIGHT_PX);
                        const height = Math.max(28, ((endMin - startMin) / 60) * ROW_HEIGHT_PX);
                        const colorIdx =
                          ev.title.split("").reduce((a, c) => a + c.charCodeAt(0), 0) %
                          MEMBER_COLORS.length;
                        return (
                          <button
                            key={`${ev.start}-${ev.title}`}
                            type="button"
                            className="personalTimetableEvent personalTimetableEventClickable"
                            style={{
                              top: `${top}px`,
                              height: `${height}px`,
                              backgroundColor: MEMBER_COLORS[colorIdx],
                              color: "#1a1b1e",
                            }}
                            onClick={() => setPopupEvent(ev)}
                          >
                            <span className="personalTimetableEventSummary">{ev.title}</span>
                            <span className="personalTimetableEventTime">
                              {formatTime(ev.start)}–{formatTime(ev.end)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!loading && personalEvents.length === 0 && (
            <p className="timetableEmpty">Geen lessen deze week, of geen kalender gekoppeld.</p>
          )}
        </section>
      )}

      {popupEvent && (
        <div className="timetablePopupOverlay" onClick={() => setPopupEvent(null)}>
          <div className="timetablePopup" onClick={(e) => e.stopPropagation()}>
            <div className="timetablePopupHeader">
              <h3 className="timetablePopupTitle">{popupEvent.title}</h3>
              <button
                type="button"
                className="timetablePopupClose"
                onClick={() => setPopupEvent(null)}
                aria-label="Sluiten"
              >
                ×
              </button>
            </div>
            <dl className="timetablePopupBody">
              <dt>Tijd</dt>
              <dd>
                {formatTime(popupEvent.start)} – {formatTime(popupEvent.end)}
              </dd>
              <dt>Lid</dt>
              <dd>{popupEvent.initials}</dd>
              {popupEvent.typeBadges.length > 0 && (
                <>
                  <dt>Type</dt>
                  <dd>{popupEvent.typeBadges.join(", ")}</dd>
                </>
              )}
              {popupEvent.location && (
                <>
                  <dt>Locatie</dt>
                  <dd>{popupEvent.location}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
