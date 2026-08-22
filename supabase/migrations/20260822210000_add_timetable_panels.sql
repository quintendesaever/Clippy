-- Persistent Discord timetable panel identity (one message per guild).

CREATE TABLE IF NOT EXISTS public.timetable_panels (
  guild_id    text        PRIMARY KEY REFERENCES public.guilds (guild_id) ON DELETE CASCADE,
  channel_id  text        NOT NULL,
  message_id  text        NOT NULL,
  week_key    text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (guild_id, channel_id)
    REFERENCES public.channels (guild_id, channel_id)
    ON DELETE CASCADE
);

ALTER TABLE public.timetable_panels ENABLE ROW LEVEL SECURITY;
