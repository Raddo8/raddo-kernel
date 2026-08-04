ALTER TABLE public.onboarding_tenants ADD COLUMN IF NOT EXISTS welcome_celebrated_at timestamptz;
GRANT SELECT, INSERT, UPDATE ON public.onboarding_tenants TO authenticated;
GRANT ALL ON public.onboarding_tenants TO service_role;