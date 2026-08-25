import type { Client } from "discord.js";
import { supabase } from "../supabase.js";
import { getGuildTimezone } from "../stats/helpers.js";
import { resolveRangeBounds, type AdminRangePreset } from "./adminStatsAggregate.js";
import {
  aggregateDiscordStats,
  type DiscordMessageRow,
  type DiscordVoiceRow,
} from "./discordStatsAggregate.js";
import { loadMemberLabels } from "./memberLabels.js";

const MESSAGE_PAGE_SIZE = 1000;
const MESSAGE_PAGE_CAP = 200;

type ChannelNameRow = { channel_id: string; name: string | null };
type MemberRow = { user_id: string; avatar_hash: string | null };
type CalendarRow = { user_id: string; initials: string | null };
type SnapshotRow = { recorded_at: string; member_count: number };

async function fetchPaginatedMessages(
  guildId: string,
  from: Date | null,
  to: Date
): Promise<DiscordMessageRow[]> {
  const rows: DiscordMessageRow[] = [];
  for (let page = 0; page < MESSAGE_PAGE_CAP; page += 1) {
    const start = page * MESSAGE_PAGE_SIZE;
    const end = start + MESSAGE_PAGE_SIZE - 1;
    let query = supabase
      .from("messages")
      .select("user_id, channel_id, created_at, attachment_count, word_count")
      .eq("guild_id", guildId)
      .is("deleted_at", null)
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: true })
      .range(start, end);
    if (from) {
      query = query.gte("created_at", from.toISOString());
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const pageRows = (data ?? []) as DiscordMessageRow[];
    rows.push(...pageRows);
    if (pageRows.length < MESSAGE_PAGE_SIZE) break;
  }
  return rows;
}

function resolveName(
  userId: string,
  labels: Map<string, { displayName: string; username: string }>,
  initialsByUser: Map<string, string>
): { displayName: string; username: string | null } {
  const label = labels.get(userId);
  return {
    displayName: label?.displayName ?? initialsByUser.get(userId) ?? userId,
    username: label?.username ?? null,
  };
}

export async function loadDiscordStatsPayload(
  guildId: string,
  preset: AdminRangePreset,
  client: Client | null
) {
  const timezone = await getGuildTimezone(guildId);
  const now = new Date();
  const bounds = resolveRangeBounds(preset, timezone, now);

  let messagesTotalQuery = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", guildId)
    .is("deleted_at", null);
  let voiceTotalQuery = supabase
    .from("voice_sessions")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", guildId);

  const [
    messages,
    messagesTotalRes,
    voiceRes,
    voiceTotalRes,
    channelsRes,
    membersRes,
    calendarsRes,
    snapshotRes,
  ] = await Promise.all([
    fetchPaginatedMessages(guildId, bounds.from, bounds.to),
    messagesTotalQuery,
    supabase
      .from("voice_sessions")
      .select("user_id, channel_id, joined_at, left_at")
      .eq("guild_id", guildId),
    voiceTotalQuery,
    supabase.from("channels").select("channel_id, name").eq("guild_id", guildId),
    supabase.from("members").select("user_id, avatar_hash").eq("guild_id", guildId),
    supabase.from("member_calendars").select("user_id, initials").eq("guild_id", guildId),
    supabase
      .from("member_count_snapshots")
      .select("recorded_at, member_count")
      .eq("guild_id", guildId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (messagesTotalRes.error) throw new Error(messagesTotalRes.error.message);
  if (voiceRes.error) throw new Error(voiceRes.error.message);
  if (voiceTotalRes.error) throw new Error(voiceTotalRes.error.message);
  if (channelsRes.error) throw new Error(channelsRes.error.message);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (calendarsRes.error) throw new Error(calendarsRes.error.message);
  if (snapshotRes.error) throw new Error(snapshotRes.error.message);

  const voiceSessions = (voiceRes.data ?? []) as DiscordVoiceRow[];
  const channels = (channelsRes.data ?? []) as ChannelNameRow[];
  const members = (membersRes.data ?? []) as MemberRow[];
  const snapshot = (snapshotRes.data ?? null) as SnapshotRow | null;
  const channelNameById = new Map(
    channels.map((row) => [row.channel_id, row.name?.trim() || "unknown"])
  );
  const initialsByUser = new Map(
    ((calendarsRes.data ?? []) as CalendarRow[])
      .filter((row) => Boolean(row.initials))
      .map((row) => [row.user_id, row.initials as string])
  );
  const avatarByUser = new Map(members.map((row) => [row.user_id, row.avatar_hash]));

  const aggregated = aggregateDiscordStats({
    messages,
    voiceSessions,
    messagesTotal: messagesTotalRes.count ?? messages.length,
    voiceSessionsTotal: voiceTotalRes.count ?? voiceSessions.length,
    timezone,
    preset,
    from: bounds.from,
    to: bounds.to,
    fromDayKey: bounds.fromDayKey,
    toDayKey: bounds.toDayKey,
    memberCount: snapshot?.member_count ?? members.length,
    memberCountRecordedAt: snapshot?.recorded_at ?? null,
  });

  const userIds = [
    ...new Set([
      ...aggregated.users.map((row) => row.userId),
      ...aggregated.recent.map((row) => row.userId),
      ...aggregated.topUsersByMessages.map((row) => row.key),
      ...aggregated.topUsersByVoiceSeconds.map((row) => row.key),
    ]),
  ];
  const labels = await loadMemberLabels(client, guildId, userIds);

  const labeledUsers = aggregated.users.map((row) => {
    const name = resolveName(row.userId, labels, initialsByUser);
    return {
      ...row,
      displayName: name.displayName,
      username: name.username,
      avatarHash: avatarByUser.get(row.userId) ?? null,
    };
  });
  labeledUsers.sort((a, b) => a.displayName.localeCompare(b.displayName, "nl"));

  const labelUser = (userId: string) => resolveName(userId, labels, initialsByUser).displayName;
  const labelChannel = (channelId: string) => channelNameById.get(channelId) ?? "unknown";

  return {
    range: aggregated.range,
    timezone: aggregated.timezone,
    from: aggregated.from,
    to: aggregated.to,
    summary: aggregated.summary,
    messagesOverTime: aggregated.messagesOverTime,
    voiceMinutesOverTime: aggregated.voiceMinutesOverTime,
    peakHours: aggregated.peakHours,
    topUsersByMessages: aggregated.topUsersByMessages.map((row) => ({
      userId: row.key,
      displayName: labelUser(row.key),
      count: row.count,
    })),
    topUsersByVoiceSeconds: aggregated.topUsersByVoiceSeconds.map((row) => ({
      userId: row.key,
      displayName: labelUser(row.key),
      seconds: row.count,
    })),
    topChannelsByMessages: aggregated.topChannelsByMessages.map((row) => ({
      channelId: row.key,
      name: labelChannel(row.key),
      count: row.count,
    })),
    topChannelsByVoiceSeconds: aggregated.topChannelsByVoiceSeconds.map((row) => ({
      channelId: row.key,
      name: labelChannel(row.key),
      seconds: row.count,
    })),
    users: labeledUsers,
    recent: aggregated.recent.map((row) => ({
      ...row,
      displayName: labelUser(row.userId),
      channelName: labelChannel(row.channelId),
    })),
  };
}
