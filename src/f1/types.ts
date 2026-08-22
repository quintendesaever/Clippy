export type F1SessionKind = "qualifying" | "race" | "sprint";

export type F1Session = {
  sessionKey: number;
  kind: F1SessionKind;
  name: string;
  dateStart: Date;
  dateEnd: Date | null;
  cancelled: boolean;
};

export type F1Meeting = {
  id: string;
  meetingKey: number;
  season: number;
  name: string;
  circuitName: string;
  locality: string;
  country: string;
  countryCode: string | null;
  qualifying: F1Session | null;
  race: F1Session | null;
  sprint: F1Session | null;
};

export type F1ReminderStage =
  | "predictions_open"
  | "final_prediction"
  | "race_soon"
  | "results";

export type F1StageSchedule = {
  meetingId: string;
  meetingKey: number;
  meetingName: string;
  predictionDeadline: Date | null;
  predictionsOpenAt: Date | null;
  finalPredictionAt: Date | null;
  raceSoonAt: Date | null;
  raceStart: Date | null;
  raceEnd: Date | null;
  resultsCheckAt: Date | null;
  resultsGiveUpAt: Date | null;
  missingQualifying: boolean;
  missingRace: boolean;
};

export type F1DriverRef = {
  driverNumber: number | null;
  name: string;
  team: string | null;
};

export type F1ResultStatus = "classified" | "dnf" | "dns" | "dsq" | "other";

export type F1ResultRow = F1DriverRef & {
  position: number | null;
  grid: number | null;
  status: F1ResultStatus;
  statusText: string | null;
  points: number | null;
};

export type F1FastestLap = F1DriverRef & {
  timeLabel: string;
  lapNumber: number | null;
};

export type F1PositionSwing = {
  driver: string;
  grid: number;
  finish: number;
  places: number;
};

export type F1StandingsRow = {
  position: number;
  name: string;
  team: string | null;
  points: number;
};

export type F1PitSummary = {
  driver: string;
  stops: number;
};

export type F1RaceResults = {
  meetingId: string;
  meetingKey: number;
  meetingName: string;
  classification: F1ResultRow[];
  fastestLap: F1FastestLap | null;
  biggestGain: F1PositionSwing | null;
  biggestLoss: F1PositionSwing | null;
  dnfs: F1ResultRow[];
  driverStandings: F1StandingsRow[];
  constructorStandings: F1StandingsRow[];
  pitStops: F1PitSummary[];
};
