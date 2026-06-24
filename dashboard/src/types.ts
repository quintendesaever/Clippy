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
