import { F1_SCHEDULE_CACHE_TTL_MS, type F1Timing, PRODUCTION_F1_TIMING } from "./config.js";
import { fetchOpenF1Meetings, fetchOpenF1Sessions, type OpenF1Meeting, type OpenF1Session } from "./openf1Client.js";
import { findActiveMeetingBySchedule } from "./stages.js";
import type { F1Meeting, F1Session, F1SessionKind } from "./types.js";

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sessionName(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function classifySessionName(rawName: string): F1SessionKind | null {
  const name = sessionName(rawName).toLowerCase();
  if (!name) return null;
  if (name.includes("sprint") && (name.includes("qualifying") || name.includes("shootout"))) {
    return null;
  }
  if (name === "qualifying") return "qualifying";
  if (name === "sprint") return "sprint";
  if (name === "race") return "race";
  return null;
}

function toSession(row: OpenF1Session, kind: F1SessionKind): F1Session | null {
  const dateStart = parseDate(row.date_start);
  if (!dateStart) return null;
  return {
    sessionKey: row.session_key,
    kind,
    name: sessionName(row.session_name) || kind,
    dateStart,
    dateEnd: parseDate(row.date_end),
    cancelled: Boolean(row.is_cancelled),
  };
}

function pickSession(sessions: F1Session[]): F1Session | null {
  const live = sessions.filter((session) => !session.cancelled);
  return (live[0] ?? sessions[0]) ?? null;
}

function meetingDisplayName(
  meeting: OpenF1Meeting | undefined,
  sample: OpenF1Session
): string {
  const official = meeting?.meeting_name?.trim();
  if (official) return official;
  if (sample.location && sample.location !== sample.circuit_short_name) {
    return `${sample.location} Grand Prix`;
  }
  return `${sample.circuit_short_name ?? "F1"} Grand Prix`;
}

export function meetingsFromOpenF1(
  sessions: OpenF1Session[],
  meetings: OpenF1Meeting[] = []
): F1Meeting[] {
  const meetingByKey = new Map(meetings.map((meeting) => [meeting.meeting_key, meeting]));
  const grouped = new Map<number, OpenF1Session[]>();

  for (const session of sessions) {
    if (session.meeting_key == null) continue;
    const list = grouped.get(session.meeting_key) ?? [];
    list.push(session);
    grouped.set(session.meeting_key, list);
  }

  const result: F1Meeting[] = [];
  for (const [meetingKey, rows] of grouped) {
    const qualifying: F1Session[] = [];
    const races: F1Session[] = [];
    const sprints: F1Session[] = [];
    for (const row of rows) {
      const kind = classifySessionName(row.session_name);
      if (!kind) continue;
      const session = toSession(row, kind);
      if (!session) continue;
      if (kind === "qualifying") qualifying.push(session);
      else if (kind === "race") races.push(session);
      else sprints.push(session);
    }

    const qualifyingSession = pickSession(qualifying);
    const raceSession = pickSession(races);
    const sprintSession = pickSession(sprints);
    if (!qualifyingSession && !raceSession) continue;

    const sample = rows[0]!;
    const meta = meetingByKey.get(meetingKey);
    const year = meta?.year ?? sample.year;
    result.push({
      id: `${year}-${meetingKey}`,
      meetingKey,
      season: year,
      name: meetingDisplayName(meta, sample),
      circuitName: meta?.circuit_short_name ?? sample.circuit_short_name ?? "",
      locality: meta?.location ?? sample.location ?? "",
      country: meta?.country_name ?? sample.country_name ?? "",
      countryCode: meta?.country_code ?? sample.country_code ?? null,
      qualifying: qualifyingSession,
      race: raceSession,
      sprint: sprintSession,
    });
  }

  return result.sort((a, b) => {
    const aTime = (a.race ?? a.qualifying)!.dateStart.getTime();
    const bTime = (b.race ?? b.qualifying)!.dateStart.getTime();
    return aTime - bTime;
  });
}

export function usableQualifying(meeting: F1Meeting): F1Session | null {
  if (!meeting.qualifying || meeting.qualifying.cancelled) return null;
  return meeting.qualifying;
}

export function usableRace(meeting: F1Meeting): F1Session | null {
  if (!meeting.race || meeting.race.cancelled) return null;
  return meeting.race;
}

export function usableSprint(meeting: F1Meeting): F1Session | null {
  if (!meeting.sprint || meeting.sprint.cancelled) return null;
  return meeting.sprint;
}

let cachedMeetings: F1Meeting[] | null = null;
let cacheExpiresAt = 0;
let inflight: Promise<F1Meeting[]> | null = null;

export function clearF1ScheduleCache(): void {
  cachedMeetings = null;
  cacheExpiresAt = 0;
  inflight = null;
}

export async function fetchSeasonMeetings(now: Date = new Date()): Promise<F1Meeting[]> {
  const ts = now.getTime();
  if (cachedMeetings && cacheExpiresAt > ts) return cachedMeetings;
  if (inflight) return inflight;

  inflight = (async () => {
    const year = now.getFullYear();
    const [sessions, meetings] = await Promise.all([
      fetchOpenF1Sessions(year),
      fetchOpenF1Meetings(year),
    ]);
    if (sessions.length === 0 && cachedMeetings) {
      return cachedMeetings;
    }
    const normalized = meetingsFromOpenF1(sessions, meetings);
    cachedMeetings = normalized;
    cacheExpiresAt = Date.now() + F1_SCHEDULE_CACHE_TTL_MS;
    return normalized;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function findMeetingByKey(meetings: F1Meeting[], meetingKey: number): F1Meeting | null {
  return meetings.find((meeting) => meeting.meetingKey === meetingKey) ?? null;
}

export function findActiveMeeting(
  meetings: F1Meeting[],
  now: Date,
  timing: F1Timing = PRODUCTION_F1_TIMING
): F1Meeting | null {
  return findActiveMeetingBySchedule(meetings, now, timing);
}

export async function getActiveMeeting(
  now: Date,
  timing: F1Timing = PRODUCTION_F1_TIMING
): Promise<F1Meeting | null> {
  const meetings = await fetchSeasonMeetings(now);
  return findActiveMeeting(meetings, now, timing);
}
