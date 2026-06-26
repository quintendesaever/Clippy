-- Members table, backfill orphan rows, and foreign key constraints for ClippyV3 stats schema.

-- ---------------------------------------------------------------------------
-- Step 1: Backfill guilds from all child tables
-- ---------------------------------------------------------------------------
INSERT INTO public.guilds (guild_id, timezone, updated_at)
SELECT DISTINCT src.guild_id, 'UTC', now()
FROM (
  SELECT guild_id FROM public.channels WHERE guild_id IS NOT NULL
  UNION SELECT guild_id FROM public.messages WHERE guild_id IS NOT NULL
  UNION SELECT guild_id FROM public.voice_sessions WHERE guild_id IS NOT NULL
  UNION SELECT guild_id FROM public.guild_channel_sync_state WHERE guild_id IS NOT NULL
  UNION SELECT guild_id FROM public.member_count_snapshots WHERE guild_id IS NOT NULL
  UNION SELECT guild_id FROM public.member_calendars WHERE guild_id IS NOT NULL
  UNION SELECT guild_id FROM public.f1_reminder_settings WHERE guild_id IS NOT NULL
) AS src
WHERE NOT EXISTS (
  SELECT 1 FROM public.guilds g WHERE g.guild_id = src.guild_id
);

-- ---------------------------------------------------------------------------
-- Step 2: Backfill channels referenced by stats / settings rows
-- ---------------------------------------------------------------------------
INSERT INTO public.channels (guild_id, channel_id, name, updated_at)
SELECT DISTINCT src.guild_id, src.channel_id, 'unknown', now()
FROM (
  SELECT guild_id, channel_id FROM public.messages
  WHERE guild_id IS NOT NULL AND channel_id IS NOT NULL
  UNION
  SELECT guild_id, channel_id FROM public.voice_sessions
  WHERE guild_id IS NOT NULL AND channel_id IS NOT NULL
  UNION
  SELECT guild_id, channel_id FROM public.guild_channel_sync_state
  WHERE guild_id IS NOT NULL AND channel_id IS NOT NULL
  UNION
  SELECT guild_id, channel_id FROM public.f1_reminder_settings
  WHERE guild_id IS NOT NULL AND channel_id IS NOT NULL
) AS src
ON CONFLICT (guild_id, channel_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Step 3: Create members table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.members (
  guild_id    text        NOT NULL,
  user_id     text        NOT NULL,
  avatar_hash text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Step 4: Backfill members from existing user_id references
-- ---------------------------------------------------------------------------
INSERT INTO public.members (guild_id, user_id, avatar_hash, updated_at)
SELECT DISTINCT src.guild_id, src.user_id, NULL, now()
FROM (
  SELECT guild_id, user_id FROM public.messages
  WHERE guild_id IS NOT NULL AND user_id IS NOT NULL
  UNION
  SELECT guild_id, user_id FROM public.voice_sessions
  WHERE guild_id IS NOT NULL AND user_id IS NOT NULL
  UNION
  SELECT guild_id, user_id FROM public.member_calendars
  WHERE guild_id IS NOT NULL AND user_id IS NOT NULL
) AS src
ON CONFLICT (guild_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Step 5: Remove orphan reaction rows before message_id FK
-- ---------------------------------------------------------------------------
DELETE FROM public.message_reactions mr
WHERE NOT EXISTS (
  SELECT 1 FROM public.messages m WHERE m.id = mr.message_id
);

-- ---------------------------------------------------------------------------
-- Step 6: Add foreign keys (idempotent via helper)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._clippy_add_fk_if_missing(
  p_name text,
  p_sql text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = p_name AND connamespace = 'public'::regnamespace
  ) THEN
    EXECUTE p_sql;
  END IF;
END;
$$;

SELECT public._clippy_add_fk_if_missing(
  'channels_guild_id_fkey',
  'ALTER TABLE public.channels ADD CONSTRAINT channels_guild_id_fkey FOREIGN KEY (guild_id) REFERENCES public.guilds (guild_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'members_guild_id_fkey',
  'ALTER TABLE public.members ADD CONSTRAINT members_guild_id_fkey FOREIGN KEY (guild_id) REFERENCES public.guilds (guild_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'messages_guild_id_fkey',
  'ALTER TABLE public.messages ADD CONSTRAINT messages_guild_id_fkey FOREIGN KEY (guild_id) REFERENCES public.guilds (guild_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'messages_guild_channel_fkey',
  'ALTER TABLE public.messages ADD CONSTRAINT messages_guild_channel_fkey FOREIGN KEY (guild_id, channel_id) REFERENCES public.channels (guild_id, channel_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'messages_guild_user_fkey',
  'ALTER TABLE public.messages ADD CONSTRAINT messages_guild_user_fkey FOREIGN KEY (guild_id, user_id) REFERENCES public.members (guild_id, user_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'message_reactions_message_id_fkey',
  'ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages (id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'guild_channel_sync_state_guild_id_fkey',
  'ALTER TABLE public.guild_channel_sync_state ADD CONSTRAINT guild_channel_sync_state_guild_id_fkey FOREIGN KEY (guild_id) REFERENCES public.guilds (guild_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'guild_channel_sync_state_guild_channel_fkey',
  'ALTER TABLE public.guild_channel_sync_state ADD CONSTRAINT guild_channel_sync_state_guild_channel_fkey FOREIGN KEY (guild_id, channel_id) REFERENCES public.channels (guild_id, channel_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'voice_sessions_guild_id_fkey',
  'ALTER TABLE public.voice_sessions ADD CONSTRAINT voice_sessions_guild_id_fkey FOREIGN KEY (guild_id) REFERENCES public.guilds (guild_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'voice_sessions_guild_channel_fkey',
  'ALTER TABLE public.voice_sessions ADD CONSTRAINT voice_sessions_guild_channel_fkey FOREIGN KEY (guild_id, channel_id) REFERENCES public.channels (guild_id, channel_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'voice_sessions_guild_user_fkey',
  'ALTER TABLE public.voice_sessions ADD CONSTRAINT voice_sessions_guild_user_fkey FOREIGN KEY (guild_id, user_id) REFERENCES public.members (guild_id, user_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'member_count_snapshots_guild_id_fkey',
  'ALTER TABLE public.member_count_snapshots ADD CONSTRAINT member_count_snapshots_guild_id_fkey FOREIGN KEY (guild_id) REFERENCES public.guilds (guild_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'member_calendars_guild_id_fkey',
  'ALTER TABLE public.member_calendars ADD CONSTRAINT member_calendars_guild_id_fkey FOREIGN KEY (guild_id) REFERENCES public.guilds (guild_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'member_calendars_guild_user_fkey',
  'ALTER TABLE public.member_calendars ADD CONSTRAINT member_calendars_guild_user_fkey FOREIGN KEY (guild_id, user_id) REFERENCES public.members (guild_id, user_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'f1_reminder_settings_guild_id_fkey',
  'ALTER TABLE public.f1_reminder_settings ADD CONSTRAINT f1_reminder_settings_guild_id_fkey FOREIGN KEY (guild_id) REFERENCES public.guilds (guild_id) ON DELETE CASCADE'
);

SELECT public._clippy_add_fk_if_missing(
  'f1_reminder_settings_guild_channel_fkey',
  'ALTER TABLE public.f1_reminder_settings ADD CONSTRAINT f1_reminder_settings_guild_channel_fkey FOREIGN KEY (guild_id, channel_id) REFERENCES public.channels (guild_id, channel_id) ON DELETE SET NULL'
);

DROP FUNCTION public._clippy_add_fk_if_missing(text, text);
