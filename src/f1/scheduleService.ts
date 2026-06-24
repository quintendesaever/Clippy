const OPENF1_SESSIONS_URL = "https://api.openf1.org/v1/sessions";

type OpenF1Session = {
  session_key: number;
  session_type: string;
  date_start: string;
  meeting_key: number;
  circuit_short_name: string;
  country_name: string;
  location: string;
  year: number;
};

export type F1Race = {
  id: string;
  season: string;
  round: string;
  name: string;
  circuitName: string;
  locality: string;
  country: string;
  raceDate: Date;
  meeting_key: number;
  session_key: number;
};

let cachedRaces: F1Race[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function fetchCurrentSeasonRaces(): Promise<F1Race[]> {
  const now = Date.now();
  if (cachedRaces && cacheExpiresAt > now) {
    return cachedRaces;
  }

  const year = new Date().getFullYear();
  const url = `${OPENF1_SESSIONS_URL}?year=${year}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("f1 schedule: bad status", res.status, res.statusText);
      return cachedRaces ?? [];
    }
    const sessions = (await res.json()) as OpenF1Session[];

    const raceSessions = sessions
      .filter((s) => s.session_type === "Race")
      .sort(
        (a, b) =>
          new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
      );

    let races: F1Race[] = raceSessions.map((s, index) => {
      const raceDate = new Date(s.date_start);
      const name =
        s.location && s.location !== s.circuit_short_name
          ? `${s.location} Grand Prix`
          : `${s.circuit_short_name} GP`;
      return {
        id: `${s.year}-${s.meeting_key}`,
        season: String(s.year),
        round: String(index + 1),
        name,
        circuitName: s.circuit_short_name,
        locality: s.location,
        country: s.country_name,
        raceDate,
        meeting_key: s.meeting_key,
        session_key: s.session_key,
      };
    });

    const testEnv = process.env.F1_REMINDER_TEST?.trim().toLowerCase();
    if (testEnv === "1" || testEnv === "true" || testEnv === "yes") {
      const testNow = Date.now();
      const upcomingIndex = races.findIndex((r) => r.raceDate.getTime() >= testNow);
      if (upcomingIndex >= 0) {
        races = [...races];
        races[upcomingIndex] = {
          ...races[upcomingIndex],
          id: "test-simulation",
          raceDate: new Date(testNow + 3 * 60 * 1000),
        };
      }
    }

    cachedRaces = races;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return races;
  } catch (err) {
    console.warn("f1 schedule: fetch error", err);
    return cachedRaces ?? [];
  }
}

export async function findNextRace(now: Date = new Date()): Promise<F1Race | null> {
  const races = await fetchCurrentSeasonRaces();
  const upcoming = races
    .filter((race) => race.raceDate.getTime() >= now.getTime())
    .sort((a, b) => a.raceDate.getTime() - b.raceDate.getTime());
  return upcoming[0] ?? null;
}
