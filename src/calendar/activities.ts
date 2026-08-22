import { toZonedTime } from "date-fns-tz";
import { addCalendarDays, dayKeyInTimezone } from "../../shared/timetable/dates.js";
import { supabase } from "../supabase.js";
import { ensureGuild, getGuildTimezone } from "../stats/helpers.js";
import { upsertMember } from "../stats/members.js";
import type { TimetableEvent } from "./types.js";

const TITLE_MAX = 80;
const LOCATION_MAX = 120;
const DESCRIPTION_MAX = 500;
const MAX_DURATION_MS = 12 * 60 * 60 * 1000;

export type ActivityRow = {
  id: string;
  guild_id: string;
  created_by: string;
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityWriteInput = {
  title: string;
  start: Date;
  end: Date;
  location?: string | null;
  description?: string | null;
};

export class ActivityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityValidationError";
  }
}

function trimOrNull(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function validateActivityInput(
  input: ActivityWriteInput,
  guildTimezone: string
): {
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  description: string | null;
} {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    throw new ActivityValidationError("title is required");
  }
  if (title.length > TITLE_MAX) {
    throw new ActivityValidationError(`title must be at most ${TITLE_MAX} characters`);
  }

  const start = input.start;
  const end = input.end;
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    throw new ActivityValidationError("start must be a valid date");
  }
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
    throw new ActivityValidationError("end must be a valid date");
  }
  if (end.getTime() <= start.getTime()) {
    throw new ActivityValidationError("end must be after start");
  }
  if (end.getTime() - start.getTime() > MAX_DURATION_MS) {
    throw new ActivityValidationError("activity may be at most 12 hours");
  }

  const startDay = dayKeyInTimezone(start, guildTimezone);
  const endDay = dayKeyInTimezone(end, guildTimezone);
  const startZoned = toZonedTime(start, guildTimezone);
  const endZoned = toZonedTime(end, guildTimezone);
  const isMidnightEnd =
    endZoned.getHours() === 0 &&
    endZoned.getMinutes() === 0 &&
    end.getTime() > start.getTime();
  const sameDay = startDay === endDay;
  const endsNextMidnight = isMidnightEnd && endDay === addCalendarDays(startDay, 1);
  if (!sameDay && !endsNextMidnight) {
    throw new ActivityValidationError("activity must start and end on the same day");
  }
  if (
    startZoned.getHours() === 0 &&
    startZoned.getMinutes() === 0 &&
    endZoned.getHours() === 0 &&
    endZoned.getMinutes() === 0
  ) {
    throw new ActivityValidationError("all-day activities are not supported");
  }

  const location = trimOrNull(input.location, LOCATION_MAX);
  const description = trimOrNull(input.description, DESCRIPTION_MAX);

  return { title: title.slice(0, TITLE_MAX), start, end, location, description };
}

async function resolveMemberInitials(
  guildId: string,
  userIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from("member_calendars")
    .select("user_id, initials")
    .eq("guild_id", guildId)
    .in("user_id", unique);

  if (error) {
    console.error("activities: load member initials:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    if (row.initials?.trim()) {
      map.set(row.user_id, row.initials.trim());
    }
  }
  return map;
}

function activityToParticipantEvents(
  row: ActivityRow,
  participantIds: string[],
  initialsByUser: Map<string, string>
): TimetableEvent[] {
  const ids = participantIds.length > 0 ? participantIds : [row.created_by];
  // Creator first, then others in stable order.
  const ordered = [
    row.created_by,
    ...ids.filter((id) => id !== row.created_by),
  ];
  const uniqueOrdered = [...new Set(ordered)];

  return uniqueOrdered.map((userId) => ({
    id: row.id,
    userId,
    createdBy: row.created_by,
    initials: initialsByUser.get(userId) ?? "Lid",
    title: row.title,
    rawTitle: row.title,
    typeBadges: ["A"],
    start: new Date(row.start_at),
    end: new Date(row.end_at),
    allDay: false,
    location: row.location ?? undefined,
    description: row.description ?? undefined,
    source: "activity" as const,
    participantIds: uniqueOrdered,
  }));
}

async function loadParticipantsByActivity(
  guildId: string,
  activityIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (activityIds.length === 0) return map;

  const { data, error } = await supabase
    .from("timetable_activity_participants")
    .select("activity_id, user_id")
    .eq("guild_id", guildId)
    .in("activity_id", activityIds)
    .order("joined_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load activity participants: ${error.message}`);
  }

  for (const row of data ?? []) {
    const bucket = map.get(row.activity_id) ?? [];
    bucket.push(row.user_id);
    map.set(row.activity_id, bucket);
  }
  return map;
}

export async function getGuildActivitiesInRange(
  guildId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<TimetableEvent[]> {
  const { data, error } = await supabase
    .from("timetable_activities")
    .select("id, guild_id, created_by, title, start_at, end_at, location, description, created_at, updated_at")
    .eq("guild_id", guildId)
    .lt("start_at", rangeEnd.toISOString())
    .gt("end_at", rangeStart.toISOString())
    .order("start_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load activities: ${error.message}`);
  }

  const rows = (data ?? []) as ActivityRow[];
  const participantsByActivity = await loadParticipantsByActivity(
    guildId,
    rows.map((row) => row.id)
  );

  const allUserIds = new Set<string>();
  for (const row of rows) {
    allUserIds.add(row.created_by);
    for (const userId of participantsByActivity.get(row.id) ?? [row.created_by]) {
      allUserIds.add(userId);
    }
  }
  const initialsByUser = await resolveMemberInitials(guildId, [...allUserIds]);

  return rows.flatMap((row) =>
    activityToParticipantEvents(
      row,
      participantsByActivity.get(row.id) ?? [row.created_by],
      initialsByUser
    )
  );
}

export async function createActivity(params: {
  guildId: string;
  userId: string;
  avatarHash?: string | null;
  input: ActivityWriteInput;
}): Promise<TimetableEvent> {
  const { guildId, userId, avatarHash, input } = params;
  await ensureGuild(guildId);
  await upsertMember(guildId, userId, avatarHash);

  const guildTimezone = await getGuildTimezone(guildId);
  const validated = validateActivityInput(input, guildTimezone);

  const { data, error } = await supabase
    .from("timetable_activities")
    .insert({
      guild_id: guildId,
      created_by: userId,
      title: validated.title,
      start_at: validated.start.toISOString(),
      end_at: validated.end.toISOString(),
      location: validated.location,
      description: validated.description,
      updated_at: new Date().toISOString(),
    })
    .select("id, guild_id, created_by, title, start_at, end_at, location, description, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(`Failed to create activity: ${error.message}`);
  }

  const row = data as ActivityRow;
  const { error: participantError } = await supabase
    .from("timetable_activity_participants")
    .insert({
      activity_id: row.id,
      user_id: userId,
      guild_id: guildId,
    });

  if (participantError) {
    const { error: cleanupError } = await supabase
      .from("timetable_activities")
      .delete()
      .eq("id", row.id)
      .eq("guild_id", guildId);
    if (cleanupError) {
      console.error("createActivity: failed to roll back activity after participant error", cleanupError);
    }
    throw new Error(`Failed to add activity creator: ${participantError.message}`);
  }

  const initialsByUser = await resolveMemberInitials(guildId, [userId]);
  return activityToParticipantEvents(row, [userId], initialsByUser)[0];
}

export async function updateActivity(params: {
  guildId: string;
  userId: string;
  activityId: string;
  input: ActivityWriteInput;
}): Promise<TimetableEvent | null> {
  const { guildId, userId, activityId, input } = params;
  const guildTimezone = await getGuildTimezone(guildId);
  const validated = validateActivityInput(input, guildTimezone);

  const { data, error } = await supabase
    .from("timetable_activities")
    .update({
      title: validated.title,
      start_at: validated.start.toISOString(),
      end_at: validated.end.toISOString(),
      location: validated.location,
      description: validated.description,
      updated_at: new Date().toISOString(),
    })
    .eq("id", activityId)
    .eq("guild_id", guildId)
    .eq("created_by", userId)
    .select("id, guild_id, created_by, title, start_at, end_at, location, description, created_at, updated_at")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update activity: ${error.message}`);
  }
  if (!data) return null;

  const row = data as ActivityRow;
  const participantsByActivity = await loadParticipantsByActivity(guildId, [row.id]);
  const participantIds = participantsByActivity.get(row.id) ?? [row.created_by];
  const initialsByUser = await resolveMemberInitials(guildId, participantIds);
  return activityToParticipantEvents(row, participantIds, initialsByUser)[0];
}

export async function deleteActivity(params: {
  guildId: string;
  userId: string;
  activityId: string;
}): Promise<boolean> {
  const { guildId, userId, activityId } = params;
  const { data, error } = await supabase
    .from("timetable_activities")
    .delete()
    .eq("id", activityId)
    .eq("guild_id", guildId)
    .eq("created_by", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete activity: ${error.message}`);
  }
  return Boolean(data);
}

export async function joinActivity(params: {
  guildId: string;
  userId: string;
  activityId: string;
  avatarHash?: string | null;
}): Promise<boolean> {
  const { guildId, userId, activityId, avatarHash } = params;
  await ensureGuild(guildId);
  await upsertMember(guildId, userId, avatarHash);

  const { data: activity, error: loadError } = await supabase
    .from("timetable_activities")
    .select("id")
    .eq("id", activityId)
    .eq("guild_id", guildId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load activity: ${loadError.message}`);
  }
  if (!activity) return false;

  const { error } = await supabase.from("timetable_activity_participants").upsert(
    {
      activity_id: activityId,
      user_id: userId,
      guild_id: guildId,
    },
    { onConflict: "activity_id,user_id", ignoreDuplicates: true }
  );

  if (error) {
    throw new Error(`Failed to join activity: ${error.message}`);
  }
  return true;
}

export async function leaveActivity(params: {
  guildId: string;
  userId: string;
  activityId: string;
}): Promise<"ok" | "not_found" | "creator"> {
  const { guildId, userId, activityId } = params;

  const { data: activity, error: loadError } = await supabase
    .from("timetable_activities")
    .select("id, created_by")
    .eq("id", activityId)
    .eq("guild_id", guildId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load activity: ${loadError.message}`);
  }
  if (!activity) return "not_found";
  if (activity.created_by === userId) {
    throw new ActivityValidationError("De organisator kan zich niet afmelden");
  }

  const { data, error } = await supabase
    .from("timetable_activity_participants")
    .delete()
    .eq("activity_id", activityId)
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to leave activity: ${error.message}`);
  }
  return data ? "ok" : "not_found";
}
