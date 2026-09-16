-- One-location daily library schedule (settings + visits).
-- Dashboard is the primary editor. Service role backend; RLS on with no anon policies.

CREATE TABLE IF NOT EXISTS public.library_settings (
  guild_id text PRIMARY KEY REFERENCES public.guilds (guild_id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  channel_id text,
  open_minutes integer NOT NULL DEFAULT 480,
  close_minutes integer NOT NULL DEFAULT 1320,
  message_id text,
  message_channel_id text,
  schedule_day_key text,
  last_cleanup_day_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_settings_hours_check
    CHECK (open_minutes >= 0 AND close_minutes <= 1439 AND close_minutes > open_minutes)
);

DO $$
BEGIN
  ALTER TABLE public.library_settings
    ADD CONSTRAINT library_settings_guild_channel_fkey
    FOREIGN KEY (guild_id, channel_id)
    REFERENCES public.channels (guild_id, channel_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.library_settings
    ADD CONSTRAINT library_settings_message_channel_fkey
    FOREIGN KEY (guild_id, message_channel_id)
    REFERENCES public.channels (guild_id, channel_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.library_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL REFERENCES public.guilds (guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  day_key text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_visits_range_check CHECK (end_at > start_at),
  CONSTRAINT library_visits_user_day_unique UNIQUE (guild_id, user_id, day_key),
  CONSTRAINT library_visits_guild_user_fkey
    FOREIGN KEY (guild_id, user_id)
    REFERENCES public.members (guild_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS library_visits_guild_day_start_idx
  ON public.library_visits (guild_id, day_key, start_at);

ALTER TABLE public.library_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_visits ENABLE ROW LEVEL SECURITY;
