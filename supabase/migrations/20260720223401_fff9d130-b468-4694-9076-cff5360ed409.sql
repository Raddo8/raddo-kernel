
ALTER TABLE public.onboarding_tenants
  ADD COLUMN IF NOT EXISTS connectors jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.intake_files DROP CONSTRAINT IF EXISTS intake_files_kind_check;
ALTER TABLE public.intake_files ADD CONSTRAINT intake_files_kind_check
  CHECK (kind = ANY (ARRAY['harvest','harvest_paste','harvest_zip','briefcase_widget','claude_export','gemini_export','doc','fireside']));

CREATE TABLE IF NOT EXISTS public.intake_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.onboarding_tenants(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'first_conversation',
  section text,
  fact text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intake_facts_tenant_idx ON public.intake_facts(tenant_id, created_at DESC);

GRANT SELECT, INSERT ON public.intake_facts TO authenticated;
GRANT ALL ON public.intake_facts TO service_role;
ALTER TABLE public.intake_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facts reads own" ON public.intake_facts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.onboarding_tenants t WHERE t.id = intake_facts.tenant_id AND t.user_id = auth.uid())
         OR public.is_onboarding_admin());
CREATE POLICY "facts admin insert" ON public.intake_facts FOR INSERT TO authenticated
  WITH CHECK (public.is_onboarding_admin());

CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.onboarding_tenants(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.deletion_requests TO authenticated;
GRANT ALL ON public.deletion_requests TO service_role;
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "del inserts own" ON public.deletion_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid()
              AND EXISTS (SELECT 1 FROM public.onboarding_tenants t WHERE t.id = deletion_requests.tenant_id AND t.user_id = auth.uid()));
CREATE POLICY "del reads own" ON public.deletion_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_onboarding_admin());
