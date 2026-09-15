-- Track bots and departed members so admin stats can count only present humans.
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS left_guild_at timestamptz;

CREATE INDEX IF NOT EXISTS members_guild_active_human_idx
  ON public.members (guild_id)
  WHERE left_guild_at IS NULL AND is_bot = false;
