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

  -- Same source rows and same projected fields the board renders, read-only.
  WITH src AS (
    SELECT o.*, w.due_date AS work_due_date, w.date_kind AS work_date_kind, w.lane AS work_lane
      FROM public.open_loops o
      LEFT JOIN public.work_item w ON w.work_id = o.work_id AND w.cid = o.cid
     WHERE o.cid = p_cid AND o.brief_status = 'open'
       AND (o.snooze_until IS NULL OR o.snooze_until <= current_date)
       AND o.superseded_by IS NULL AND o.principal_acts IS NOT FALSE
     ORDER BY (o.principal_acts IS NULL), o.state NULLS LAST, o.created_at
     LIMIT 200
  ), j AS (
    SELECT row_number() OVER () rn,
           jsonb_build_object('id',id,'work_id',work_id,'title',title,'trigger',trigger,'owner',owner,
             'state',state,'brief_status',brief_status,'surfaced_count',surfaced_count,
             'snooze_until',snooze_until,'hard_deadline',hard_deadline,'due_date',work_due_date,
             'date_kind',work_date_kind,'lane',work_lane,'urgent',urgent,'urgent_reason',urgent_reason,
             'escalation_state',escalation_state,'created_at',created_at) itm
      FROM src
  )
  SELECT coalesce(jsonb_agg(itm) FILTER (WHERE true),'[]'::jsonb),
         coalesce(jsonb_agg(itm) FILTER (WHERE rn <= 40),'[]'::jsonb)
    INTO v_board_full, v_board_scoped FROM j;

  v_mem_full   := public.memory_module_read(p_cid, 60);
  v_mem_scoped := public.memory_module_read(p_cid, 25);
  v_disp_full   := public.work_disposition_queue(p_cid, 50);
  v_disp_scoped := public.work_disposition_queue(p_cid, 25);

  b_conf := octet_length(v_kernel::text) + octet_length(v_doctrine::text) + octet_length(v_directives::text);
  b_full := b_conf + octet_length(v_board_full::text)
          + octet_length(coalesce(v_mem_full,'null'::jsonb)::text) + octet_length(coalesce(v_disp_full,'null'::jsonb)::text);
  b_scoped := b_conf + octet_length(v_board_scoped::text)
          + octet_length(coalesce(v_mem_scoped,'null'::jsonb)::text) + octet_length(coalesce(v_disp_scoped,'null'::jsonb)::text);

  RETURN jsonb_build_object(
    'cid', p_cid,
    'kernel_parts', jsonb_array_length(v_kernel),
    'board_rows_unscoped', jsonb_array_length(v_board_full),
    'board_rows_scoped', jsonb_array_length(v_board_scoped),
    'configuration_bytes', b_conf,
    'production_bytes_unscoped', b_full - b_conf,
    'production_bytes_scoped', b_scoped - b_conf,
    'payload_bytes_unscoped', b_full,
    'payload_bytes_scoped', b_scoped,
    'bytes_saved', b_full - b_scoped,
    'method', 'Composes the projections begin_session sends (kernel parts, doctrine, standing rules, board rows, memory module, disposition queue) at the caps it used (board 200 / memory 60 / disposition 50) and the caps it now uses (board 40 / memory 25 / disposition 25). Configuration identical in both. Read-only: no surfacing counts are bumped.');
END;
$$;