-- Records explorer · read-only operator helpers. No writes, no grants to callers.

CREATE OR REPLACE FUNCTION public.hq_records_keys_v1(_cid text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT array_remove(array_cat(
    ARRAY[_cid],
    ARRAY(
      SELECT k FROM (
        SELECT t.display_name AS k FROM tenants t WHERE t.cid = _cid
        UNION
        SELECT t.cob_name AS k FROM tenants t WHERE t.cid = _cid
      ) s
      WHERE s.k IS NOT NULL
        -- a name shared by two tenants is never a key: the two JAELs stay separate
        AND (SELECT count(*) FROM tenants t2
             WHERE t2.display_name = s.k OR t2.cob_name = s.k) = 1
    )
  ), NULL);
$$;

CREATE OR REPLACE FUNCTION public.hq_records_fleet_v1()
RETURNS TABLE(
  cid text, display_name text, cob_name text, principal text, status text,
  memory_count bigint, memory_last timestamptz,
  sessions_count bigint, sessions_last timestamptz,
  loops_open bigint, minutes_count bigint, decisions_count bigint,
  last_write timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.cid, t.display_name, t.cob_name, t.principal, t.status,
    (SELECT count(*) FROM memory_entries m WHERE m.cid = t.cid),
    (SELECT max(m.created_at) FROM memory_entries m WHERE m.cid = t.cid),
    (SELECT count(*) FROM sessions s WHERE s.cid = t.cid),
    (SELECT max(s.opened_at) FROM sessions s WHERE s.cid = t.cid),
    (SELECT count(*) FROM open_loops l WHERE l.cid = t.cid AND l.state IN ('open','blocked')),
    (SELECT count(*) FROM council_minutes c WHERE c.cid = t.cid),
    (SELECT count(*) FROM decisions d WHERE d.cid = t.cid),
    GREATEST(
      (SELECT max(m.created_at) FROM memory_entries m WHERE m.cid = t.cid),
      (SELECT max(s.opened_at) FROM sessions s WHERE s.cid = t.cid),
      (SELECT max(l.updated_at) FROM open_loops l WHERE l.cid = t.cid),
      (SELECT max(c.convened_at) FROM council_minutes c WHERE c.cid = t.cid),
      (SELECT max(d.decided_at) FROM decisions d WHERE d.cid = t.cid)
    )
  FROM tenants t
  ORDER BY t.cid;
$$;

CREATE OR REPLACE FUNCTION public.hq_records_counts_v1(_cid text)
RETURNS TABLE(register text, row_count bigint, last_write timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH keys AS (SELECT public.hq_records_keys_v1(_cid) AS k)
  SELECT 'memory_entries', count(*), max(created_at) FROM memory_entries WHERE cid = _cid
  UNION ALL SELECT 'open_loops', count(*), max(updated_at) FROM open_loops WHERE cid = _cid
  UNION ALL SELECT 'sessions', count(*), max(opened_at) FROM sessions WHERE cid = _cid
  UNION ALL SELECT 'session_checkpoints', count(*), max(created_at) FROM session_checkpoints WHERE cid = _cid
  UNION ALL SELECT 'decisions', count(*), max(decided_at) FROM decisions WHERE cid = _cid
  UNION ALL SELECT 'council_minutes', count(*), max(convened_at) FROM council_minutes WHERE cid = _cid
  UNION ALL SELECT 'improvement_signals', count(*), max(last_seen) FROM improvement_signals WHERE cid = _cid
  UNION ALL SELECT 'directives', count(*), max(created_at) FROM directives WHERE cid = _cid
  UNION ALL SELECT 'ritual_runs', count(*), max(created_at) FROM ritual_runs WHERE cid = _cid
  UNION ALL SELECT 'save_receipts', count(*), max(created_at) FROM save_receipts WHERE cid = _cid
  UNION ALL SELECT 'blueprints', count(*), max(created_at) FROM blueprints, keys WHERE tenant_id = ANY(keys.k)
  UNION ALL SELECT 'change_log', count(*), max(at) FROM change_log, keys WHERE tenant_id = ANY(keys.k)
  UNION ALL SELECT 'world_claims', count(*), max(created_at) FROM world_claims WHERE cid = _cid
  UNION ALL SELECT 'goals', count(*), max(created_at) FROM goals WHERE cid = _cid
  UNION ALL SELECT 'storyline', count(*), max(created_at) FROM storyline WHERE cid = _cid
  UNION ALL SELECT 'document_registry', count(*), max(created_at) FROM document_registry WHERE cid = _cid;
$$;

REVOKE ALL ON FUNCTION public.hq_records_keys_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hq_records_fleet_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hq_records_counts_v1(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hq_records_keys_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hq_records_fleet_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.hq_records_counts_v1(text) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.hq_records_keys_v1(text) FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON FUNCTION public.hq_records_fleet_v1() FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON FUNCTION public.hq_records_counts_v1(text) FROM sandbox_exec';
  END IF;
END $$;