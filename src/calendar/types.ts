export type MemberCalendar = {
  user_id: string;
  initials: string;
  timezone: string;
  ics_url: string;
  show_location: boolean;
};

export type TimetableEventSource = "ics" | "activity";

export type TimetableEvent = {
  userId: string;
  initials: string;
  title: string;
  rawTitle: string;
  typeBadges: string[];
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  description?: string;
  source: TimetableEventSource;
  id?: string;
  createdBy?: string;
  participantIds?: string[];
};

export type MemberLoadResult = {
  userId: string;
  initials: string;
  events: TimetableEvent[];
  error?: string;
};

export type TimetableMember = {
  userId: string;
  initials: string;
  color: string;
  error?: string;
};

export type GuildTimetable = {
  events: TimetableEvent[];
  eventsByDay: Map<string, TimetableEvent[]>;
  eventsByUser: Map<string, TimetableEvent[]>;
  memberResults: MemberLoadResult[];
  members: TimetableMember[];
  guildTimezone: string;
  rangeStart: Date;
  rangeEnd: Date;
};
