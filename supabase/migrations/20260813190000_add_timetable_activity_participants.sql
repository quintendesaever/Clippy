-- Participants who joined a shared timetable activity (creator is always included).

CREATE TABLE IF NOT EXISTS public.timetable_activity_participants (
  activity_id uuid        NOT NULL REFERENCES public.timetable_activities (id) ON DELETE CASCADE,
  user_id     text        NOT NULL,
  guild_id    text        NOT NULL,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id),
  CONSTRAINT timetable_activity_participants_guild_user_fkey
    FOREIGN KEY (guild_id, user_id)
    REFERENCES public.members (guild_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS timetable_activity_participants_user_idx
  ON public.timetable_activity_participants (guild_id, user_id);

ALTER TABLE public.timetable_activity_participants ENABLE ROW LEVEL SECURITY;

-- Backfill creators as participants for any existing activities.
INSERT INTO public.timetable_activity_participants (activity_id, user_id, guild_id)
SELECT a.id, a.created_by, a.guild_id
FROM public.timetable_activities a
ON CONFLICT (activity_id, user_id) DO NOTHING;
