ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS is_decision_maker boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Backfill title from legacy role text when title is blank
UPDATE public.contacts SET title = role WHERE title IS NULL AND role IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_account_decision_maker
  ON public.contacts(account_id) WHERE is_decision_maker = true;