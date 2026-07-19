
CREATE TABLE public.onboarding_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'intake',
  consent_signed_at TIMESTAMPTZ,
  consent_signed_name TEXT,
  step0_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step TEXT NOT NULL DEFAULT 'welcome',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.onboarding_tenants TO authenticated;
GRANT ALL ON public.onboarding_tenants TO service_role;
ALTER TABLE public.onboarding_tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.intake_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.onboarding_tenants(id) ON DELETE CASCADE,
  chapter INT NOT NULL,
  question_key TEXT NOT NULL,
  answer TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, question_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_state TO authenticated;
GRANT ALL ON public.intake_state TO service_role;
ALTER TABLE public.intake_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.intake_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.onboarding_tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('harvest','claude_export','gemini_export','doc')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.intake_files TO authenticated;
GRANT ALL ON public.intake_files TO service_role;
ALTER TABLE public.intake_files ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.onboarding_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.onboarding_tenants(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.onboarding_escalations TO authenticated;
GRANT ALL ON public.onboarding_escalations TO service_role;
ALTER TABLE public.onboarding_escalations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_onboarding_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) IN ('jake@chiefofbusiness.ai','jdb1203@gmail.com')
  );
$$;

CREATE POLICY "tenant reads own" ON public.onboarding_tenants FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR public.is_onboarding_admin());
CREATE POLICY "tenant inserts own" ON public.onboarding_tenants FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenant updates own" ON public.onboarding_tenants FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR public.is_onboarding_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_onboarding_admin());

CREATE POLICY "intake reads own" ON public.intake_state FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.onboarding_tenants t
      WHERE t.id = tenant_id AND (t.user_id = auth.uid() OR public.is_onboarding_admin()))
  );
CREATE POLICY "intake writes own" ON public.intake_state FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.onboarding_tenants t
      WHERE t.id = tenant_id AND t.user_id = auth.uid())
  );
CREATE POLICY "intake updates own" ON public.intake_state FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.onboarding_tenants t
      WHERE t.id = tenant_id AND t.user_id = auth.uid())
  );
CREATE POLICY "intake deletes own" ON public.intake_state FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.onboarding_tenants t
      WHERE t.id = tenant_id AND t.user_id = auth.uid())
  );

CREATE POLICY "files reads own" ON public.intake_files FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.onboarding_tenants t
      WHERE t.id = tenant_id AND (t.user_id = auth.uid() OR public.is_onboarding_admin()))
  );
CREATE POLICY "files writes own" ON public.intake_files FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.onboarding_tenants t
      WHERE t.id = tenant_id AND t.user_id = auth.uid())
  );
CREATE POLICY "files deletes own" ON public.intake_files FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.onboarding_tenants t
      WHERE t.id = tenant_id AND t.user_id = auth.uid())
  );

CREATE POLICY "esc reads own" ON public.onboarding_escalations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.onboarding_tenants t
      WHERE t.id = tenant_id AND (t.user_id = auth.uid() OR public.is_onboarding_admin()))
  );
CREATE POLICY "esc writes own" ON public.onboarding_escalations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.onboarding_tenants t
      WHERE t.id = tenant_id AND t.user_id = auth.uid())
  );
CREATE POLICY "esc admin update" ON public.onboarding_escalations FOR UPDATE
  TO authenticated USING (public.is_onboarding_admin());

CREATE TRIGGER trg_onboarding_tenants_updated
  BEFORE UPDATE ON public.onboarding_tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_intake_state_updated
  BEFORE UPDATE ON public.intake_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE POLICY "onboarding files read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'onboarding-files'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_onboarding_admin())
  );
CREATE POLICY "onboarding files insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'onboarding-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "onboarding files delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'onboarding-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
