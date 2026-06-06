CREATE TABLE public.mcp_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant text NOT NULL,
  tool text NOT NULL,
  agent_id text,
  model_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mcp_usage_events TO service_role;
ALTER TABLE public.mcp_usage_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX mcp_usage_events_tenant_created_idx ON public.mcp_usage_events (tenant, created_at DESC);