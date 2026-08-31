import type { Client } from "discord.js";
import { supabase } from "../supabase.js";
import { getGuildTimezone } from "../stats/helpers.js";
import { formatApproximateLocation } from "./analytics/geo.js";
import { loadMemberLabels } from "./memberLabels.js";
import {
  aggregateUserAndActivityStats,
  aggregateWebStats,
  aggregateCalendarCoverage,
  resolveRangeBounds,
  type ActivityStatRow,
  type AdminRangePreset,
  type AdminUserRow,
  type MemberStatRow,
  type PageViewRow,
  type ParticipantStatRow,
} from "./adminStatsAggregate.js";
import {
  aggregateAnalyticsEvents,
  type AnalyticsEventRow,
} from "./analytics/events.js";

export {
  ADMIN_RANGE_PRESETS,
  aggregateUserAndActivityStats,
  aggregateWebStats,
  aggregateCalendarCoverage,
  parseAdminRangePreset,
  resolveRangeBounds,
} from "./adminStatsAggregate.js";
export type {
  ActivityStatRow,
  AdminRangePreset,
  AdminUserRow,
  CountBucket,
  MemberStatRow,
  PageViewRow,
  ParticipantStatRow,
} from "./adminStatsAggregate.js";

export async function loadAdminStatsPayload(
  guildId: string,
  preset: AdminRangePreset,
  client: Client | null
) {
  const timezone = await getGuildTimezone(guildId);
  const now = new Date();
  const bounds = resolveRangeBounds(preset, timezone, now);

  let viewsQuery = supabase
    .from("dashboard_page_views")
    .select(
      "user_id, session_id, occurred_at, path, country, region, city, device_type, browser_family, referrer"
    )
    .eq("guild_id", guildId)
    .lte("occurred_at", bounds.to.toISOString())
    .order("occurred_at", { ascending: false });
  if (bounds.from) {
    viewsQuery = viewsQuery.gte("occurred_at", bounds.from.toISOString());
  }

  let eventsQuery = supabase
    .from("analytics_events")
    .select("user_id, occurred_at, event_type, metadata")
    .eq("guild_id", guildId)
    .eq("source", "dashboard")
    .lte("occurred_at", bounds.to.toISOString())
    .order("occurred_at", { ascending: false });
  if (bounds.from) {
    eventsQuery = eventsQuery.gte("occurred_at", bounds.from.toISOString());
  }

  const [viewsRes, membersRes, activitiesRes, participantsRes, calendarsRes, eventsRes] =
    await Promise.all([
    viewsQuery,
    supabase
      .from("members")
      .select(
        "user_id, share_location, last_country, last_region, last_city, last_dashboard_at, avatar_hash"
      )
      .eq("guild_id", guildId),
    supabase.from("timetable_activities").select("id, created_by, start_at").eq("guild_id", guildId),
    supabase
      .from("timetable_activity_participants")
      .select("activity_id, user_id")
      .eq("guild_id", guildId),
    supabase.from("member_calendars").select("user_id, initials, ics_url").eq("guild_id", guildId),
    eventsQuery,
  ]);

  if (viewsRes.error) throw new Error(viewsRes.error.message);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (activitiesRes.error) throw new Error(activitiesRes.error.message);
  if (participantsRes.error) throw new Error(participantsRes.error.message);
  if (calendarsRes.error) throw new Error(calendarsRes.error.message);
  if (eventsRes.error) throw new Error(eventsRes.error.message);

  const views = (viewsRes.data ?? []) as PageViewRow[];
  const members = (membersRes.data ?? []) as MemberStatRow[];
  const activities = (activitiesRes.data ?? []) as ActivityStatRow[];
  const participants = (participantsRes.data ?? []) as ParticipantStatRow[];
  const calendarRows = (calendarsRes.data ?? []) as {
    user_id: string;
    initials: string;
    ics_url: string | null;
  }[];
  const dashboardEvents = (eventsRes.data ?? []) as AnalyticsEventRow[];
  const calendarCoverage = aggregateCalendarCoverage(members.length, calendarRows);
  const dashboardActions = aggregateAnalyticsEvents(dashboardEvents, timezone);

  const web = aggregateWebStats(views, timezone, now, bounds.from, bounds.to);
  if (bounds.from) {
    const uniqueInRange = new Set(
      views.map((row) => row.user_id).filter((id): id is string => Boolean(id))
    );
    const { data: prior, error: priorError } = await supabase
      .from("dashboard_page_views")
      .select("user_id")
      .eq("guild_id", guildId)
      .not("user_id", "is", null)
      .lt("occurred_at", bounds.from.toISOString());
    if (priorError) throw new Error(priorError.message);
    const priorUsers = new Set((prior ?? []).map((row) => row.user_id as string));
    web.newDashboardUsers = [...uniqueInRange].filter((id) => !priorUsers.has(id)).length;
  }
  const userActivity = aggregateUserAndActivityStats(
    members,
    activities,
    participants,
    views,
    bounds.from,
    bounds.to,
    timezone
  );
  userActivity.users.newDashboardUsers = web.newDashboardUsers;

  const labels = await loadMemberLabels(
    client,
    guildId,
    members.map((m) => m.user_id)
  );
  const initialsByUser = new Map(
    calendarRows.map((row) => [row.user_id, row.initials])
  );

  const users: AdminUserRow[] = members.map((member) => {
    const label = labels.get(member.user_id);
    return {
      userId: member.user_id,
      displayName: label?.displayName ?? initialsByUser.get(member.user_id) ?? member.user_id,
      username: label?.username ?? null,
      initials: initialsByUser.get(member.user_id) ?? null,
      avatarHash: member.avatar_hash,
      activityCount: userActivity.activityCountByUser.get(member.user_id) ?? 0,
      lastActivityAt: userActivity.lastActivityAt.get(member.user_id) ?? null,
      lastDashboardAt: member.last_dashboard_at,
      shareLocation: member.share_location,
      lastDetectedLocation: formatApproximateLocation({
        country: member.last_country,
        region: member.last_region,
        city: member.last_city,
      }),
      lastCountry: member.last_country,
      lastRegion: member.last_region,
      lastCity: member.last_city,
    };
  });
  users.sort((a, b) => a.displayName.localeCompare(b.displayName, "nl"));

  return {
    range: preset,
    timezone,
    from: bounds.from?.toISOString() ?? null,
    to: bounds.to.toISOString(),
    users: userActivity.users,
    activities: userActivity.activities,
    web: {
      pageViews: web.pageViews,
      uniqueUsers: web.uniqueUsers,
      uniqueSessions: web.uniqueSessions,
      visitsToday: web.visitsToday,
      mostVisitedPages: web.mostVisitedPages,
      viewsOverTime: web.viewsOverTime,
      peakHours: web.peakHours,
      peakDays: web.peakDays,
      byCountry: web.byCountry,
      byRegion: web.byRegion,
      byCity: web.byCity,
      byDevice: web.byDevice,
      byBrowser: web.byBrowser,
      referrers: web.referrers,
      recentVisits: web.recentVisits.map((visit) => ({
        ...visit,
        displayName: visit.userId
          ? (labels.get(visit.userId)?.displayName ??
            initialsByUser.get(visit.userId) ??
            visit.userId)
          : null,
      })),
    },
    calendars: calendarCoverage,
    dashboardActions: {
      total: dashboardActions.total,
      byType: dashboardActions.byType,
      overTime: dashboardActions.overTime,
      topUsers: dashboardActions.topUsers.map((row) => ({
        userId: row.userId,
        displayName: labels.get(row.userId)?.displayName ?? initialsByUser.get(row.userId) ?? row.userId,
        count: row.count,
      })),
    },
    memberRows: users,
  };
}

export async function loadAdminUsersPayload(guildId: string, client: Client | null) {
  const payload = await loadAdminStatsPayload(guildId, "all", client);
  return { users: payload.memberRows, timezone: payload.timezone };
}
