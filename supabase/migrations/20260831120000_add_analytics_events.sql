-- Shared dashboard + Discord interaction events. No message content, ICS URLs, or tokens.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id     text        NOT NULL REFERENCES public.guilds (guild_id) ON DELETE CASCADE,
  user_id      text,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  source       text        NOT NULL,
  event_type   text        NOT NULL,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT analytics_events_source_chk CHECK (source IN ('dashboard', 'discord')),
  CONSTRAINT analytics_events_event_type_len CHECK (
    char_length(trim(event_type)) BETWEEN 1 AND 64
  ),
  CONSTRAINT analytics_events_guild_user_fkey
    FOREIGN KEY (guild_id, user_id)
    REFERENCES public.members (guild_id, user_id)
    MATCH SIMPLE
    ON DELETE NO ACTION
);

-- Composite member FK cannot ON DELETE SET NULL (guild_id is NOT NULL).
-- Null user_id first so MATCH SIMPLE rows survive member deletion.
CREATE OR REPLACE FUNCTION public.analytics_events_null_user_on_member_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.analytics_events
  SET user_id = NULL
  WHERE guild_id = OLD.guild_id AND user_id = OLD.user_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS analytics_events_null_user_on_member_delete ON public.members;
CREATE TRIGGER analytics_events_null_user_on_member_delete
  BEFORE DELETE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.analytics_events_null_user_on_member_delete();

CREATE INDEX IF NOT EXISTS analytics_events_guild_time_idx
  ON public.analytics_events (guild_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_guild_type_time_idx
  ON public.analytics_events (guild_id, event_type, occurred_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
