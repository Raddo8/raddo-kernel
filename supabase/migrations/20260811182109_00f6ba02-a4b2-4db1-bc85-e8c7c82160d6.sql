-- HARDEN-03 · WORKSTREAM B + C · one-time identity re-key and orphan attribution.
-- Nothing is dropped, converted or deleted. Every unresolved row states why.

-- B5 (first half) · the type that makes a display name a type error.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE n.nspname='public' AND t.typname='cid_t') THEN
    CREATE DOMAIN public.cid_t AS text CHECK (VALUE ~ '^CID-[0-9]{6}$');
  END IF;
END $$;

-- B1 · the column, on all fifteen.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'change_log','scheduled_actions','boot_log','blueprints','study_skills',
    'tenant_surfaces','taylor_questions','study_agents','tenant_offices',
    'knowledge_files','deletion_requests','intake_facts','intake_files',
    'intake_state','onboarding_escalations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS cid public.cid_t', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS cid_quarantine_reason text', t);
  END LOOP;
END $$;

-- B2 · one-time backfill from the tenant register, by display name.
-- A name that matches more than one tenant is QUARANTINED, never guessed.
-- The unique-name map is built once; JAEL is deliberately absent from it.
CREATE TEMP TABLE _name_map ON COMMIT DROP AS
SELECT upper(trim(display_name)) AS nm, min(cid) AS cid, count(*) AS n
FROM public.tenants
WHERE display_name IS NOT NULL
GROUP BY 1;

-- name-keyed tables ------------------------------------------------------
DO $$
DECLARE
  r record;
  spec text[][] := ARRAY[
    ARRAY['change_log','tenant_id'],
    ARRAY['scheduled_actions','tenant_id'],
    ARRAY['boot_log','tenant_id'],
    ARRAY['blueprints','tenant_id'],
    ARRAY['tenant_surfaces','tenant'],
    ARRAY['tenant_offices','tenant']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(spec,1) LOOP
    -- a value that is already a well-formed identifier is kept as itself
    EXECUTE format($q$
      UPDATE public.%1$I s
         SET cid = s.%2$I::public.cid_t
       WHERE s.cid IS NULL AND s.%2$I ~ '^CID-[0-9]{6}$'
    $q$, spec[i][1], spec[i][2]);

    -- unique display name resolves
    EXECUTE format($q$
      UPDATE public.%1$I s
         SET cid = m.cid::public.cid_t
        FROM _name_map m
       WHERE s.cid IS NULL
         AND m.n = 1
         AND upper(trim(s.%2$I)) = m.nm
    $q$, spec[i][1], spec[i][2]);

    -- colliding display name is quarantined with the candidates named
    EXECUTE format($q$
      UPDATE public.%1$I s
         SET cid_quarantine_reason =
             'name matches more than one client · ' || s.%2$I || ' resolves to ' ||
             (SELECT string_agg(t.cid, ', ' ORDER BY t.cid) FROM public.tenants t
               WHERE upper(trim(t.display_name)) = upper(trim(s.%2$I)))
       WHERE s.cid IS NULL
         AND s.%2$I IS NOT NULL
         AND EXISTS (SELECT 1 FROM _name_map m WHERE m.nm = upper(trim(s.%2$I)) AND m.n > 1)
    $q$, spec[i][1], spec[i][2]);

    -- a name that matches nothing at all is also a stated reason
    EXECUTE format($q$
      UPDATE public.%1$I s
         SET cid_quarantine_reason = 'no client in the register carries this name · ' || coalesce(s.%2$I,'(blank)')
       WHERE s.cid IS NULL AND s.cid_quarantine_reason IS NULL
    $q$, spec[i][1], spec[i][2]);
  END LOOP;
END $$;

-- onboarding-keyed tables · the key is an exact id, so no ambiguity exists.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'taylor_questions','intake_facts','intake_files','intake_state',
    'deletion_requests','onboarding_escalations','knowledge_files'
  ] LOOP
    EXECUTE format($q$
      UPDATE public.%1$I s
         SET cid = o.cid::public.cid_t
        FROM public.onboarding_tenants o
       WHERE s.cid IS NULL
         AND o.cid IS NOT NULL
         AND s.tenant_id::text = o.id::text
    $q$, tbl);

    EXECUTE format($q$
      UPDATE public.%1$I s
         SET cid_quarantine_reason = 'no onboarding record carries this key · ' || coalesce(s.tenant_id::text,'(blank)')
       WHERE s.cid IS NULL AND s.cid_quarantine_reason IS NULL
    $q$, tbl);
  END LOOP;
END $$;

-- B3 · study_skills and study_agents own nobody. Do not invent an owner.
UPDATE public.study_skills
   SET cid_quarantine_reason = 'tenant_id is null on every row · awaiting a ruling on ownership'
 WHERE cid IS NULL AND cid_quarantine_reason IS NULL;

UPDATE public.study_agents
   SET cid_quarantine_reason = 'tenant_id is null on every row · awaiting a ruling on ownership'
 WHERE cid IS NULL AND cid_quarantine_reason IS NULL;

-- WORKSTREAM C · the 67 orphans in open_loops.
-- Attribution is from evidence inside the register: an owner that already
-- appears on rows attributed to exactly one client. The name JAEL is never
-- used, because the name is precisely the ambiguous thing.
ALTER TABLE public.open_loops ADD COLUMN IF NOT EXISTS cid_quarantine_reason text;

WITH owner_home AS (
  SELECT owner, min(cid) AS cid, count(DISTINCT cid) AS n
  FROM public.open_loops
  WHERE cid IS NOT NULL AND owner IS NOT NULL
  GROUP BY owner
)
UPDATE public.open_loops o
   SET cid = h.cid
  FROM owner_home h
 WHERE o.cid IS NULL
   AND h.n = 1
   AND o.owner = h.owner;

UPDATE public.open_loops
   SET cid_quarantine_reason =
       'no attribution evidence · owner ' || coalesce(owner,'(blank)') ||
       ' appears on no attributed row, and the stored name is ambiguous'
 WHERE cid IS NULL AND cid_quarantine_reason IS NULL;

-- Probe helper · observed counts per table, not a summary.
CREATE OR REPLACE FUNCTION public.rekey_status()
RETURNS TABLE(table_name text, total bigint, attributed bigint, quarantined bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'change_log','scheduled_actions','boot_log','blueprints','study_skills',
    'tenant_surfaces','taylor_questions','study_agents','tenant_offices',
    'knowledge_files','deletion_requests','intake_facts','intake_files',
    'intake_state','onboarding_escalations','open_loops'
  ] LOOP
    table_name := t;
    EXECUTE format(
      'SELECT count(*), count(cid), count(*) FILTER (WHERE cid IS NULL AND cid_quarantine_reason IS NOT NULL) FROM public.%I', t
    ) INTO total, attributed, quarantined;
    RETURN NEXT;
  END LOOP;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.rekey_status() TO service_role;