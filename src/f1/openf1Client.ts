const OPENF1_BASE = "https://api.openf1.org/v1";

export type OpenF1Session = {
  session_key: number;
  session_name: string;
  session_type?: string;
  date_start: string;
  date_end?: string | null;
  meeting_key: number;
  circuit_short_name?: string;
  country_name?: string;
  country_code?: string | null;
  location?: string;
  year: number;
  is_cancelled?: boolean;
};

export type OpenF1Meeting = {
  meeting_key: number;
  meeting_name?: string;
  meeting_official_name?: string;
  location?: string;
  country_name?: string;
  country_code?: string | null;
  circuit_short_name?: string;
  year: number;
  date_start?: string;
};

export type OpenF1SessionResult = {
  dnf?: boolean;
  dns?: boolean;
  dsq?: boolean;
  driver_number: number;
  duration?: number | number[] | null;
  gap_to_leader?: number | string | number[] | null;
  number_of_laps?: number | null;
  meeting_key: number;
  position: number | null;
  session_key: number;
};

export type OpenF1StartingGrid = {
  position: number;
  driver_number: number;
  meeting_key: number;
  session_key: number;
};

export type OpenF1Driver = {
  driver_number: number;
  full_name?: string;
  last_name?: string;
  first_name?: string;
  name_acronym?: string;
  team_name?: string | null;
  session_key?: number;
  meeting_key?: number;
};

export type OpenF1Lap = {
  driver_number: number;
  lap_duration?: number | null;
  lap_number?: number | null;
  is_pit_out_lap?: boolean;
  session_key: number;
};

export type OpenF1Pit = {
  driver_number: number;
  lap_number?: number | null;
  pit_duration?: number | null;
  stop_duration?: number | null;
  session_key: number;
};

export type OpenF1ChampionshipDriver = {
  driver_number: number;
  meeting_key: number;
  session_key: number;
  points_current?: number | null;
  position_current?: number | null;
};

export type OpenF1ChampionshipTeam = {
  meeting_key: number;
  session_key: number;
  team_name: string;
  points_current?: number | null;
  position_current?: number | null;
};

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${OPENF1_BASE}${path}`);
    if (!res.ok) {
      console.warn("f1 openf1: bad status", path, res.status, res.statusText);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn("f1 openf1: fetch error", path, err);
    return null;
  }
}

export async function fetchOpenF1Sessions(year: number): Promise<OpenF1Session[]> {
  const data = await getJson<OpenF1Session[]>(`/sessions?year=${year}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchOpenF1Meetings(year: number): Promise<OpenF1Meeting[]> {
  const data = await getJson<OpenF1Meeting[]>(`/meetings?year=${year}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchOpenF1SessionResults(sessionKey: number): Promise<OpenF1SessionResult[]> {
  const data = await getJson<OpenF1SessionResult[]>(`/session_result?session_key=${sessionKey}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchOpenF1StartingGrid(sessionKey: number): Promise<OpenF1StartingGrid[]> {
  const data = await getJson<OpenF1StartingGrid[]>(`/starting_grid?session_key=${sessionKey}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchOpenF1Drivers(sessionKey: number): Promise<OpenF1Driver[]> {
  const data = await getJson<OpenF1Driver[]>(`/drivers?session_key=${sessionKey}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchOpenF1Laps(sessionKey: number): Promise<OpenF1Lap[]> {
  const data = await getJson<OpenF1Lap[]>(`/laps?session_key=${sessionKey}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchOpenF1Pits(sessionKey: number): Promise<OpenF1Pit[]> {
  const data = await getJson<OpenF1Pit[]>(`/pit?session_key=${sessionKey}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchOpenF1DriverChampionship(
  sessionKey: number
): Promise<OpenF1ChampionshipDriver[]> {
  const data = await getJson<OpenF1ChampionshipDriver[]>(
    `/championship_drivers?session_key=${sessionKey}`
  );
  return Array.isArray(data) ? data : [];
}

export async function fetchOpenF1TeamChampionship(
  sessionKey: number
): Promise<OpenF1ChampionshipTeam[]> {
  const data = await getJson<OpenF1ChampionshipTeam[]>(
    `/championship_teams?session_key=${sessionKey}`
  );
  return Array.isArray(data) ? data : [];
}
