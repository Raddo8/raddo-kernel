
DO $mig$
DECLARE
  r record;
  v_unclassified bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenancy_t' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.tenancy_t AS ENUM ('FLEET','TENANT');
  END IF;
END $mig$;

CREATE TABLE IF NOT EXISTS public.tenancy_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  unclassified_rows bigint NOT NULL,
  total_rows bigint NOT NULL,
  reason text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT SELECT ON public.tenancy_quarantine TO authenticated;
GRANT ALL ON public.tenancy_quarantine TO service_role;
ALTER TABLE public.tenancy_quarantine ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenancy_quarantine_operator_read" ON public.tenancy_quarantine
  FOR SELECT TO authenticated USING (public.is_fleet_operator());

DO $mig$
DECLARE
  r record;
  v_unclassified bigint;
  v_total bigint;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'cid'
       AND t.table_type = 'BASE TABLE'
     ORDER BY c.table_name
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenancy public.tenancy_t', r.table_name);

    -- Evidence 1 · a row carrying a client identifier belongs to that client.
    -- Append-only guards must not read a classification backfill as a mutation.
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', r.table_name);
    EXECUTE format('UPDATE public.%I SET tenancy = ''TENANT'' WHERE cid IS NOT NULL AND tenancy IS NULL', r.table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', r.table_name);
  END LOOP;

  -- Evidence 2 · the only fleet-wide rows in the estate that say so in their own data.
  ALTER TABLE public.doctrine_rules DISABLE TRIGGER USER;
  ALTER TABLE public.study_skills DISABLE TRIGGER USER;
  ALTER TABLE public.study_agents DISABLE TRIGGER USER;
  UPDATE public.doctrine_rules SET tenancy = 'FLEET' WHERE scope = 'FLEET' AND cid IS NULL AND tenancy IS NULL;
  UPDATE public.study_skills   SET tenancy = 'FLEET' WHERE scope = 'fleet' AND cid IS NULL AND tenancy IS NULL;
  UPDATE public.study_agents   SET tenancy = 'FLEET' WHERE scope = 'fleet' AND cid IS NULL AND tenancy IS NULL;
  ALTER TABLE public.doctrine_rules ENABLE TRIGGER USER;
  ALTER TABLE public.study_skills ENABLE TRIGGER USER;
  ALTER TABLE public.study_agents ENABLE TRIGGER USER;

  -- Constrain. A table with nothing left unclassified is constrained outright;
  -- a table with unclassified rows keeps them visible and is quarantined, but
  -- every NEW row must still carry the marker.
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'cid'
       AND t.table_type = 'BASE TABLE'
     ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenancy IS NULL', r.table_name) INTO v_unclassified;
    EXECUTE format('SELECT count(*) FROM public.%I', r.table_name) INTO v_total;

    IF v_unclassified = 0 THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenancy SET NOT NULL', r.table_name);
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK ((tenancy = ''FLEET'' AND cid IS NULL) OR (tenancy = ''TENANT'' AND cid IS NOT NULL))',
        r.table_name, r.table_name || '_tenancy_cid_check');
    ELSE
      -- NOT VALID: enforced on every new or updated row, skipped for the
      -- quarantined legacy rows so nothing is defaulted or destroyed.
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (tenancy IS NOT NULL AND ((tenancy = ''FLEET'' AND cid IS NULL) OR (tenancy = ''TENANT'' AND cid IS NOT NULL))) NOT VALID',
        r.table_name, r.table_name || '_tenancy_cid_check');

      INSERT INTO public.tenancy_quarantine (table_name, unclassified_rows, total_rows, reason)
      VALUES (r.table_name, v_unclassified, v_total,
        'Rows hold no client identifier and no evidence in their own data says the row is fleet-wide. Left unmarked rather than defaulted. New rows must carry the marker.');
    END IF;
  END LOOP;
END $mig$;
