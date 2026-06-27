export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

export interface MeResponse {
  user: DiscordUser;
}

export interface CalendarEntry {
  id: string;
  initials: string;
  timezone: string;
  ics_url: string | null;
  source_type: string;
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
  ics_url: string | null;
  avatar_hash: string | null;
}

export interface CalendarsResponse {
  calendars: CalendarMember[];
}

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
  description: string | null;
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
  members: TimetableMemberDto[];
  timezone: string;
}
