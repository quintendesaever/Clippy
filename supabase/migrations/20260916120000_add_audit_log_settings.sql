-- Per-guild Discord audit logging config. Dashboard is the primary editor.
-- channel_id is text like f1_reminder_settings; FK matches the later F1 channel pattern.

CREATE TABLE IF NOT EXISTS public.audit_log_settings (
  guild_id text PRIMARY KEY REFERENCES public.guilds (guild_id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  channel_id text,
  log_members boolean NOT NULL DEFAULT true,
  log_roles boolean NOT NULL DEFAULT true,
  log_channels boolean NOT NULL DEFAULT true,
  log_bot_config boolean NOT NULL DEFAULT true,
  log_command_errors boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.audit_log_settings
    ADD CONSTRAINT audit_log_settings_guild_channel_fkey
    FOREIGN KEY (guild_id, channel_id)
    REFERENCES public.channels (guild_id, channel_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.audit_log_settings ENABLE ROW LEVEL SECURITY;
