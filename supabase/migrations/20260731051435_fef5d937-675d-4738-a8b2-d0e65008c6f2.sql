ALTER TABLE public.mcp_usage_events
  ADD COLUMN IF NOT EXISTS cid text,
  ADD COLUMN IF NOT EXISTS principal_id uuid,
  ADD COLUMN IF NOT EXISTS external_identity_id uuid,
  ADD COLUMN IF NOT EXISTS resolution_mode text;

CREATE INDEX IF NOT EXISTS mcp_usage_events_cid_idx ON public.mcp_usage_events (cid);
CREATE INDEX IF NOT EXISTS mcp_usage_events_principal_idx ON public.mcp_usage_events (principal_id);