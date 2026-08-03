ALTER TABLE public.kernels ADD COLUMN IF NOT EXISTS kernel_kind text NOT NULL DEFAULT 'tenant';
ALTER TABLE public.kernels ADD COLUMN IF NOT EXISTS persona_key text;
ALTER TABLE public.kernels ADD CONSTRAINT kernels_kind_chk CHECK (kernel_kind IN ('tenant','persona'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_kernels_persona ON public.kernels(persona_key) WHERE kernel_kind = 'persona';
CREATE TABLE IF NOT EXISTS public.buddy_worklog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL REFERENCES public.tenants(cid) ON DELETE RESTRICT ON UPDATE RESTRICT,
  blueprint_id uuid,
  kind text NOT NULL,
  body_md text,
  confidence_e numeric,
  confidence_r numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.buddy_worklog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.buddy_worklog FROM PUBLIC, anon, authenticated, sandbox_exec;
INSERT INTO public.kernels (tenant_id, cid, version, status, notes, kernel_kind, persona_key)
SELECT 'COB-HQ','CID-100001',1,'draft','BUDDY v3.0 persona kernel container (Stage 1). Resolved by persona_key, never the active-tenant path; parts + LOAD_BUDDY tool are Stage 2 (gateway).','persona','BUDDY'
WHERE NOT EXISTS (SELECT 1 FROM public.kernels WHERE kernel_kind='persona' AND persona_key='BUDDY');