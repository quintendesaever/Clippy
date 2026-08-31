import { dayKeyInTimezone } from "../../../shared/timetable/dates.js";

export const ANALYTICS_SOURCES = ["dashboard", "discord"] as const;
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];

export const ANALYTICS_EVENT_TYPES = [
  "activity.create",
  "activity.update",
  "activity.delete",
  "activity.join",
  "activity.leave",
  "calendar.save",
  "calendar.delete",
  "command.timetable",
  "command.ping",
  "command.f1-reminder",
  "command.stats",
  "command.backfill-stats",
  "timetable.day",
  "f1.stats",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

const ALLOWED_EVENT_TYPES = new Set<string>(ANALYTICS_EVENT_TYPES);

const METADATA_KEYS_BY_TYPE: Record<AnalyticsEventType, readonly string[]> = {
  "activity.create": ["activityId"],
  "activity.update": ["activityId"],
  "activity.delete": ["activityId"],
  "activity.join": ["activityId"],
  "activity.leave": ["activityId"],
  "calendar.save": ["hasIcs"],
  "calendar.delete": [],
  "command.timetable": ["command", "subcommand"],
  "command.ping": ["command", "subcommand"],
  "command.f1-reminder": ["command", "subcommand"],
  "command.stats": ["command", "subcommand"],
  "command.backfill-stats": ["command", "subcommand"],
  "timetable.day": ["dayKey"],
  "f1.stats": ["preview", "meetingKey"],
};

export type AnalyticsEventRow = {
  user_id: string | null;
  occurred_at: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
};

export type AnalyticsEventInput = {
  guildId: string;
  userId?: string | null;
  source: AnalyticsSource;
  eventType: string;
  metadata?: Record<string, unknown>;
};

export function isAllowedEventType(eventType: string): eventType is AnalyticsEventType {
  return ALLOWED_EVENT_TYPES.has(eventType);
}

function sanitizeMetadataValue(key: string, value: unknown): unknown {
  if (key === "activityId" || key === "command" || key === "subcommand" || key === "dayKey") {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 80) : undefined;
  }
  if (key === "hasIcs" || key === "preview") {
    return typeof value === "boolean" ? value : undefined;
  }
  if (key === "meetingKey") {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }
  return undefined;
}

export function sanitizeAnalyticsMetadata(
  eventType: string,
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!isAllowedEventType(eventType) || !metadata) return {};
  const allowed = METADATA_KEYS_BY_TYPE[eventType];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) continue;
    const value = sanitizeMetadataValue(key, metadata[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function aggregateAnalyticsEvents(rows: AnalyticsEventRow[], timezone: string) {
  const byType = new Map<string, number>();
  const byUser = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const row of rows) {
    increment(byType, row.event_type);
    if (row.user_id) increment(byUser, row.user_id);
    increment(byDay, dayKeyInTimezone(new Date(row.occurred_at), timezone));
  }

  const toBuckets = (map: Map<string, number>, limit?: number) => {
    const rowsOut = [...map.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    return limit == null ? rowsOut : rowsOut.slice(0, limit);
  };

  return {
    total: rows.length,
    byType: toBuckets(byType),
    overTime: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day, count })),
    topUsers: toBuckets(byUser, 10).map(({ key, count }) => ({ userId: key, count })),
    byDay,
  };
}

async function writeAnalyticsEvent(input: AnalyticsEventInput): Promise<void> {
  if (!isAllowedEventType(input.eventType)) {
    console.warn("analytics: skipped unknown event type:", input.eventType);
    return;
  }
  if (!ANALYTICS_SOURCES.includes(input.source)) {
    console.warn("analytics: skipped unknown source:", input.source);
    return;
  }

  const userId = input.userId?.trim() || null;
  const { upsertMember } = await import("../../stats/members.js");
  const { supabase } = await import("../../supabase.js");
  if (userId) {
    await upsertMember(input.guildId, userId);
  }

  const { error } = await supabase.from("analytics_events").insert({
    guild_id: input.guildId,
    user_id: userId,
    occurred_at: new Date().toISOString(),
    source: input.source,
    event_type: input.eventType,
    metadata: sanitizeAnalyticsMetadata(input.eventType, input.metadata),
  });
  if (error) {
    console.error("analytics: insert event:", error.message);
  }
}

/** Fire-and-forget. Failures are logged and never fail the user request. */
export function recordAnalyticsEvent(input: AnalyticsEventInput): void {
  void writeAnalyticsEvent(input).catch((err) => {
    console.error("analytics: record event:", err);
  });
}

export function recordDiscordAnalyticsEvent(options: {
  guildId: string | null | undefined;
  user: { id: string; bot: boolean };
  eventType: string;
  metadata?: Record<string, unknown>;
}): void {
  if (!options.guildId || options.user.bot) return;
  recordAnalyticsEvent({
    guildId: options.guildId,
    userId: options.user.id,
    source: "discord",
    eventType: options.eventType,
    metadata: options.metadata,
  });
}
