
CREATE TABLE public.world_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL,
  source text NOT NULL,
  item_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  confidence numeric,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  synthetic boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_items_source_chk CHECK (source IN ('deepdive','harvest')),
  CONSTRAINT world_items_confidence_chk CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
CREATE INDEX world_items_cid_idx ON public.world_items (cid, created_at DESC);
CREATE INDEX world_items_type_idx ON public.world_items (cid, item_type);
GRANT ALL ON public.world_items TO service_role;
ALTER TABLE public.world_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wire_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL,
  source text NOT NULL,
  provider text NOT NULL DEFAULT '',
  grant_status text NOT NULL DEFAULT 'pending',
  granted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wire_grants_source_chk CHECK (source IN ('email','calendar','files','accounting','crm','chat','other')),
  CONSTRAINT wire_grants_status_chk CHECK (grant_status IN ('pending','granted','declined','revoked'))
);
CREATE UNIQUE INDEX wire_grants_unique_idx ON public.wire_grants (cid, source, provider);
GRANT ALL ON public.wire_grants TO service_role;
ALTER TABLE public.wire_grants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.connection_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL,
  system_name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  usage_role text NOT NULL DEFAULT 'professional',
  grant_status text NOT NULL DEFAULT 'not-requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_inventory_role_chk CHECK (usage_role IN ('personal','professional','both')),
  CONSTRAINT connection_inventory_status_chk CHECK (grant_status IN ('not-requested','pending','granted','declined','revoked'))
);
CREATE UNIQUE INDEX connection_inventory_unique_idx ON public.connection_inventory (cid, lower(system_name));
GRANT ALL ON public.connection_inventory TO service_role;
ALTER TABLE public.connection_inventory ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_tenants
  ADD COLUMN IF NOT EXISTS lane text,
  ADD COLUMN IF NOT EXISTS handoff_complete_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_message_id uuid;

CREATE TRIGGER world_items_touch BEFORE UPDATE ON public.world_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER wire_grants_touch BEFORE UPDATE ON public.wire_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER connection_inventory_touch BEFORE UPDATE ON public.connection_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
