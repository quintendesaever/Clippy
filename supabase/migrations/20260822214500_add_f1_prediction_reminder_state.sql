-- F1 prediction reminder state: one active Discord message and per-meeting stage tracking.

ALTER TABLE public.f1_reminder_settings
  ADD COLUMN IF NOT EXISTS prediction_url text,
  ADD COLUMN IF NOT EXISTS active_message_id text,
  ADD COLUMN IF NOT EXISTS current_meeting_id text,
  ADD COLUMN IF NOT EXISTS last_stage_sent text,
  ADD COLUMN IF NOT EXISTS qualifying_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS race_start_at timestamptz;
