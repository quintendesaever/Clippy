const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

export type JolpicaDriver = {
  givenName?: string;
  familyName?: string;
  code?: string;
};

export type JolpicaConstructor = {
  name?: string;
};

export type JolpicaResult = {
  position?: string;
  points?: string;
  grid?: string;
  status?: string;
  Driver?: JolpicaDriver;
  Constructor?: JolpicaConstructor;
  FastestLap?: { rank?: string; lap?: string; Time?: { time?: string } };
};

export type JolpicaRace = {
  round?: string;
  raceName?: string;
  date?: string;
  Circuit?: { circuitName?: string; Location?: { country?: string; locality?: string } };
  Results?: JolpicaResult[];
};

export type JolpicaDriverStanding = {
  position?: string;
  points?: string;
  Driver?: JolpicaDriver;
  Constructors?: JolpicaConstructor[];
};

export type JolpicaConstructorStanding = {
  position?: string;
  points?: string;
  Constructor?: JolpicaConstructor;
};

type JolpicaRaceList = {
  MRData?: { RaceTable?: { Races?: JolpicaRace[] } };
};

type JolpicaDriverStandings = {
  MRData?: {
    StandingsTable?: { StandingsLists?: { DriverStandings?: JolpicaDriverStanding[] }[] };
  };
};

type JolpicaConstructorStandings = {
  MRData?: {
    StandingsTable?: { StandingsLists?: { ConstructorStandings?: JolpicaConstructorStanding[] }[] };
  };
};

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${JOLPICA_BASE}${path}`, {
      headers: { Accept: "application/json", "User-Agent": "ClippyV3-F1" },
    });
    if (!res.ok) {
      console.warn("f1 jolpica: bad status", path, res.status, res.statusText);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn("f1 jolpica: fetch error", path, err);
    return null;
  }
}

export async function fetchJolpicaSeasonRaces(season: number): Promise<JolpicaRace[]> {
  const data = await getJson<JolpicaRaceList>(`/${season}.json?limit=100`);
  return data?.MRData?.RaceTable?.Races ?? [];
}

export async function fetchJolpicaRaceResults(
  season: number,
  round: string
): Promise<JolpicaRace | null> {
  const data = await getJson<JolpicaRaceList>(`/${season}/${round}/results.json?limit=100`);
  return data?.MRData?.RaceTable?.Races?.[0] ?? null;
}

export async function fetchJolpicaDriverStandings(
  season: number,
  round: string
): Promise<JolpicaDriverStanding[]> {
  const data = await getJson<JolpicaDriverStandings>(
    `/${season}/${round}/driverstandings.json?limit=100`
  );
  return data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
}

export async function fetchJolpicaConstructorStandings(
  season: number,
  round: string
): Promise<JolpicaConstructorStanding[]> {
  const data = await getJson<JolpicaConstructorStandings>(
    `/${season}/${round}/constructorstandings.json?limit=30`
  );
  return data?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];
}

export function matchJolpicaRound(
  season: number,
  raceDate: Date,
  circuitName: string,
  country: string,
  races: JolpicaRace[]
): string | null {
  const day = raceDate.toISOString().slice(0, 10);
  const circuit = circuitName.trim().toLowerCase();
  const countryName = country.trim().toLowerCase();

  const byDate = races.find((race) => race.date === day && String(season));
  if (byDate?.round) return byDate.round;

  const byCircuit = races.find((race) => {
    const name = race.Circuit?.circuitName?.toLowerCase() ?? "";
    const locCountry = race.Circuit?.Location?.country?.toLowerCase() ?? "";
    return (circuit && name.includes(circuit)) || (countryName && locCountry === countryName);
  });
  return byCircuit?.round ?? null;
}
