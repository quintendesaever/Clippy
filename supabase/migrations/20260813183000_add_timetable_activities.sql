-- Shared one-off timetable activities (group events), separate from ICS lessons.

CREATE TABLE IF NOT EXISTS public.timetable_activities (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id    text        NOT NULL REFERENCES public.guilds (guild_id) ON DELETE CASCADE,
  created_by  text        NOT NULL,
  title       text        NOT NULL,
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  location    text,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timetable_activities_end_after_start CHECK (end_at > start_at),
  CONSTRAINT timetable_activities_title_not_blank CHECK (char_length(trim(title)) > 0),
  CONSTRAINT timetable_activities_guild_user_fkey
    FOREIGN KEY (guild_id, created_by)
    REFERENCES public.members (guild_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS timetable_activities_guild_range_idx
  ON public.timetable_activities (guild_id, start_at, end_at);

ALTER TABLE public.timetable_activities ENABLE ROW LEVEL SECURITY;
