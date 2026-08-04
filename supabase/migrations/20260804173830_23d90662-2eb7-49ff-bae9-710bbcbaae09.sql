ALTER TABLE public.council_minutes
  ADD COLUMN IF NOT EXISTS run_id uuid,
  ADD COLUMN IF NOT EXISTS tool text,
  ADD COLUMN IF NOT EXISTS question_hash text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS mode text,
  ADD COLUMN IF NOT EXISTS advisor text,
  ADD COLUMN IF NOT EXISTS minute jsonb,
  ADD COLUMN IF NOT EXISTS chairs jsonb,
  ADD COLUMN IF NOT EXISTS horizon jsonb,
  ADD COLUMN IF NOT EXISTS cost_usd numeric,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS tenant_label text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.council_minutes ALTER COLUMN cid DROP NOT NULL;
ALTER TABLE public.council_minutes DROP CONSTRAINT IF EXISTS council_minutes_cid_fkey;
ALTER TABLE public.council_minutes ALTER COLUMN question DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'council_minutes_status_check'
  ) THEN
    ALTER TABLE public.council_minutes
      ADD CONSTRAINT council_minutes_status_check
      CHECK (status IN ('running','complete','failed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS council_minutes_run_id_key ON public.council_minutes (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS council_minutes_cid_started_idx ON public.council_minutes (cid, started_at DESC);
CREATE INDEX IF NOT EXISTS council_minutes_qhash_idx ON public.council_minutes (question_hash);

ALTER TABLE public.council_minutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.council_minutes FROM anon, authenticated;
GRANT ALL ON public.council_minutes TO service_role;