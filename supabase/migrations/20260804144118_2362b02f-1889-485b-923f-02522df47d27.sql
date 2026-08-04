ALTER TABLE public.onboarding_tenants
  ADD COLUMN IF NOT EXISTS build_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS build_submission jsonb;