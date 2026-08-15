CREATE OR REPLACE FUNCTION public.boot_payload_measure(p_cid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text;
  v_kernel jsonb; v_doctrine jsonb; v_directives jsonb;
  v_board_full jsonb; v_board_scoped jsonb;
  v_brief_full jsonb; v_brief_scoped jsonb;
  v_mem_full jsonb; v_mem_scoped jsonb;
  v_disp_full jsonb; v_disp_scoped jsonb;
  b_conf bigint; b_full bigint; b_scoped bigint;
BEGIN
  SELECT tenant INTO v_tenant FROM public.memory_entries WHERE cid = p_cid AND tenant IS NOT NULL LIMIT 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object('part',kp.part,'seq',kp.seq,'sha256',kp.sha256,
                                               'bytes',kp.bytes,'content_md',kp.content_md)
                            ORDER BY kp.part, kp.seq),'[]'::jsonb)
    INTO v_kernel
    FROM public.kernel_parts kp JOIN public.kernels k ON k.id = kp.kernel_id
   WHERE k.cid = p_cid AND k.status = 'active';

  SELECT coalesce(jsonb_agg(jsonb_build_object('key',d.rule_key,'text',d.rule_text,'tier',d.tier,'scope',d.scope)),'[]'::jsonb)
    INTO v_doctrine FROM public.doctrine_rules d WHERE d.cid = p_cid;

  SELECT coalesce(jsonb_agg(jsonb_build_object('text',x.text,'scope',x.scope,'rank',x.rank)),'[]'::jsonb)
    INTO v_directives FROM public.directives x WHERE x.tenant_id = coalesce(v_tenant,'~none~');

  v_board_full   := public.board_render(p_cid, false, 200);
  v_board_scoped := public.board_render(p_cid, false, 40);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',i->>'id','title',i->>'title','trigger',i->>'trigger',
           'owner',i->>'owner','state',i->>'state','surfaced_count',i->>'surfaced_count',
           'snooze_until',i->>'snooze_until','notion_page_id',i->>'notion_page_id','created_at',i->>'created_at')),'[]'::jsonb)
    INTO v_brief_full FROM jsonb_array_elements(coalesce(v_board_full->'items','[]'::jsonb)) i;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',i->>'id','title',i->>'title','trigger',i->>'trigger',
           'owner',i->>'owner','state',i->>'state','surfaced_count',i->>'surfaced_count',
           'snooze_until',i->>'snooze_until','notion_page_id',i->>'notion_page_id','created_at',i->>'created_at')),'[]'::jsonb)
    INTO v_brief_scoped FROM jsonb_array_elements(coalesce(v_board_scoped->'items','[]'::jsonb)) i;

  v_mem_full   := public.memory_module_read(p_cid, 60);
  v_mem_scoped := public.memory_module_read(p_cid, 25);
  v_disp_full   := public.work_disposition_queue(p_cid, 50);
  v_disp_scoped := public.work_disposition_queue(p_cid, 25);

  b_conf := octet_length(v_kernel::text) + octet_length(v_doctrine::text) + octet_length(v_directives::text);
  b_full := b_conf + octet_length(v_board_full::text) + octet_length(v_brief_full::text)
          + octet_length(coalesce(v_mem_full,'null'::jsonb)::text) + octet_length(coalesce(v_disp_full,'null'::jsonb)::text);
  b_scoped := b_conf + octet_length(v_board_scoped::text) + octet_length(v_brief_scoped::text)
          + octet_length(coalesce(v_mem_scoped,'null'::jsonb)::text) + octet_length(coalesce(v_disp_scoped,'null'::jsonb)::text);

  RETURN jsonb_build_object(
    'cid', p_cid,
    'kernel_parts', jsonb_array_length(v_kernel),
    'configuration_bytes', b_conf,
    'production_bytes_unscoped', b_full - b_conf,
    'production_bytes_scoped', b_scoped - b_conf,
    'payload_bytes_unscoped', b_full,
    'payload_bytes_scoped', b_scoped,
    'bytes_saved', b_full - b_scoped,
    'method', 'Composes the same projections begin_session sends (kernel parts, doctrine keys, standing rules, board_render, brief projection, memory module, disposition queue) at the caps it used (board 200 / memory 60 / disposition 50) and the caps it now uses (board 40 / memory 25 / disposition 25). Configuration identical in both.');
END;
$$;