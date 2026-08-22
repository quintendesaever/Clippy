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
