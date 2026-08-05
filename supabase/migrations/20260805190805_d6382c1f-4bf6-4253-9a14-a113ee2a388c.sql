DROP FUNCTION IF EXISTS public.hq_memory_read(integer, integer);

CREATE OR REPLACE FUNCTION public.hq_memory_read(p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, category text, lane text, title text, body_md text, confidence numeric, status text, created_at timestamp with time zone, updated_at timestamp with time zone, created_by text, session_id uuid, notion_block_ref text, supersedes uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cid text;
BEGIN
  v_cid := public.current_cid();
  IF v_cid IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT m.id, m.category, m.lane, m.title, m.body_md, m.confidence, m.status,
           m.created_at, m.updated_at, m.created_by, m.session_id, m.notion_block_ref,
           (SELECT o.id FROM public.memory_entries o WHERE o.superseded_by = m.id LIMIT 1)
    FROM public.memory_entries m
    WHERE m.cid = v_cid AND m.status IN ('active','review') AND m.superseded_by IS NULL
    ORDER BY m.created_at DESC NULLS LAST
    LIMIT greatest(1, least(coalesce(p_limit,200), 1000)) OFFSET greatest(0, coalesce(p_offset,0));
END; $function$;

REVOKE ALL ON FUNCTION public.hq_memory_read(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hq_memory_read(integer, integer) TO authenticated, service_role;