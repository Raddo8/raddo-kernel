CREATE OR REPLACE FUNCTION public.cob_tool_problem_raise(
  p_cid text,
  p_tool text,
  p_failure_mode text,
  p_detail text,
  p_elapsed_seconds numeric DEFAULT NULL,
  p_transport_detail text DEFAULT NULL,
  p_surface text DEFAULT 'mcp'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_id uuid; v_key text;
begin
  if p_failure_mode is null or p_failure_mode not in ('TIMEOUT','REFUSED','ERRORED','UNREACHABLE') then
    raise exception 'SIGNAL_FAILURE_MODE_REQUIRED: name it TIMEOUT, REFUSED, ERRORED or UNREACHABLE.' using errcode='22023';
  end if;
  v_key := 'tool_' || lower(p_failure_mode) || '_' || regexp_replace(lower(coalesce(p_tool,'unknown')), '[^a-z0-9_]+', '_', 'g');
  insert into improvement_signals
    (cid, curn, signal_key, pattern, detail_md, audience, silent, status, provenance,
     source_surface, source_subject, tenancy, classification, caller,
     failure_mode, elapsed_seconds, transport_detail, subject_tool)
  values
    (p_cid, public.next_curn(p_cid, 'S'), v_key, v_key, p_detail, 'operator', false, 'open', 'cob_tool_problem_raise',
     p_surface, p_tool, 'TENANT', 'tool_problem', 'cob_tool_problem_raise',
     p_failure_mode, p_elapsed_seconds, p_transport_detail, p_tool)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'failure_mode', p_failure_mode,
                            'tool', p_tool, 'elapsed_seconds', p_elapsed_seconds);
end $$;