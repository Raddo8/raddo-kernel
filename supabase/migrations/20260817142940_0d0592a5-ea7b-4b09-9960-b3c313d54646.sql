-- HARDEN-15 CORRECTION · R2 · boot enforcement is uniform across write tools

-- One assertion, used by writers that carry an explicit p_cid. A supplied cid
-- is a destination, never permission to skip the boot.
CREATE OR REPLACE FUNCTION public.assert_booted(p_cid text, p_tool text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v text;
begin
  v := public.current_cid();
  if v is not null and v = p_cid then return; end if;
  if public.session_boot_state(p_cid) = 'BOOTED' then return; end if;
  if v is not null and v is distinct from p_cid then
    if public.operator_read_guard(p_cid, p_tool) then return; end if;
    perform public.record_write_refusal(p_cid, p_tool, 'CROSS_TENANT_REFUSED', v, 'booted on '||v);
    raise exception 'CROSS_TENANT_REFUSED: that record belongs to another client and you are not on the operator ledger.'
      using errcode='42501';
  end if;
  perform public.record_write_refusal(p_cid, p_tool, 'NOT_BOOTED', null, 'no live session context for this client');
  raise exception 'NOT_BOOTED: this session has not loaded an identity, so it cannot write into a client world. Run begin_session and retry. This is not a permissions problem and it is not a cross-tenant refusal.'
    using errcode='55000';
end $$;

CREATE OR REPLACE FUNCTION public.session_raise(p_cid text, p_title text, p_origin text, p_principal_acts boolean DEFAULT NULL::boolean, p_detail text DEFAULT NULL::text, p_owner text DEFAULT NULL::text, p_kind text DEFAULT 'task'::text, p_due date DEFAULT NULL::date, p_session_id text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_work uuid; v_loop uuid;
begin
  if p_cid is null or btrim(p_cid)='' then raise exception 'RAISE_CID_REQUIRED' using errcode='22023'; end if;
  -- R2 · a tool that accepts p_cid still requires a booted session.
  perform public.assert_booted(p_cid, 'work_raise');
  if p_title is null or btrim(p_title)='' then raise exception 'RAISE_TITLE_REQUIRED' using errcode='22023'; end if;
  if p_origin is null or btrim(p_origin)='' then
    raise exception 'RAISE_ORIGIN_REQUIRED: origin records what raised this. An item with no origin cannot be triaged.'
      using errcode='22023'; end if;

  v_work := public.work_raise(p_cid, p_title, coalesce(p_kind,'task'), p_origin,
                              'session', coalesce(p_session_id,'unattributed'),
                              p_detail, p_owner, p_due, null);

  if p_principal_acts is not null then
    update work_item set principal_acts = p_principal_acts, updated_at = now() where work_id = v_work;
  end if;

  perform public.work_sync_loops(p_cid);
  select o.id into v_loop from open_loops o where o.work_id = v_work limit 1;

  return jsonb_build_object('ok',true,'work_id',v_work,'cid',p_cid,
    'principal_acts',p_principal_acts,
    'tracked_on_board', v_loop is not null,
    'loop_id', v_loop,
    'disposition', case when p_principal_acts is null then 'undisposed' else 'disposed' end);
end $$;

-- Probe harness · runs a call under declared JWT claims and returns the
-- refusal text instead of aborting. Evidence only, writes nothing itself.
CREATE OR REPLACE FUNCTION public.probe_write_refusal(p_claims text, p_call text, p_work uuid DEFAULT NULL, p_cid text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  perform set_config('request.jwt.claims', p_claims, true);
  begin
    if p_call = 'work_dispose' then
      perform public.work_dispose(p_work, 'tracked', null, true, 'target', null);
    elsif p_call = 'work_dispose_lane' then
      perform public.work_dispose(p_work, 'tracked', null, true, 'target', 'not-a-real-lane');
    elsif p_call = 'work_raise' then
      perform public.session_raise(p_cid, 'probe · boot enforcement', 'probe', null, null, null, 'task', null, null);
    end if;
    return 'NO_REFUSAL';
  exception when others then
    return split_part(SQLERRM, ':', 1);
  end;
end $$;

REVOKE ALL ON FUNCTION public.probe_write_refusal(text,text,uuid,text) FROM PUBLIC, anon, authenticated;