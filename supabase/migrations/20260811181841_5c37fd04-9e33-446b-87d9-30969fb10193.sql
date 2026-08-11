-- HARDEN-03 · WORKSTREAM D · the first sweeper.
-- Built-but-unreachable detection. Read-only by construction: the only write
-- is through record_signal(), the governed writer for improvement_signals.

CREATE OR REPLACE FUNCTION public.sweep_unreachable(p_raise boolean DEFAULT false)
RETURNS TABLE(
  finding_kind text,
  object_name  text,
  detail       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r           record;
  n           bigint;
  live_tools  text[];
BEGIN
  -- The live tool surface is whatever the gateway last registered. That row is
  -- written by begin_session on a real connector call, so it is observation,
  -- not intention.
  SELECT tmr.tools INTO live_tools
  FROM public.tool_manifest_registry tmr
  ORDER BY tmr.first_seen_at DESC
  LIMIT 1;
  live_tools := COALESCE(live_tools, ARRAY[]::text[]);

  -- 1 · tables with zero rows and no writer anywhere in the estate.
  FOR r IN
    SELECT c.relname AS tbl,
           EXISTS (
             SELECT 1 FROM pg_proc p
             JOIN pg_namespace pn ON pn.oid = p.pronamespace
             WHERE pn.nspname = 'public'
               AND p.prosrc ~* ('(insert\s+into|update|copy)\s+(public\.)?"?' || c.relname || '"?\M')
           ) AS has_writer
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE '\_%'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tbl) INTO n;
    IF n = 0 THEN
      finding_kind := 'table_unreachable';
      object_name  := r.tbl;
      detail := CASE
        WHEN r.has_writer THEN 'zero rows · a writer exists in code but has never written one'
        ELSE 'zero rows · no function in the estate writes to this table'
      END;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- 2 · functions nothing calls and nothing exposes.
  FOR r IN
    SELECT p.proname AS fname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc q
        JOIN pg_namespace qn ON qn.oid = q.pronamespace
        WHERE qn.nspname = 'public'
          AND q.oid <> p.oid
          AND q.prosrc ~* ('\m' || p.proname || '\s*\(')
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid
      )
      AND NOT (p.proname = ANY (live_tools))
    GROUP BY p.proname
  LOOP
    finding_kind := 'function_uncalled';
    object_name  := r.fname;
    detail       := 'no other function calls it, no trigger uses it, not on the live tool manifest';
    RETURN NEXT;
  END LOOP;

  -- 3 · catalogue rows that contradict live reality, in both directions.
  FOR r IN
    SELECT tc.tool_key, tc.status
    FROM public.tool_catalog tc
    WHERE (tc.status = 'active' AND NOT (tc.tool_key = ANY (live_tools)))
       OR (COALESCE(tc.status,'') <> 'active' AND tc.tool_key = ANY (live_tools))
  LOOP
    finding_kind := 'catalog_contradiction';
    object_name  := r.tool_key;
    detail := format(
      'catalog says %s · live manifest %s it',
      COALESCE(r.status, 'no status'),
      CASE WHEN r.tool_key = ANY (live_tools) THEN 'lists' ELSE 'does not list' END
    );
    RETURN NEXT;
  END LOOP;

  -- Live tools with no catalogue row at all: the register meant to track the
  -- estate is itself the thing out of date.
  FOR r IN
    SELECT t AS tool_key
    FROM unnest(live_tools) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.tool_catalog tc WHERE tc.tool_key = t)
  LOOP
    finding_kind := 'catalog_missing';
    object_name  := r.tool_key;
    detail       := 'live on the connector manifest and absent from tool_catalog';
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.sweep_unreachable(boolean) TO service_role;

-- The raising half is a separate VOLATILE function so the sweep itself stays
-- provably read-only.
CREATE OR REPLACE FUNCTION public.sweep_unreachable_raise()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  f     record;
  count integer := 0;
BEGIN
  FOR f IN SELECT * FROM public.sweep_unreachable() LOOP
    PERFORM public.record_signal(
      p_title         := format('%s · %s', f.finding_kind, f.object_name),
      p_detail_md     := f.detail,
      p_pattern       := 'sweep-unreachable',
      p_signal_type   := 'fleet',
      p_status        := 'open',
      p_provenance    := 'SYSTEM',
      p_source_subject := f.object_name,
      p_source_surface := 'sweep_unreachable',
      p_tool_version  := 'sweep_unreachable.v1'
    );
    count := count + 1;
  END LOOP;
  RETURN count;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.sweep_unreachable_raise() TO service_role;