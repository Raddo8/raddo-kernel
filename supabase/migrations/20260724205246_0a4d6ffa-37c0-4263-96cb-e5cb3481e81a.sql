
CREATE TABLE public.tenant_surfaces (
  tenant text NOT NULL,
  surface_key text NOT NULL,
  kind text NOT NULL,
  notion_id text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant, surface_key)
);
GRANT ALL ON public.tenant_surfaces TO service_role;
ALTER TABLE public.tenant_surfaces ENABLE ROW LEVEL SECURITY;
CREATE INDEX tenant_surfaces_tenant_active_idx ON public.tenant_surfaces (tenant) WHERE status = 'active';

INSERT INTO public.tenant_surfaces (tenant, surface_key, kind, notion_id, status) VALUES
  ('COB-HQ', 'decisions',   'data_source', '2707ec7c-7f7e-4198-a93b-53addb6800a0', 'active'),
  ('COB-HQ', 'session_log', 'data_source', 'df479516-1bca-454e-8fce-e09ec0adb6a9', 'active'),
  ('COB-HQ', 'tasks',       'data_source', '675adc94-f394-47fc-a087-ce549d319f61', 'active'),
  ('COB-HQ', 'signals',     'data_source', 'cd4261cf-2164-4008-9526-291b5305ce97', 'active'),
  ('COB-HQ', 'records',     'data_source', '37398a4a-3fc4-4105-bbc8-ba617fd12229', 'active'),
  ('COB-HQ', 'comms',       'data_source', '8c21aa8e-a109-4a17-9750-7f8ef41ce5d8', 'active'),
  ('COB-HQ', 'memory',      'page',        '3841c0a3-28a8-813f-9df2-f4f1707e7421', 'active');
