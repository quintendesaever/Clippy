import type { F1Meeting, F1RaceResults } from "./types.js";

/** Sample classification used only by /f1-reminder test-send. Never written as production race state. */
export function buildPreviewRaceResults(meeting: F1Meeting): F1RaceResults {
  const row = (
    position: number,
    name: string,
    team: string,
    grid: number,
    status: "classified" | "dnf" = "classified"
  ) => ({
    driverNumber: position,
    name,
    team,
    position,
    grid,
    status,
    statusText: status === "dnf" ? "DNF" : null,
    points: status === "classified" ? Math.max(0, 26 - position) : 0,
  });

  const classification = [
    row(1, "Lando Norris", "McLaren", 1),
    row(2, "Oscar Piastri", "McLaren", 2),
    row(3, "Max Verstappen", "Red Bull Racing", 4),
    row(4, "Charles Leclerc", "Ferrari", 3),
    row(5, "George Russell", "Mercedes", 6),
    row(6, "Kimi Antonelli", "Mercedes", 7),
    row(7, "Lewis Hamilton", "Ferrari", 5),
    {
      ...row(18, "Sample Retired", "Williams", 12, "dnf"),
      position: 18,
    },
  ];

  return {
    meetingId: `preview:${meeting.id}`,
    meetingKey: meeting.meetingKey,
    meetingName: meeting.name,
    classification,
    fastestLap: {
      driverNumber: 4,
      name: "Lando Norris",
      team: "McLaren",
      timeLabel: "1:30.500",
      lapNumber: 14,
    },
    biggestGain: { driver: "Max Verstappen", grid: 4, finish: 3, places: 1 },
    biggestLoss: { driver: "Lewis Hamilton", grid: 5, finish: 7, places: -2 },
    dnfs: [classification[7]!],
    driverStandings: [
      { position: 1, name: "Lando Norris", team: "McLaren", points: 216 },
      { position: 2, name: "Oscar Piastri", team: "McLaren", points: 198 },
      { position: 3, name: "Max Verstappen", team: "Red Bull Racing", points: 165 },
      { position: 4, name: "Charles Leclerc", team: "Ferrari", points: 140 },
      { position: 5, name: "George Russell", team: "Mercedes", points: 121 },
    ],
    constructorStandings: [
      { position: 1, name: "McLaren", team: "McLaren", points: 414 },
      { position: 2, name: "Ferrari", team: "Ferrari", points: 261 },
      { position: 3, name: "Mercedes", team: "Mercedes", points: 220 },
    ],
    pitStops: [
      { driver: "Lando Norris", stops: 2 },
      { driver: "Oscar Piastri", stops: 2 },
      { driver: "Sample Retired", stops: 1 },
    ],
  };
}
