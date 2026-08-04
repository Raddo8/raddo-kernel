
-- ── M2 · memory status vocabulary ────────────────────────────────────────
ALTER TABLE public.memory_entries
  ADD CONSTRAINT memory_entries_status_vocab
  CHECK (status IN ('active','review','superseded','binned'));

-- ── Read projections (SECURITY DEFINER; tables stay service-role-only) ──
CREATE OR REPLACE FUNCTION public.hq_memory_read(p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, category text, title text, body_md text, confidence numeric,
              status text, created_at timestamptz, updated_at timestamptz,
              created_by text, session_id uuid, notion_block_ref text, supersedes uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_cid text;
BEGIN
  v_cid := public.current_cid();
  IF v_cid IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT m.id, m.category, m.title, m.body_md, m.confidence, m.status,
           m.created_at, m.updated_at, m.created_by, m.session_id, m.notion_block_ref,
           (SELECT o.id FROM public.memory_entries o WHERE o.superseded_by = m.id LIMIT 1)
    FROM public.memory_entries m
    WHERE m.cid = v_cid AND m.status IN ('active','review') AND m.superseded_by IS NULL
    ORDER BY m.category NULLS LAST, m.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit,200), 1000)) OFFSET greatest(0, coalesce(p_offset,0));
END; $$;

CREATE OR REPLACE FUNCTION public.hq_memory_counts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_cid text; v jsonb;
BEGIN
  v_cid := public.current_cid();
  IF v_cid IS NULL THEN RETURN jsonb_build_object('active',0,'review',0,'superseded',0,'binned',0,'total',0); END IF;
  SELECT jsonb_build_object(
    'active',    count(*) FILTER (WHERE status='active'),
    'review',    count(*) FILTER (WHERE status='review'),
    'superseded',count(*) FILTER (WHERE status='superseded'),
    'binned',    count(*) FILTER (WHERE status='binned'),
    'total',     count(*)
  ) INTO v FROM public.memory_entries WHERE cid = v_cid;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.hq_memory_search(p_q text, p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, category text, title text, body_md text, confidence numeric,
              status text, created_at timestamptz, rank real)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_cid text; v_q tsquery;
BEGIN
  v_cid := public.current_cid();
  IF v_cid IS NULL OR p_q IS NULL OR btrim(p_q) = '' THEN RETURN; END IF;
  v_q := websearch_to_tsquery('english', p_q);
  RETURN QUERY
    SELECT m.id, m.category, m.title, m.body_md, m.confidence, m.status, m.created_at,
           ts_rank(to_tsvector('english', coalesce(m.title,'') || ' ' || coalesce(m.body_md,'')), v_q)
    FROM public.memory_entries m
    WHERE m.cid = v_cid
      AND m.status <> 'binned'
      AND to_tsvector('english', coalesce(m.title,'') || ' ' || coalesce(m.body_md,'')) @@ v_q
    ORDER BY 8 DESC, m.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit,50), 200));
END; $$;

CREATE OR REPLACE FUNCTION public.hq_memory_lineage(p_limit integer DEFAULT 100)
RETURNS TABLE(old_id uuid, old_title text, old_category text, old_created_at timestamptz,
              superseded_at timestamptz, new_id uuid, new_title text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_cid text;
BEGIN
  v_cid := public.current_cid();
  IF v_cid IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT o.id, o.title, o.category, o.created_at, o.updated_at, n.id, n.title
    FROM public.memory_entries o
    JOIN public.memory_entries n ON n.id = o.superseded_by
    WHERE o.cid = v_cid
    ORDER BY o.updated_at DESC
    LIMIT greatest(1, least(coalesce(p_limit,100), 500));
END; $$;

-- ── Service-role module read (used by begin_session / machine callers) ──
CREATE OR REPLACE FUNCTION public.memory_module_read(p_cid text, p_limit integer DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_items jsonb; v_counts jsonb;
BEGIN
  IF p_cid IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'active',    count(*) FILTER (WHERE status='active'),
    'review',    count(*) FILTER (WHERE status='review'),
    'superseded',count(*) FILTER (WHERE status='superseded'),
    'binned',    count(*) FILTER (WHERE status='binned'),
    'total',     count(*)
  ) INTO v_counts FROM public.memory_entries WHERE cid = p_cid;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'id', m.id, 'category', m.category, 'title', m.title,
      'body_md', m.body_md, 'confidence', m.confidence, 'status', m.status,
      'created_at', m.created_at, 'created_by', m.created_by,
      'session_id', m.session_id, 'notion_block_ref', m.notion_block_ref,
      'supersedes', (SELECT o.id FROM public.memory_entries o WHERE o.superseded_by = m.id LIMIT 1)
    ) AS x
    FROM public.memory_entries m
    WHERE m.cid = p_cid AND m.status IN ('active','review') AND m.superseded_by IS NULL
    ORDER BY m.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit,40), 200))
  ) s;
  RETURN jsonb_build_object('counts', v_counts, 'returned', jsonb_array_length(v_items), 'items', v_items);
END; $$;

CREATE OR REPLACE FUNCTION public.memory_search_read(p_cid text, p_q text, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v jsonb; v_q tsquery;
BEGIN
  IF p_cid IS NULL OR p_q IS NULL OR btrim(p_q) = '' THEN RETURN jsonb_build_object('hits','[]'::jsonb,'returned',0); END IF;
  v_q := websearch_to_tsquery('english', p_q);
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object('id', m.id, 'title', m.title, 'category', m.category,
             'status', m.status, 'confidence', m.confidence, 'created_at', m.created_at,
             'body_md', m.body_md) AS x
    FROM public.memory_entries m
    WHERE m.cid = p_cid AND m.status <> 'binned'
      AND to_tsvector('english', coalesce(m.title,'') || ' ' || coalesce(m.body_md,'')) @@ v_q
    ORDER BY ts_rank(to_tsvector('english', coalesce(m.title,'') || ' ' || coalesce(m.body_md,'')), v_q) DESC,
             m.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit,20), 100))
  ) s;
  RETURN jsonb_build_object('hits', v, 'returned', jsonb_array_length(v));
END; $$;

-- ── Signal helper ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.memory_signal(p_tenant text, p_entity_id uuid, p_change text, p_summary text, p_actor text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.change_log (tenant_id, entity, entity_id, change, summary, actor)
  VALUES (p_tenant, 'memory', p_entity_id, p_change, p_summary, coalesce(p_actor,'system'))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- ── Governed writes · receipts-first ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.memory_write_v1(
  p_cid text, p_title text, p_body_md text, p_category text DEFAULT NULL,
  p_confidence numeric DEFAULT 0.8, p_actor text DEFAULT NULL,
  p_session_id uuid DEFAULT NULL, p_notion_block_ref text DEFAULT NULL,
  p_status text DEFAULT 'active')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_tenant text; v_id uuid; v_sig uuid;
BEGIN
  IF p_cid IS NULL THEN RAISE EXCEPTION 'MEMORY_CID_REQUIRED' USING errcode='22023'; END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'MEMORY_TITLE_REQUIRED' USING errcode='22023'; END IF;
  IF p_status NOT IN ('active','review') THEN RAISE EXCEPTION 'MEMORY_BAD_INITIAL_STATUS: %', p_status USING errcode='22023'; END IF;
  SELECT coalesce(t.display_name, p_cid) INTO v_tenant FROM public.tenants t WHERE t.cid = p_cid;
  v_tenant := coalesce(v_tenant, p_cid);
  INSERT INTO public.memory_entries (tenant, cid, session_id, category, title, body_md, confidence, status, notion_block_ref, created_by)
  VALUES (v_tenant, p_cid, p_session_id, p_category, p_title, coalesce(p_body_md,''), coalesce(p_confidence,0.8), p_status, p_notion_block_ref, p_actor)
  RETURNING id INTO v_id;
  v_sig := public.memory_signal(v_tenant, v_id, 'created', left(p_title, 200), p_actor);
  RETURN jsonb_build_object(
    'id', v_id, 'cid', p_cid, 'status', p_status, 'change_log_id', v_sig,
    'octet_length', octet_length(coalesce(p_body_md,'')),
    'sha256', encode(digest(coalesce(p_title,'') || coalesce(p_body_md,''), 'sha256'), 'hex'));
END; $$;

CREATE OR REPLACE FUNCTION public.memory_edit_v1(
  p_cid text, p_id uuid, p_title text DEFAULT NULL, p_body_md text DEFAULT NULL,
  p_category text DEFAULT NULL, p_confidence numeric DEFAULT NULL, p_actor text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r public.memory_entries; v_sig uuid;
BEGIN
  SELECT * INTO r FROM public.memory_entries WHERE id = p_id AND cid = p_cid;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMORY_NOT_FOUND_FOR_CID' USING errcode='02000'; END IF;
  UPDATE public.memory_entries SET
    title = coalesce(p_title, title),
    body_md = coalesce(p_body_md, body_md),
    category = coalesce(p_category, category),
    confidence = coalesce(p_confidence, confidence),
    updated_at = now()
  WHERE id = p_id RETURNING * INTO r;
  v_sig := public.memory_signal(r.tenant, r.id, 'edited', left(r.title, 200), p_actor);
  RETURN jsonb_build_object('id', r.id, 'status', r.status, 'change_log_id', v_sig,
    'octet_length', octet_length(r.body_md),
    'sha256', encode(digest(r.title || r.body_md, 'sha256'), 'hex'));
END; $$;

CREATE OR REPLACE FUNCTION public.memory_set_status_v1(
  p_cid text, p_id uuid, p_status text, p_actor text DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r public.memory_entries; v_sig uuid; v_change text;
BEGIN
  IF p_status NOT IN ('active','review','binned') THEN
    RAISE EXCEPTION 'MEMORY_STATUS_NOT_SETTABLE: % (supersede via memory_supersede_v1)', p_status USING errcode='22023';
  END IF;
  SELECT * INTO r FROM public.memory_entries WHERE id = p_id AND cid = p_cid;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMORY_NOT_FOUND_FOR_CID' USING errcode='02000'; END IF;
  IF r.status = 'superseded' THEN RAISE EXCEPTION 'MEMORY_SUPERSEDED_IMMUTABLE' USING errcode='22023'; END IF;
  UPDATE public.memory_entries SET status = p_status, updated_at = now() WHERE id = p_id RETURNING * INTO r;
  v_change := CASE WHEN p_status = 'binned' THEN 'binned'
                   WHEN p_status = 'active' THEN 'confirmed'
                   ELSE 'review' END;
  v_sig := public.memory_signal(r.tenant, r.id, v_change, coalesce(p_reason, left(r.title,200)), p_actor);
  RETURN jsonb_build_object('id', r.id, 'status', r.status, 'change_log_id', v_sig,
    'octet_length', octet_length(r.body_md),
    'sha256', encode(digest(r.title || r.body_md, 'sha256'), 'hex'));
END; $$;

CREATE OR REPLACE FUNCTION public.memory_supersede_v1(
  p_cid text, p_old_id uuid, p_title text, p_body_md text,
  p_category text DEFAULT NULL, p_confidence numeric DEFAULT 0.8,
  p_actor text DEFAULT NULL, p_session_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE old public.memory_entries; v_new jsonb; v_new_id uuid; v_sig uuid;
BEGIN
  SELECT * INTO old FROM public.memory_entries WHERE id = p_old_id AND cid = p_cid;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMORY_NOT_FOUND_FOR_CID' USING errcode='02000'; END IF;
  IF old.status = 'superseded' THEN RAISE EXCEPTION 'MEMORY_ALREADY_SUPERSEDED' USING errcode='22023'; END IF;
  v_new := public.memory_write_v1(p_cid, p_title, p_body_md, coalesce(p_category, old.category),
                                  p_confidence, p_actor, p_session_id, NULL, 'active');
  v_new_id := (v_new->>'id')::uuid;
  UPDATE public.memory_entries
     SET status = 'superseded', superseded_by = v_new_id, updated_at = now()
   WHERE id = p_old_id;
  v_sig := public.memory_signal(old.tenant, p_old_id, 'superseded',
             'superseded by ' || v_new_id::text, p_actor);
  RETURN jsonb_build_object('new', v_new, 'superseded_id', p_old_id,
    'superseded_change_log_id', v_sig, 'lineage_set', true);
END; $$;

-- ── Grants · no anon, no PUBLIC on any memory object ─────────────────────
REVOKE ALL ON FUNCTION public.hq_memory_read(integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hq_memory_counts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hq_memory_search(text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hq_memory_lineage(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.memory_module_read(text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.memory_search_read(text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.memory_signal(text,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.memory_write_v1(text,text,text,text,numeric,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.memory_edit_v1(text,uuid,text,text,text,numeric,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.memory_set_status_v1(text,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.memory_supersede_v1(text,uuid,text,text,text,numeric,text,uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hq_memory_read(integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hq_memory_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hq_memory_search(text,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hq_memory_lineage(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.memory_module_read(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.memory_search_read(text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.memory_signal(text,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.memory_write_v1(text,text,text,text,numeric,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.memory_edit_v1(text,uuid,text,text,text,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.memory_set_status_v1(text,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.memory_supersede_v1(text,uuid,text,text,text,numeric,text,uuid) TO service_role;
