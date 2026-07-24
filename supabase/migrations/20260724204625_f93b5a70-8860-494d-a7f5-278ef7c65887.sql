
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant text NOT NULL,
  surface text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  close_kind text,
  kernel_version int,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX sessions_tenant_opened_idx ON public.sessions (tenant, opened_at DESC);
CREATE INDEX sessions_tenant_open_idx ON public.sessions (tenant) WHERE closed_at IS NULL;

CREATE TABLE public.session_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  tenant text NOT NULL,
  kind text NOT NULL,
  open_loops jsonb NOT NULL DEFAULT '[]'::jsonb,
  decisions_pending jsonb NOT NULL DEFAULT '[]'::jsonb,
  deferrals jsonb NOT NULL DEFAULT '[]'::jsonb,
  principal_state text,
  financial_residue text,
  task_states jsonb NOT NULL DEFAULT '{}'::jsonb,
  staleness_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  notion_page_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.session_checkpoints TO service_role;
ALTER TABLE public.session_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE INDEX session_checkpoints_tenant_created_idx ON public.session_checkpoints (tenant, created_at DESC);

CREATE TABLE public.open_loops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant text NOT NULL,
  title text NOT NULL,
  trigger text,
  owner text,
  state text,
  surfaced_count int NOT NULL DEFAULT 0,
  last_surfaced timestamptz,
  snooze_until date,
  brief_status text NOT NULL DEFAULT 'open',
  notion_page_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.open_loops TO service_role;
ALTER TABLE public.open_loops ENABLE ROW LEVEL SECURITY;
CREATE INDEX open_loops_tenant_brief_idx ON public.open_loops (tenant, brief_status, snooze_until);

CREATE TABLE public.memory_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant text NOT NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  category text,
  title text NOT NULL,
  body_md text NOT NULL,
  confidence numeric NOT NULL DEFAULT 1.0,
  status text NOT NULL DEFAULT 'active',
  superseded_by uuid REFERENCES public.memory_entries(id),
  notion_block_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.memory_entries TO service_role;
ALTER TABLE public.memory_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX memory_entries_tenant_status_idx ON public.memory_entries (tenant, status, created_at DESC);

CREATE TABLE public.ritual_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant text NOT NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  ritual text NOT NULL,
  outcome text NOT NULL,
  layers jsonb NOT NULL DEFAULT '{}'::jsonb,
  unsaved jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ritual_runs TO service_role;
ALTER TABLE public.ritual_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX ritual_runs_tenant_created_idx ON public.ritual_runs (tenant, created_at DESC);
