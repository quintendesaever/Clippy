-- Dashboard page-view analytics and an explicit per-member location-sharing preference.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS share_location boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_country text,
  ADD COLUMN IF NOT EXISTS last_region text,
  ADD COLUMN IF NOT EXISTS last_city text,
  ADD COLUMN IF NOT EXISTS last_dashboard_at timestamptz;

-- Preserve existing ICS location opt-in when promoting the preference onto members.
UPDATE public.members m
SET share_location = true
FROM public.member_calendars mc
WHERE m.guild_id = mc.guild_id
  AND m.user_id = mc.user_id
  AND mc.show_location IS TRUE;

CREATE TABLE IF NOT EXISTS public.dashboard_page_views (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id      text        NOT NULL REFERENCES public.guilds (guild_id) ON DELETE CASCADE,
  user_id       text,
  session_id    uuid        NOT NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  path          text        NOT NULL,
  country       text,
  region        text,
  city          text,
  device_type   text,
  browser_family text,
  referrer      text,
  CONSTRAINT dashboard_page_views_path_len CHECK (char_length(trim(path)) BETWEEN 1 AND 256),
  CONSTRAINT dashboard_page_views_device_type_chk CHECK (
    device_type IS NULL OR device_type IN ('desktop', 'mobile', 'tablet', 'unknown')
  ),
  CONSTRAINT dashboard_page_views_guild_user_fkey
    FOREIGN KEY (guild_id, user_id)
    REFERENCES public.members (guild_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS dashboard_page_views_guild_time_idx
  ON public.dashboard_page_views (guild_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS dashboard_page_views_guild_user_idx
  ON public.dashboard_page_views (guild_id, user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS dashboard_page_views_guild_session_idx
  ON public.dashboard_page_views (guild_id, session_id);

CREATE INDEX IF NOT EXISTS dashboard_page_views_guild_path_idx
  ON public.dashboard_page_views (guild_id, path);

ALTER TABLE public.dashboard_page_views ENABLE ROW LEVEL SECURITY;
