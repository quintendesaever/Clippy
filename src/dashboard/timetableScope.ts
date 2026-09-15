export type TimetableScope = "shared" | "personal";

/** Shared timetable requires a connected ICS; personal does not. */
export function parseTimetableScope(raw: unknown): TimetableScope {
  return raw === "personal" ? "personal" : "shared";
}

export function sharedTimetableRequiresIcs(scope: TimetableScope): boolean {
  return scope === "shared";
}

type PersonalActivity = {
  createdBy?: string | null;
  participantIds?: string[] | null;
};

type PersonalMember = {
  userId: string;
};

/** Viewer-only slice for `scope=personal` responses (no guild-wide exposure). */
export function filterPersonalTimetablePayload<
  TEvent extends PersonalActivity,
  TMember extends PersonalMember,
>(
  viewerUserId: string,
  eventsByUser: Record<string, TEvent[]>,
  activities: TEvent[],
  members: TMember[]
): {
  events: TEvent[];
  eventsByUser: Record<string, TEvent[]>;
  activities: TEvent[];
  members: TMember[];
} {
  const personalActivities = activities.filter(
    (event) =>
      event.createdBy === viewerUserId ||
      (event.participantIds ?? []).includes(viewerUserId)
  );
  const ownEvents = eventsByUser[viewerUserId] ?? [];
  return {
    events: [...ownEvents, ...personalActivities],
    eventsByUser: { [viewerUserId]: ownEvents },
    activities: personalActivities,
    members: members.filter((member) => member.userId === viewerUserId),
  };
}
