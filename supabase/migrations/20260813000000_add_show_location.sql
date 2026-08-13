ALTER TABLE public.member_calendars
  ADD COLUMN IF NOT EXISTS show_location boolean NOT NULL DEFAULT false;
