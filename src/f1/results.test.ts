import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatLapTime,
  isPublishableResults,
  parseFastestLap,
  parseJolpicaClassification,
  parseJolpicaConstructorStandings,
  parseJolpicaDriverStandings,
  parseOpenF1Classification,
  parseOpenF1DriverStandings,
  parseOpenF1TeamStandings,
  parsePositionSwings,
} from "./results.js";
import type { F1RaceResults, F1ResultRow } from "./types.js";

describe("results parsing", () => {
  it("parses OpenF1 classification, DNFs, and grid swings", () => {
    const classification = parseOpenF1Classification(
      [
        { driver_number: 1, position: 1, dnf: false, dns: false, dsq: false, meeting_key: 1, session_key: 2 },
        { driver_number: 44, position: 5, dnf: false, dns: false, dsq: false, meeting_key: 1, session_key: 2 },
        { driver_number: 16, position: 18, dnf: true, dns: false, dsq: false, meeting_key: 1, session_key: 2 },
      ],
      [
        { driver_number: 1, position: 3, meeting_key: 1, session_key: 2 },
        { driver_number: 44, position: 12, meeting_key: 1, session_key: 2 },
        { driver_number: 16, position: 2, meeting_key: 1, session_key: 2 },
      ],
      [
        { driver_number: 1, full_name: "Max Verstappen", team_name: "Red Bull Racing" },
        { driver_number: 44, full_name: "Lewis Hamilton", team_name: "Ferrari" },
        { driver_number: 16, full_name: "Charles Leclerc", team_name: "Ferrari" },
      ]
    );
    assert.equal(classification[0]!.name, "Max Verstappen");
    assert.equal(classification[0]!.team, "Red Bull Racing");
    assert.equal(classification[0]!.grid, 3);
    assert.equal(classification[2]!.status, "dnf");
    const swings = parsePositionSwings(classification);
    assert.equal(swings.biggestGain?.driver, "Lewis Hamilton");
    assert.equal(swings.biggestGain?.places, 7);
    assert.equal(swings.biggestLoss, null);
  });

  it("parses fastest lap from OpenF1 laps and formats the time", () => {
    assert.equal(formatLapTime(91.234), "1:31.234");
    const fastest = parseFastestLap(
      [
        { driver_number: 4, lap_duration: 93.1, lap_number: 10, is_pit_out_lap: false, session_key: 2 },
        { driver_number: 81, lap_duration: 90.5, lap_number: 14, is_pit_out_lap: false, session_key: 2 },
        { driver_number: 81, lap_duration: 80, lap_number: 1, is_pit_out_lap: true, session_key: 2 },
      ],
      [{ driver_number: 81, full_name: "Oscar Piastri", team_name: "McLaren" }]
    );
    assert.equal(fastest?.name, "Oscar Piastri");
    assert.equal(fastest?.timeLabel, "1:30.500");
    assert.equal(fastest?.lapNumber, 14);
  });

  it("parses OpenF1 championship standings after a race", () => {
    const drivers = parseOpenF1DriverStandings(
      [
        { driver_number: 4, meeting_key: 1, session_key: 2, position_current: 1, points_current: 200 },
        { driver_number: 81, meeting_key: 1, session_key: 2, position_current: 2, points_current: 180 },
      ],
      [
        { driver_number: 4, full_name: "Lando Norris", team_name: "McLaren" },
        { driver_number: 81, full_name: "Oscar Piastri", team_name: "McLaren" },
      ]
    );
    assert.equal(drivers[0]!.name, "Lando Norris");
    assert.equal(drivers[0]!.points, 200);
    const teams = parseOpenF1TeamStandings([
      { meeting_key: 1, session_key: 2, team_name: "McLaren", position_current: 1, points_current: 380 },
    ]);
    assert.equal(teams[0]!.name, "McLaren");
  });

  it("parses Jolpica results and standings fallback payloads", () => {
    const classification = parseJolpicaClassification([
      {
        position: "1",
        grid: "2",
        status: "Finished",
        points: "25",
        Driver: { givenName: "Lando", familyName: "Norris" },
        Constructor: { name: "McLaren" },
      },
      {
        position: "20",
        grid: "8",
        status: "Accident",
        points: "0",
        Driver: { givenName: "Carlos", familyName: "Sainz" },
        Constructor: { name: "Williams" },
      },
    ]);
    assert.equal(classification[0]!.status, "classified");
    assert.equal(classification[1]!.status, "dnf");
    const drivers = parseJolpicaDriverStandings([
      {
        position: "1",
        points: "216",
        Driver: { givenName: "Lando", familyName: "Norris" },
        Constructors: [{ name: "McLaren" }],
      },
    ]);
    const teams = parseJolpicaConstructorStandings([{ position: "1", points: "400", Constructor: { name: "McLaren" } }]);
    assert.equal(drivers[0]!.points, 216);
    assert.equal(teams[0]!.name, "McLaren");
  });

  it("rejects empty or partial results as unpublished", () => {
    const row = (position: number, name: string): F1ResultRow => ({
      driverNumber: position,
      name,
      team: "McLaren",
      position,
      grid: position,
      status: "classified",
      statusText: null,
      points: 25,
    });
    const classification = [
      row(1, "Lando Norris"),
      row(2, "Oscar Piastri"),
      row(3, "Max Verstappen"),
      row(4, "Charles Leclerc"),
      row(5, "George Russell"),
    ];
    const partial: F1RaceResults = {
      meetingId: "2026-1",
      meetingKey: 1,
      meetingName: "Test GP",
      classification,
      fastestLap: null,
      biggestGain: null,
      biggestLoss: null,
      dnfs: [],
      driverStandings: [],
      constructorStandings: [],
      pitStops: [],
    };
    assert.equal(isPublishableResults(partial), false);
    assert.equal(
      isPublishableResults({
        ...partial,
        classification: [row(1, "Lando Norris")],
        driverStandings: [{ position: 1, name: "Lando Norris", team: "McLaren", points: 100 }],
        constructorStandings: [{ position: 1, name: "McLaren", team: "McLaren", points: 200 }],
      }),
      false
    );
    assert.equal(
      isPublishableResults({
        ...partial,
        driverStandings: [{ position: 1, name: "Lando Norris", team: "McLaren", points: 100 }],
        constructorStandings: [{ position: 1, name: "McLaren", team: "McLaren", points: 200 }],
      }),
      true
    );
    assert.equal(isPublishableResults(null), false);
  });
});
