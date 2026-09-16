export const LIBRARY_PLAN_BUTTON_ID = "library:plan";
export const LIBRARY_CLEAR_BUTTON_ID = "library:clear";
export const LIBRARY_VISIT_MODAL_ID = "library:visit";
export const LIBRARY_START_FIELD = "start_time";
export const LIBRARY_END_FIELD = "end_time";

export const DEFAULT_OPEN_MINUTES = 480;
export const DEFAULT_CLOSE_MINUTES = 1320;

export type LibrarySettings = {
  guild_id: string;
  enabled: boolean;
  channel_id: string | null;
  open_minutes: number;
  close_minutes: number;
  message_id: string | null;
  schedule_day_key: string | null;
  last_cleanup_day_key: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LibraryVisit = {
  id: string;
  guild_id: string;
  user_id: string;
  day_key: string;
  start_at: string;
  end_at: string;
  created_at?: string;
  updated_at?: string;
};

export type LibraryVisitInput = {
  guild_id: string;
  user_id: string;
  day_key: string;
  start_at: string;
  end_at: string;
};

export type LibraryPublicSettings = {
  enabled: boolean;
  channelId: string | null;
  openMinutes: number;
  closeMinutes: number;
};

export type LibrarySettingsPatch = {
  enabled?: boolean;
  channelId?: string | null;
  openMinutes?: number;
  closeMinutes?: number;
};
