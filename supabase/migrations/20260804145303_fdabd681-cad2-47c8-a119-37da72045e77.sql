
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
    'sha256', encode(sha256(convert_to(coalesce(p_title,'') || coalesce(p_body_md,''), 'UTF8')), 'hex'));
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
    'sha256', encode(sha256(convert_to(r.title || r.body_md, 'UTF8')), 'hex'));
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
  RETURN jsonb_build_object('id', r.id, 'status', r.status, 'change', v_change, 'change_log_id', v_sig,
    'octet_length', octet_length(r.body_md),
    'sha256', encode(sha256(convert_to(r.title || r.body_md, 'UTF8')), 'hex'));
END; $$;
