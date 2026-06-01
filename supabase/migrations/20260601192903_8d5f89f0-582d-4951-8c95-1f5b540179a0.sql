ALTER TABLE public.consult_submissions
  ADD COLUMN IF NOT EXISTS challenge text,
  ADD COLUMN IF NOT EXISTS research_lookup_fired boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_brief_present boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_brief jsonb;