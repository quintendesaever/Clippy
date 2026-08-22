import {
  fetchOpenF1DriverChampionship,
  fetchOpenF1Drivers,
  fetchOpenF1Laps,
  fetchOpenF1Pits,
  fetchOpenF1SessionResults,
  fetchOpenF1StartingGrid,
  fetchOpenF1TeamChampionship,
  type OpenF1ChampionshipDriver,
  type OpenF1ChampionshipTeam,
  type OpenF1Driver,
  type OpenF1Lap,
  type OpenF1Pit,
  type OpenF1SessionResult,
  type OpenF1StartingGrid,
} from "./openf1Client.js";
import {
  fetchJolpicaConstructorStandings,
  fetchJolpicaDriverStandings,
  fetchJolpicaRaceResults,
  fetchJolpicaSeasonRaces,
  matchJolpicaRound,
  type JolpicaConstructorStanding,
  type JolpicaDriverStanding,
  type JolpicaResult,
} from "./jolpicaClient.js";
import { usableRace } from "./schedule.js";
import type {
  F1DriverRef,
  F1FastestLap,
  F1Meeting,
  F1PitSummary,
  F1PositionSwing,
  F1RaceResults,
  F1ResultRow,
  F1ResultStatus,
  F1StandingsRow,
} from "./types.js";

function driverName(driver: OpenF1Driver | undefined, driverNumber: number): string {
  if (driver?.full_name?.trim()) return driver.full_name.trim();
  const parts = [driver?.first_name, driver?.last_name].filter(Boolean).join(" ").trim();
  if (parts) return parts;
  if (driver?.name_acronym) return driver.name_acronym;
  return `#${driverNumber}`;
}

function driverMap(drivers: OpenF1Driver[]): Map<number, OpenF1Driver> {
  const map = new Map<number, OpenF1Driver>();
  for (const driver of drivers) {
    map.set(driver.driver_number, driver);
  }
  return map;
}

function refFromOpenF1(drivers: Map<number, OpenF1Driver>, driverNumber: number): F1DriverRef {
  const driver = drivers.get(driverNumber);
  return {
    driverNumber,
    name: driverName(driver, driverNumber),
    team: driver?.team_name?.trim() || null,
  };
}

function statusFromOpenF1(row: OpenF1SessionResult): { status: F1ResultStatus; statusText: string | null } {
  if (row.dsq) return { status: "dsq", statusText: "DSQ" };
  if (row.dns) return { status: "dns", statusText: "DNS" };
  if (row.dnf) return { status: "dnf", statusText: "DNF" };
  return { status: "classified", statusText: null };
}

export function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const mins = Math.floor(seconds / 60);
  const rem = seconds - mins * 60;
  const whole = Math.floor(rem);
  const ms = Math.round((rem - whole) * 1000);
  return `${mins}:${String(whole).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function parseOpenF1Classification(
  sessionResults: OpenF1SessionResult[],
  grid: OpenF1StartingGrid[],
  drivers: OpenF1Driver[]
): F1ResultRow[] {
  const byNumber = driverMap(drivers);
  const gridByDriver = new Map(grid.map((row) => [row.driver_number, row.position]));
  return sessionResults
    .slice()
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .map((row) => {
      const { status, statusText } = statusFromOpenF1(row);
      return {
        ...refFromOpenF1(byNumber, row.driver_number),
        position: row.position,
        grid: gridByDriver.get(row.driver_number) ?? null,
        status,
        statusText,
        points: null,
      };
    });
}

export function parseFastestLap(laps: OpenF1Lap[], drivers: OpenF1Driver[]): F1FastestLap | null {
  const byNumber = driverMap(drivers);
  let best: OpenF1Lap | null = null;
  for (const lap of laps) {
    if (lap.is_pit_out_lap) continue;
    if (lap.lap_duration == null || lap.lap_duration <= 0) continue;
    if (!best || lap.lap_duration < (best.lap_duration ?? Infinity)) {
      best = lap;
    }
  }
  if (!best || best.lap_duration == null) return null;
  return {
    ...refFromOpenF1(byNumber, best.driver_number),
    timeLabel: formatLapTime(best.lap_duration),
    lapNumber: best.lap_number ?? null,
  };
}

export function parsePositionSwings(classification: F1ResultRow[]): {
  biggestGain: F1PositionSwing | null;
  biggestLoss: F1PositionSwing | null;
} {
  const classified = classification.filter(
    (row) =>
      row.status === "classified" &&
      row.grid != null &&
      row.position != null &&
      row.grid > 0 &&
      row.position > 0
  );
  let biggestGain: F1PositionSwing | null = null;
  let biggestLoss: F1PositionSwing | null = null;
  for (const row of classified) {
    const places = row.grid! - row.position!;
    const swing: F1PositionSwing = {
      driver: row.name,
      grid: row.grid!,
      finish: row.position!,
      places,
    };
    if (places > 0 && (!biggestGain || places > biggestGain.places)) biggestGain = swing;
    if (places < 0 && (!biggestLoss || places < biggestLoss.places)) biggestLoss = swing;
  }
  return { biggestGain, biggestLoss };
}

export function parsePitStops(pits: OpenF1Pit[], drivers: OpenF1Driver[]): F1PitSummary[] {
  const byNumber = driverMap(drivers);
  const counts = new Map<number, number>();
  for (const pit of pits) {
    counts.set(pit.driver_number, (counts.get(pit.driver_number) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([driverNumber, stops]) => ({
      driver: driverName(byNumber.get(driverNumber), driverNumber),
      stops,
    }))
    .sort((a, b) => b.stops - a.stops || a.driver.localeCompare(b.driver));
}

export function parseOpenF1DriverStandings(
  rows: OpenF1ChampionshipDriver[],
  drivers: OpenF1Driver[]
): F1StandingsRow[] {
  const byNumber = driverMap(drivers);
  return rows
    .filter((row) => row.position_current != null && row.points_current != null)
    .sort((a, b) => (a.position_current ?? 99) - (b.position_current ?? 99))
    .map((row) => ({
      position: row.position_current!,
      name: driverName(byNumber.get(row.driver_number), row.driver_number),
      team: byNumber.get(row.driver_number)?.team_name?.trim() || null,
      points: row.points_current!,
    }));
}

export function parseOpenF1TeamStandings(rows: OpenF1ChampionshipTeam[]): F1StandingsRow[] {
  return rows
    .filter((row) => row.position_current != null && row.points_current != null && row.team_name)
    .sort((a, b) => (a.position_current ?? 99) - (b.position_current ?? 99))
    .map((row) => ({
      position: row.position_current!,
      name: row.team_name,
      team: row.team_name,
      points: row.points_current!,
    }));
}

function jolpicaDriverName(driver: { givenName?: string; familyName?: string } | undefined): string {
  return [driver?.givenName, driver?.familyName].filter(Boolean).join(" ").trim() || "Unknown";
}

function jolpicaStatus(status: string | undefined): { status: F1ResultStatus; statusText: string | null } {
  const raw = (status ?? "").toLowerCase();
  if (raw.includes("disqual")) return { status: "dsq", statusText: status ?? "DSQ" };
  if (raw === "did not start" || raw === "dns") return { status: "dns", statusText: status ?? "DNS" };
  if (raw && raw !== "finished" && !/^\+\d+ lap/.test(raw)) {
    return { status: "dnf", statusText: status ?? "DNF" };
  }
  return { status: "classified", statusText: status && status !== "Finished" ? status : null };
}

export function parseJolpicaClassification(results: JolpicaResult[]): F1ResultRow[] {
  return results.map((row) => {
    const { status, statusText } = jolpicaStatus(row.status);
    const grid = row.grid ? Number(row.grid) : null;
    return {
      driverNumber: null,
      name: jolpicaDriverName(row.Driver),
      team: row.Constructor?.name ?? null,
      position: row.position ? Number(row.position) : null,
      grid: grid != null && Number.isFinite(grid) ? grid : null,
      status,
      statusText,
      points: row.points != null ? Number(row.points) : null,
    };
  });
}

export function parseJolpicaDriverStandings(rows: JolpicaDriverStanding[]): F1StandingsRow[] {
  return rows.map((row) => ({
    position: Number(row.position),
    name: jolpicaDriverName(row.Driver),
    team: row.Constructors?.[0]?.name ?? null,
    points: Number(row.points),
  }));
}

export function parseJolpicaConstructorStandings(rows: JolpicaConstructorStanding[]): F1StandingsRow[] {
  return rows.map((row) => ({
    position: Number(row.position),
    name: row.Constructor?.name ?? "Unknown",
    team: row.Constructor?.name ?? null,
    points: Number(row.points),
  }));
}

export function isPublishableResults(results: F1RaceResults | null): results is F1RaceResults {
  if (!results) return false;
  const classified = results.classification.filter((row) => row.name && row.position != null);
  if (classified.length < 5) return false;
  if (results.driverStandings.length === 0) return false;
  if (results.constructorStandings.length === 0) return false;
  return true;
}

function jolpicaFastestLap(results: JolpicaResult[]): F1FastestLap | null {
  const withFastest = results.find((row) => row.FastestLap?.rank === "1" && row.FastestLap.Time?.time);
  if (!withFastest?.FastestLap?.Time?.time) return null;
  return {
    driverNumber: null,
    name: jolpicaDriverName(withFastest.Driver),
    team: withFastest.Constructor?.name ?? null,
    timeLabel: withFastest.FastestLap.Time.time,
    lapNumber: withFastest.FastestLap.lap ? Number(withFastest.FastestLap.lap) : null,
  };
}

export async function fetchRaceWeekendResults(meeting: F1Meeting): Promise<F1RaceResults | null> {
  const race = usableRace(meeting);
  if (!race) return null;

  const [sessionResults, grid, drivers, laps, pits, champDrivers, champTeams] = await Promise.all([
    fetchOpenF1SessionResults(race.sessionKey),
    fetchOpenF1StartingGrid(race.sessionKey),
    fetchOpenF1Drivers(race.sessionKey),
    fetchOpenF1Laps(race.sessionKey),
    fetchOpenF1Pits(race.sessionKey),
    fetchOpenF1DriverChampionship(race.sessionKey),
    fetchOpenF1TeamChampionship(race.sessionKey),
  ]);

  let classification = parseOpenF1Classification(sessionResults, grid, drivers);
  let fastestLap = parseFastestLap(laps, drivers);
  let driverStandings = parseOpenF1DriverStandings(champDrivers, drivers);
  let constructorStandings = parseOpenF1TeamStandings(champTeams);
  const pitStops = parsePitStops(pits, drivers);

  if (classification.length === 0 || driverStandings.length === 0 || constructorStandings.length === 0) {
    const seasonRaces = await fetchJolpicaSeasonRaces(meeting.season);
    const round = matchJolpicaRound(
      meeting.season,
      race.dateStart,
      meeting.circuitName,
      meeting.country,
      seasonRaces
    );
    if (round) {
      const [jolpicaRace, jolpicaDrivers, jolpicaTeams] = await Promise.all([
        classification.length === 0 ? fetchJolpicaRaceResults(meeting.season, round) : Promise.resolve(null),
        driverStandings.length === 0
          ? fetchJolpicaDriverStandings(meeting.season, round)
          : Promise.resolve([] as JolpicaDriverStanding[]),
        constructorStandings.length === 0
          ? fetchJolpicaConstructorStandings(meeting.season, round)
          : Promise.resolve([] as JolpicaConstructorStanding[]),
      ]);
      if (classification.length === 0 && jolpicaRace?.Results?.length) {
        classification = parseJolpicaClassification(jolpicaRace.Results);
        if (!fastestLap) fastestLap = jolpicaFastestLap(jolpicaRace.Results);
      }
      if (driverStandings.length === 0 && jolpicaDrivers.length) {
        driverStandings = parseJolpicaDriverStandings(jolpicaDrivers);
      }
      if (constructorStandings.length === 0 && jolpicaTeams.length) {
        constructorStandings = parseJolpicaConstructorStandings(jolpicaTeams);
      }
    }
  }

  const { biggestGain, biggestLoss } = parsePositionSwings(classification);
  const dnfs = classification.filter((row) => row.status === "dnf" || row.status === "dsq" || row.status === "dns");

  return {
    meetingId: meeting.id,
    meetingKey: meeting.meetingKey,
    meetingName: meeting.name,
    classification,
    fastestLap,
    biggestGain,
    biggestLoss,
    dnfs,
    driverStandings,
    constructorStandings,
    pitStops,
  };
}
