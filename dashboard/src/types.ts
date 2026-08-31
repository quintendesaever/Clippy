export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  nickname?: string;
}

export interface MeResponse {
  user: DiscordUser;
  show_type_prefix: boolean;
  share_location: boolean;
  is_admin: boolean;
}

export interface CalendarEntry {
  id: string;
  initials: string;
  timezone: string;
  ics_url: string | null;
  source_type: string;
  show_location: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalendarResponse {
  calendar: CalendarEntry | null;
}

export interface CalendarMember {
  user_id: string;
  initials: string;
  timezone: string;
  avatar_hash: string | null;
}

export interface CalendarsResponse {
  calendars: CalendarMember[];
}

export type TimetableEventSource = "ics" | "activity";

export interface TimetableEventDto {
  userId: string;
  initials: string;
  title: string;
  rawTitle: string;
  typeBadges: string[];
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  locationHidden?: boolean;
  memberLocation?: string | null;
  description: string | null;
  source: TimetableEventSource;
  id?: string;
  createdBy?: string;
  participantIds?: string[];
}

export interface ActivityInput {
  title: string;
  start: string;
  end: string;
  location?: string | null;
  description?: string | null;
}

export interface ActivityResponse {
  activity: TimetableEventDto;
}

export interface TimetableMemberDto {
  userId: string;
  initials: string;
  color: string;
  error: string | null;
}

export interface TimetableResponse {
  events: TimetableEventDto[];
  eventsByUser: Record<string, TimetableEventDto[]>;
  activities: TimetableEventDto[];
  members: TimetableMemberDto[];
  timezone: string;
}

export type AdminRangePreset = "today" | "7d" | "30d" | "all";

export interface AdminStatsResponse {
  range: AdminRangePreset;
  timezone: string;
  from: string | null;
  to: string;
  users: {
    total: number;
    active: number;
    newDashboardUsers: number;
    shareLocationEnabled: number;
    shareLocationDisabled: number;
    mostActive: { userId: string; activityCount: number; createdCount: number }[];
  };
  activities: {
    total: number;
    inRange: number;
    perDay: { day: string; count: number }[];
    byCreator: { userId: string; count: number }[];
    averagePerUser: number;
  };
  web: {
    pageViews: number;
    uniqueUsers: number;
    uniqueSessions: number;
    visitsToday: number;
    mostVisitedPages: { path: string; count: number }[];
    viewsOverTime: { day: string; count: number }[];
    peakHours: { hour: number; count: number }[];
    peakDays: { day: string; count: number }[];
    byCountry: { country: string; count: number }[];
    byRegion: { region: string; country: string | null; count: number }[];
    byCity: { city: string; region: string | null; country: string | null; count: number }[];
    byDevice: { deviceType: string; count: number }[];
    byBrowser: { browserFamily: string; count: number }[];
    referrers: { referrer: string; count: number }[];
    recentVisits: AdminRecentVisit[];
  };
  calendars: {
    withIcs: number;
    withoutIcs: number;
  };
  dashboardActions: {
    total: number;
    byType: { key: string; count: number }[];
    overTime: { day: string; count: number }[];
    topUsers: { userId: string; displayName: string; count: number }[];
    recent: AdminRecentAction[];
  };
  members: AdminUserRow[];
}

export interface AdminRecentAction {
  userId: string | null;
  displayName: string;
  occurredAt: string;
  eventType: string;
  detail: string | null;
}

export interface AdminRecentVisit {
  userId: string | null;
  displayName: string | null;
  occurredAt: string;
  path: string;
  country: string | null;
  region: string | null;
  city: string | null;
  locationLabel: string | null;
  deviceType: string | null;
  browserFamily: string | null;
}

export interface AdminUserRow {
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
}

export interface AdminUsersResponse {
  users: AdminUserRow[];
  timezone: string;
}

export interface DiscordAdminStatsResponse {
  range: AdminRangePreset;
  timezone: string;
  from: string | null;
  to: string;
  summary: {
    messagesInRange: number;
    messagesTotal: number;
    uniqueAuthors: number;
    attachmentsInRange: number;
    voiceSessionsInRange: number;
    voiceSessionsTotal: number;
    voiceSecondsClosed: number;
    voiceAverageSeconds: number;
    voiceOpenInRange: number;
    voiceUnreliableClosed: number;
    activeUsers: number;
    memberCount: number | null;
    memberCountRecordedAt: string | null;
    avgWordCount: number;
    replyCount: number;
    replyRate: number;
    deletedInRange: number;
    reactionsInRange: number;
  };
  messagesOverTime: { key: string; count: number }[];
  voiceMinutesOverTime: { key: string; count: number }[];
  peakHours: { hour: number; count: number }[];
  voicePeakHours: { hour: number; count: number }[];
  memberCountOverTime: { key: string; count: number }[];
  topEmojis: { key: string; count: number }[];
  topUsersByMessages: { userId: string; displayName: string; count: number }[];
  topUsersByVoiceSeconds: { userId: string; displayName: string; seconds: number }[];
  topChannelsByMessages: { channelId: string; name: string; count: number }[];
  topChannelsByVoiceSeconds: { channelId: string; name: string; seconds: number }[];
  botUsage: {
    total: number;
    commands: { key: string; count: number }[];
    actions: { key: string; count: number }[];
    timetableDayClicks: number;
    f1StatsClicks: number;
    overTime: { key: string; count: number }[];
    recent: AdminRecentAction[];
  };
  users: DiscordAdminUserRow[];
  recent: DiscordAdminRecentActivity[];
}

export interface DiscordAdminUserRow {
  userId: string;
  displayName: string;
  username: string | null;
  avatarHash: string | null;
  messageCount: number;
  voiceSessionCount: number;
  voiceSeconds: number;
  lastActivityAt: string | null;
}

export interface DiscordAdminRecentActivity {
  type: "message" | "voice";
  occurredAt: string;
  userId: string;
  displayName: string;
  channelId: string;
  channelName: string;
  durationSeconds: number | null;
  open: boolean;
}
