import { toZonedTime } from "date-fns-tz";
import { addCalendarDays, dayKeyInTimezone } from "../../shared/timetable/dates.js";
import type { AdminRangePreset } from "./adminStatsAggregate.js";

export const DISCORD_RECENT_LIMIT = 30;
export const DISCORD_TOP_LIMIT = 10;
/** Closed sessions longer than this are treated as crash leftovers, not real talk time. */
export const MAX_RELIABLE_VOICE_SECONDS = 24 * 60 * 60;

export type DiscordMessageRow = {
  user_id: string;
  channel_id: string;
  created_at: string;
  attachment_count: number;
  word_count: number;
  char_count?: number;
  reply_to_message_id?: string | null;
  reactions?: { emoji_name: string; count: number }[];
};

export type DiscordVoiceRow = {
  user_id: string;
  channel_id: string;
  joined_at: string;
  left_at: string | null;
};

export type DiscordCountBucket = { key: string; count: number };

export type DiscordSnapshotRow = {
  recorded_at: string;
  member_count: number;
};

export type DiscordAnalyticsEventRow = {
  user_id: string | null;
  occurred_at: string;
  event_type: string;
  metadata?: Record<string, unknown> | null;
};

export type DiscordUserStat = {
  userId: string;
  messageCount: number;
  voiceSessionCount: number;
  voiceSeconds: number;
  lastActivityAt: string | null;
};

export type DiscordRecentActivity = {
  type: "message" | "voice";
  occurredAt: string;
  userId: string;
  channelId: string;
  durationSeconds: number | null;
  open: boolean;
};

function inRange(iso: string, from: Date | null, to: Date): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (t > to.getTime()) return false;
  if (from && t < from.getTime()) return false;
  return true;
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function maxIso(current: string | null, next: string): string {
  if (!current || next > current) return next;
  return current;
}

function sessionDurationSeconds(row: DiscordVoiceRow): number | null {
  if (!row.left_at) return null;
  const start = new Date(row.joined_at).getTime();
  const end = new Date(row.left_at).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.floor((end - start) / 1000);
}

function reliableVoiceSeconds(row: DiscordVoiceRow): number {
  const duration = sessionDurationSeconds(row);
  if (duration == null || duration > MAX_RELIABLE_VOICE_SECONDS) return 0;
  return duration;
}

function bucketKey(iso: string, timezone: string, preset: AdminRangePreset): string {
  const day = dayKeyInTimezone(new Date(iso), timezone);
  return preset === "all" ? day.slice(0, 7) : day;
}

function eachDayKey(fromDayKey: string, toDayKey: string): string[] {
  const keys: string[] = [];
  let current = fromDayKey;
  while (current <= toDayKey) {
    keys.push(current);
    current = addCalendarDays(current, 1);
  }
  return keys;
}

function eachMonthKey(fromMonth: string, toMonth: string): string[] {
  const keys: string[] = [];
  let [year, month] = fromMonth.split("-").map(Number);
  const [toYear, toMonthNum] = toMonth.split("-").map(Number);
  while (year < toYear || (year === toYear && month <= toMonthNum)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

function fillSeries(
  counts: Map<string, number>,
  preset: AdminRangePreset,
  fromDayKey: string | null,
  toDayKey: string,
  eventKeys: string[]
): DiscordCountBucket[] {
  if (preset === "all") {
    if (eventKeys.length === 0) return [];
    const sorted = [...eventKeys].sort();
    const keys = eachMonthKey(sorted[0]!, toDayKey.slice(0, 7));
    const rows = keys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
    if (rows.every((row) => row.count === 0)) return [];
    return rows;
  }
  if (!fromDayKey) return [];
  const rows = eachDayKey(fromDayKey, toDayKey).map((key) => ({
    key,
    count: counts.get(key) ?? 0,
  }));
  if (rows.every((row) => row.count === 0)) return [];
  return rows;
}

function topEntries(map: Map<string, number>, limit = DISCORD_TOP_LIMIT): DiscordCountBucket[] {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export function aggregateDiscordStats(options: {
  messages: DiscordMessageRow[];
  voiceSessions: DiscordVoiceRow[];
  messagesTotal: number;
  voiceSessionsTotal: number;
  timezone: string;
  preset: AdminRangePreset;
  from: Date | null;
  to: Date;
  fromDayKey: string | null;
  toDayKey: string;
  memberCount: number | null;
  memberCountRecordedAt: string | null;
  deletedInRange?: number;
  snapshots?: DiscordSnapshotRow[];
  events?: DiscordAnalyticsEventRow[];
}) {
  const {
    timezone,
    preset,
    from,
    to,
    fromDayKey,
    toDayKey,
    messagesTotal,
    voiceSessionsTotal,
    memberCount,
    memberCountRecordedAt,
  } = options;
  const deletedInRange = options.deletedInRange ?? 0;
  const snapshots = options.snapshots ?? [];
  const events = options.events ?? [];

  const messages = options.messages.filter((row) => inRange(row.created_at, from, to));
  const voiceSessions = options.voiceSessions.filter((row) => inRange(row.joined_at, from, to));

  const uniqueAuthors = new Set<string>();
  const messagesByDay = new Map<string, number>();
  const messagesByHour = new Map<string, number>();
  const messagesByUser = new Map<string, number>();
  const messagesByChannel = new Map<string, number>();
  const emojiCounts = new Map<string, number>();
  let attachmentsInRange = 0;
  let wordCountTotal = 0;
  let replyCount = 0;
  let reactionsInRange = 0;

  for (const row of messages) {
    uniqueAuthors.add(row.user_id);
    increment(messagesByDay, bucketKey(row.created_at, timezone, preset));
    increment(messagesByHour, String(toZonedTime(new Date(row.created_at), timezone).getHours()));
    increment(messagesByUser, row.user_id);
    increment(messagesByChannel, row.channel_id);
    attachmentsInRange += Number(row.attachment_count) || 0;
    wordCountTotal += Number(row.word_count) || 0;
    if (row.reply_to_message_id) replyCount += 1;
    for (const reaction of row.reactions ?? []) {
      const amount = Number(reaction.count) || 0;
      if (amount <= 0) continue;
      reactionsInRange += amount;
      increment(emojiCounts, reaction.emoji_name || "unknown", amount);
    }
  }

  const voiceByDay = new Map<string, number>();
  const voiceByHour = new Map<string, number>();
  const voiceSecondsByUser = new Map<string, number>();
  const voiceSessionsByUser = new Map<string, number>();
  const voiceSecondsByChannel = new Map<string, number>();
  let voiceSecondsClosed = 0;
  let closedReliableCount = 0;
  let voiceOpenInRange = 0;
  let voiceUnreliableClosed = 0;

  for (const row of voiceSessions) {
    increment(voiceSessionsByUser, row.user_id);
    increment(voiceByHour, String(toZonedTime(new Date(row.joined_at), timezone).getHours()));
    if (!row.left_at) {
      voiceOpenInRange += 1;
      continue;
    }
    const duration = sessionDurationSeconds(row);
    if (duration == null) continue;
    if (duration > MAX_RELIABLE_VOICE_SECONDS) {
      voiceUnreliableClosed += 1;
      continue;
    }
    closedReliableCount += 1;
    voiceSecondsClosed += duration;
    increment(voiceSecondsByUser, row.user_id, duration);
    increment(voiceSecondsByChannel, row.channel_id, duration);
    increment(voiceByDay, bucketKey(row.joined_at, timezone, preset), duration);
  }

  const userStats = new Map<string, DiscordUserStat>();
  const touchUser = (userId: string) => {
    let row = userStats.get(userId);
    if (!row) {
      row = {
        userId,
        messageCount: 0,
        voiceSessionCount: 0,
        voiceSeconds: 0,
        lastActivityAt: null,
      };
      userStats.set(userId, row);
    }
    return row;
  };

  for (const row of messages) {
    const user = touchUser(row.user_id);
    user.messageCount += 1;
    user.lastActivityAt = maxIso(user.lastActivityAt, row.created_at);
  }
  for (const row of voiceSessions) {
    const user = touchUser(row.user_id);
    user.voiceSessionCount += 1;
    user.voiceSeconds += reliableVoiceSeconds(row);
    user.lastActivityAt = maxIso(user.lastActivityAt, row.left_at ?? row.joined_at);
  }

  const users = [...userStats.values()].sort(
    (a, b) =>
      b.messageCount - a.messageCount ||
      b.voiceSeconds - a.voiceSeconds ||
      a.userId.localeCompare(b.userId)
  );

  const recentMessages: DiscordRecentActivity[] = messages.map((row) => ({
    type: "message" as const,
    occurredAt: row.created_at,
    userId: row.user_id,
    channelId: row.channel_id,
    durationSeconds: null,
    open: false,
  }));
  const recentVoice: DiscordRecentActivity[] = options.voiceSessions
    .map((row) => {
      const occurredAt = row.left_at ?? row.joined_at;
      const duration = sessionDurationSeconds(row);
      return {
        type: "voice" as const,
        occurredAt,
        userId: row.user_id,
        channelId: row.channel_id,
        durationSeconds:
          duration != null && duration <= MAX_RELIABLE_VOICE_SECONDS ? duration : null,
        open: !row.left_at,
      };
    })
    .filter((row) => inRange(row.occurredAt, from, to));

  const recent = [...recentMessages, ...recentVoice]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.userId.localeCompare(b.userId))
    .slice(0, DISCORD_RECENT_LIMIT);

  const peakHours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: messagesByHour.get(String(hour)) ?? 0,
  }));
  const voicePeakHours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: voiceByHour.get(String(hour)) ?? 0,
  }));

  const snapshotByBucket = new Map<string, number>();
  for (const row of snapshots) {
    if (!inRange(row.recorded_at, from, to)) continue;
    const key = bucketKey(row.recorded_at, timezone, preset);
    snapshotByBucket.set(key, row.member_count);
  }
  const memberCountOverTime = [...snapshotByBucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, count }));

  const eventsInRange = events.filter((row) => inRange(row.occurred_at, from, to));
  const eventsByDay = new Map<string, number>();
  const commandCounts = new Map<string, number>();
  let timetableDayClicks = 0;
  let f1StatsClicks = 0;
  for (const row of eventsInRange) {
    increment(eventsByDay, bucketKey(row.occurred_at, timezone, preset));
    if (row.event_type.startsWith("command.")) {
      increment(commandCounts, row.event_type.slice("command.".length) || row.event_type);
    } else if (row.event_type === "timetable.day") {
      timetableDayClicks += 1;
    } else if (row.event_type === "f1.stats") {
      f1StatsClicks += 1;
    }
  }

  return {
    range: preset,
    timezone,
    from: from?.toISOString() ?? null,
    to: to.toISOString(),
    summary: {
      messagesInRange: messages.length,
      messagesTotal,
      uniqueAuthors: uniqueAuthors.size,
      attachmentsInRange,
      voiceSessionsInRange: voiceSessions.length,
      voiceSessionsTotal,
      voiceSecondsClosed,
      voiceAverageSeconds:
        closedReliableCount > 0 ? Math.round(voiceSecondsClosed / closedReliableCount) : 0,
      voiceOpenInRange,
      voiceUnreliableClosed,
      activeUsers: users.length,
      memberCount,
      memberCountRecordedAt,
      avgWordCount:
        messages.length > 0 ? Math.round((wordCountTotal / messages.length) * 10) / 10 : 0,
      replyCount,
      replyRate: messages.length > 0 ? Math.round((replyCount / messages.length) * 1000) / 1000 : 0,
      deletedInRange,
      reactionsInRange,
    },
    messagesOverTime: fillSeries(
      messagesByDay,
      preset,
      fromDayKey,
      toDayKey,
      [...messagesByDay.keys()]
    ),
    voiceMinutesOverTime: fillSeries(voiceByDay, preset, fromDayKey, toDayKey, [...voiceByDay.keys()]).map(
      (row) => ({ key: row.key, count: Math.round(row.count / 60) })
    ),
    peakHours,
    voicePeakHours,
    memberCountOverTime,
    topEmojis: topEntries(emojiCounts),
    topUsersByMessages: topEntries(messagesByUser),
    topUsersByVoiceSeconds: topEntries(voiceSecondsByUser),
    topChannelsByMessages: topEntries(messagesByChannel),
    topChannelsByVoiceSeconds: topEntries(voiceSecondsByChannel),
    botUsage: {
      total: eventsInRange.length,
      commands: topEntries(commandCounts),
      timetableDayClicks,
      f1StatsClicks,
      overTime: fillSeries(eventsByDay, preset, fromDayKey, toDayKey, [...eventsByDay.keys()]),
    },
    users,
    recent,
  };
}
