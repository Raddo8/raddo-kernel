
CREATE TABLE public.taylor_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.onboarding_tenants(id) ON DELETE CASCADE,
  context TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.taylor_questions TO authenticated;
GRANT ALL ON public.taylor_questions TO service_role;
ALTER TABLE public.taylor_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taylor reads own" ON public.taylor_questions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.onboarding_tenants t WHERE t.id = taylor_questions.tenant_id AND (t.user_id = auth.uid() OR public.is_onboarding_admin())));

CREATE POLICY "taylor writes own" ON public.taylor_questions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.onboarding_tenants t WHERE t.id = taylor_questions.tenant_id AND t.user_id = auth.uid()));

CREATE POLICY "taylor admin update" ON public.taylor_questions FOR UPDATE TO authenticated
USING (public.is_onboarding_admin());

CREATE INDEX taylor_questions_tenant_idx ON public.taylor_questions(tenant_id, created_at DESC);
