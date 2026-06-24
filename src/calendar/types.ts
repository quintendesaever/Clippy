export type MemberCalendar = {
  user_id: string;
  initials: string;
  timezone: string;
  ics_url: string;
};

export type TimetableEvent = {
  initials: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
};

export type MemberLoadResult = {
  initials: string;
  events: TimetableEvent[];
  error?: string;
};

export type TimetableRange = "today" | "week";

export type GuildTimetable = {
  events: TimetableEvent[];
  eventsByDay: Map<string, TimetableEvent[]>;
  memberResults: MemberLoadResult[];
  guildTimezone: string;
  rangeStart: Date;
  rangeEnd: Date;
};
