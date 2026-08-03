ALTER TABLE public.onboarding_tenants
  ADD COLUMN IF NOT EXISTS connector_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS connector_first_client text;

CREATE TABLE IF NOT EXISTS public.connector_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL REFERENCES public.tenants(cid),
  event text NOT NULL,
  surface text,
  client_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connector_events_cid_created_idx
  ON public.connector_events (cid, created_at DESC);

REVOKE ALL ON TABLE public.connector_events FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT SELECT ON public.connector_events TO authenticated;
GRANT ALL ON public.connector_events TO service_role;

ALTER TABLE public.connector_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connector_events_self_read ON public.connector_events;
CREATE POLICY connector_events_self_read
  ON public.connector_events
  FOR SELECT
  TO authenticated
  USING (cid = public.current_cid());