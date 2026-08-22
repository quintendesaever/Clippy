ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS show_type_prefix boolean NOT NULL DEFAULT true;
