CREATE TABLE public.intake_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL,
  tenant_id uuid REFERENCES public.onboarding_tenants(id) ON DELETE SET NULL,
  claim text NOT NULL,
  corrected_to text NOT NULL,
  source_message_id uuid REFERENCES public.taylor_messages(id) ON DELETE SET NULL,
  source_surface text NOT NULL DEFAULT 'start_panel',
  declared_by text NOT NULL DEFAULT 'client',
  status text NOT NULL DEFAULT 'active',
  is_synthetic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intake_corrections_status_ck CHECK (status IN ('active','retracted'))
);

GRANT ALL ON public.intake_corrections TO service_role;

ALTER TABLE public.intake_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corrections service only"
  ON public.intake_corrections FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX intake_corrections_cid_status_idx
  ON public.intake_corrections (cid, status, created_at DESC);

CREATE TRIGGER intake_corrections_touch
  BEFORE UPDATE ON public.intake_corrections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
