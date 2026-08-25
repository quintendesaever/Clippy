import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { addCalendarDays, dayKeyInTimezone } from "../../shared/timetable/dates.js";
import { formatApproximateLocation } from "./analytics/geo.js";

export const ADMIN_RANGE_PRESETS = ["today", "7d", "30d", "all"] as const;
export type AdminRangePreset = (typeof ADMIN_RANGE_PRESETS)[number];

export function parseAdminRangePreset(raw: unknown): AdminRangePreset {
  if (typeof raw === "string" && (ADMIN_RANGE_PRESETS as readonly string[]).includes(raw)) {
    return raw as AdminRangePreset;
  }
  return "7d";
}

export type PageViewRow = {
  user_id: string | null;
  session_id: string;
  occurred_at: string;
  path: string;
  country: string | null;
  region: string | null;
  city: string | null;
  device_type: string | null;
  browser_family: string | null;
};

export type ActivityStatRow = {
  id: string;
  created_by: string;
  start_at: string;
};

export type ParticipantStatRow = {
  activity_id: string;
  user_id: string;
};

export type MemberStatRow = {
  user_id: string;
  share_location: boolean;
  last_country: string | null;
  last_region: string | null;
  last_city: string | null;
  last_dashboard_at: string | null;
  avatar_hash: string | null;
};

export type CountBucket = { key: string; count: number };

function startOfZonedDay(dayKey: string, timezone: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return fromZonedTime(new Date(y, m - 1, d, 0, 0, 0, 0), timezone);
}

export function resolveRangeBounds(
  preset: AdminRangePreset,
  timezone: string,
  now = new Date()
): { from: Date | null; to: Date; fromDayKey: string | null; toDayKey: string } {
  const todayKey = dayKeyInTimezone(now, timezone);
  const to = now;
  if (preset === "all") {
    return { from: null, to, fromDayKey: null, toDayKey: todayKey };
  }
  const daysBack = preset === "today" ? 0 : preset === "7d" ? 6 : 29;
  const fromDayKey = addCalendarDays(todayKey, -daysBack);
  return {
    from: startOfZonedDay(fromDayKey, timezone),
    to,
    fromDayKey,
    toDayKey: todayKey,
  };
}

function inRange(iso: string, from: Date | null, to: Date): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (t > to.getTime()) return false;
  if (from && t < from.getTime()) return false;
  return true;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topEntries(map: Map<string, number>, limit?: number): CountBucket[] {
  const rows = [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return limit == null ? rows : rows.slice(0, limit);
}

export function aggregateWebStats(
  views: PageViewRow[],
  timezone: string,
  now: Date,
  from: Date | null,
  to: Date
) {
  const todayKey = dayKeyInTimezone(now, timezone);
  const todayStart = startOfZonedDay(todayKey, timezone);

  const uniqueUsers = new Set<string>();
  const uniqueSessions = new Set<string>();
  const paths = new Map<string, number>();
  const byDay = new Map<string, number>();
  const byHour = new Map<string, number>();
  const byWeekday = new Map<string, number>();
  const byCountry = new Map<string, number>();
  const byRegion = new Map<string, number>();
  const byCity = new Map<string, number>();
  const byDevice = new Map<string, number>();
  const byBrowser = new Map<string, number>();
  const firstViewByUser = new Map<string, string>();
  let visitsToday = 0;

  const weekdayKeys = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];

  for (const view of views) {
    if (view.user_id) uniqueUsers.add(view.user_id);
    uniqueSessions.add(view.session_id);
    increment(paths, view.path);

    const occurred = new Date(view.occurred_at);
    const zoned = toZonedTime(occurred, timezone);
    const dayKey = dayKeyInTimezone(occurred, timezone);
    increment(byDay, dayKey);
    increment(byHour, String(zoned.getHours()));
    increment(byWeekday, weekdayKeys[zoned.getDay()] ?? String(zoned.getDay()));

    if (occurred.getTime() >= todayStart.getTime() && occurred.getTime() <= to.getTime()) {
      visitsToday += 1;
    }

    if (view.country) increment(byCountry, view.country);
    if (view.region) increment(byRegion, `${view.region}||${view.country ?? ""}`);
    if (view.city) increment(byCity, `${view.city}||${view.region ?? ""}||${view.country ?? ""}`);
    if (view.device_type) increment(byDevice, view.device_type);
    if (view.browser_family) increment(byBrowser, view.browser_family);

    if (view.user_id) {
      const prev = firstViewByUser.get(view.user_id);
      if (!prev || view.occurred_at < prev) firstViewByUser.set(view.user_id, view.occurred_at);
    }
  }

  const peakHours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: byHour.get(String(hour)) ?? 0,
  }));

  const newDashboardUsers = [...firstViewByUser.entries()].filter(([, firstAt]) =>
    inRange(firstAt, from, to)
  ).length;

  const recentVisits = [...views]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, 50)
    .map((view) => ({
      userId: view.user_id,
      occurredAt: view.occurred_at,
      path: view.path,
      country: view.country,
      region: view.region,
      city: view.city,
      locationLabel: formatApproximateLocation({
        country: view.country,
        region: view.region,
        city: view.city,
      }),
      deviceType: view.device_type,
      browserFamily: view.browser_family,
    }));

  return {
    pageViews: views.length,
    uniqueUsers: uniqueUsers.size,
    uniqueSessions: uniqueSessions.size,
    visitsToday,
    newDashboardUsers,
    mostVisitedPages: topEntries(paths).map(({ key, count }) => ({ path: key, count })),
    viewsOverTime: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day, count })),
    peakHours,
    peakDays: ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((day) => ({
      day,
      count: byWeekday.get(day) ?? 0,
    })),
    byCountry: topEntries(byCountry).map(({ key, count }) => ({ country: key, count })),
    byRegion: topEntries(byRegion).map(({ key, count }) => {
      const [region, country] = key.split("||");
      return { region, country: country || null, count };
    }),
    byCity: topEntries(byCity).map(({ key, count }) => {
      const [city, region, country] = key.split("||");
      return { city, region: region || null, country: country || null, count };
    }),
    byDevice: topEntries(byDevice).map(({ key, count }) => ({ deviceType: key, count })),
    byBrowser: topEntries(byBrowser).map(({ key, count }) => ({ browserFamily: key, count })),
    recentVisits,
  };
}

export function aggregateUserAndActivityStats(
  members: MemberStatRow[],
  activities: ActivityStatRow[],
  participants: ParticipantStatRow[],
  views: PageViewRow[],
  from: Date | null,
  to: Date,
  timezone: string
) {
  const activitiesInRange = activities.filter((row) => inRange(row.start_at, from, to));
  const activityIdsInRange = new Set(activitiesInRange.map((row) => row.id));

  const createdCount = new Map<string, number>();
  const createdInRange = new Map<string, number>();
  for (const row of activities) {
    increment(createdCount, row.created_by);
    if (activityIdsInRange.has(row.id)) increment(createdInRange, row.created_by);
  }

  const joinedCount = new Map<string, number>();
  const lastActivityAt = new Map<string, string>();
  const activityById = new Map(activities.map((row) => [row.id, row]));
  for (const row of participants) {
    increment(joinedCount, row.user_id);
    const activity = activityById.get(row.activity_id);
    if (activity && (!lastActivityAt.has(row.user_id) || activity.start_at > lastActivityAt.get(row.user_id)!)) {
      lastActivityAt.set(row.user_id, activity.start_at);
    }
  }

  const activeUserIds = new Set<string>();
  for (const row of activitiesInRange) activeUserIds.add(row.created_by);
  for (const row of participants) {
    if (activityIdsInRange.has(row.activity_id)) activeUserIds.add(row.user_id);
  }
  for (const view of views) {
    if (view.user_id) activeUserIds.add(view.user_id);
  }

  const shareEnabled = members.filter((m) => m.share_location).length;

  const mostActive = [...joinedCount.entries()]
    .map(([userId, activityCount]) => ({
      userId,
      activityCount,
      createdCount: createdCount.get(userId) ?? 0,
    }))
    .sort((a, b) => b.activityCount - a.activityCount || a.userId.localeCompare(b.userId))
    .slice(0, 10);

  const perDay = new Map<string, number>();
  for (const row of activitiesInRange) {
    increment(perDay, dayKeyInTimezone(new Date(row.start_at), timezone));
  }

  const memberCount = members.length || 1;

  return {
    users: {
      total: members.length,
      active: activeUserIds.size,
      newDashboardUsers: 0,
      shareLocationEnabled: shareEnabled,
      shareLocationDisabled: members.length - shareEnabled,
      mostActive,
    },
    activities: {
      total: activities.length,
      inRange: activitiesInRange.length,
      perDay: [...perDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, count]) => ({ day, count })),
      byCreator: topEntries(createdInRange, 10).map(({ key, count }) => ({
        userId: key,
        count,
      })),
      averagePerUser: Math.round((activities.length / memberCount) * 10) / 10,
    },
    activityCountByUser: joinedCount,
    lastActivityAt,
  };
}

export type AdminUserRow = {
  userId: string;
  displayName: string;
  username: string | null;
  initials: string | null;
  avatarHash: string | null;
  activityCount: number;
  lastActivityAt: string | null;
  lastDashboardAt: string | null;
  shareLocation: boolean;
  lastDetectedLocation: string | null;
  lastCountry: string | null;
  lastRegion: string | null;
  lastCity: string | null;
};
