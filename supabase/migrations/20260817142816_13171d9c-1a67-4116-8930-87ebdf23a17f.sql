-- HARDEN-15 CORRECTION · R1/R2/R3 · withdraw p_cid, distinguish NOT_BOOTED, expose lane properly

DROP FUNCTION IF EXISTS public.work_dispose(uuid, text, text, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.work_dispose(uuid, text, text, boolean, text, text);

CREATE FUNCTION public.work_dispose(
  p_work uuid,
  p_disposition text,
  p_reason text DEFAULT NULL,
  p_principal_acts boolean DEFAULT NULL,
  p_date_kind text DEFAULT NULL,
  p_lane text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  v_cid text; v_lane text; v_known text[];
  v_date_kinds text[] := array['hard_deadline','scheduled_event','target','window','reference','expected_next'];
begin
  select cid into v_cid from work_item where work_id = p_work;
  if v_cid is null then raise exception 'WORK_ITEM_NOT_FOUND: %', p_work using errcode='23503'; end if;

  -- R1 · NOT_BOOTED and CROSS_TENANT_REFUSED are different states with
  -- opposite remedies. resolve_write_cid never conflates them.
  perform public.resolve_write_cid(v_cid, 'work_dispose');

  v_lane := nullif(btrim(coalesce(p_lane,'')),'');
  if v_lane is not null then
    if lower(v_lane) = any(v_date_kinds) then
      raise exception 'LANE_IS_NOT_A_DATE_KIND: "%" is a date kind, not a lane. Pass it as p_date_kind. p_lane carries this client''s own business lanes.',
        v_lane using errcode='22023';
    end if;
    -- R3b · validated against this tenant's real lane set, never a hardcoded list.
    v_known := public.tenant_lanes(v_cid);
    if array_length(v_known,1) is not null and not (v_lane = any(v_known)) then
      raise exception 'LANE_UNKNOWN: "%" is not one of this client''s lanes. Known lanes: %.',
        v_lane, array_to_string(v_known, ', ') using errcode='22023';
    end if;
  end if;

  if p_disposition = 'tracked' then
    if p_principal_acts is null then
      raise exception 'DISPOSITION_INCOMPLETE: tracking an item requires saying whether the principal is the one who must move.'
        using errcode='22023'; end if;
    if p_date_kind is not null and p_date_kind <> all(v_date_kinds) then
      raise exception 'DISPOSITION_DATE_KIND_UNKNOWN: % (hard_deadline|scheduled_event|target|window|reference|expected_next)', p_date_kind
        using errcode='22023'; end if;
    update work_item
       set principal_acts = p_principal_acts,
           date_kind = coalesce(p_date_kind, date_kind, 'target'),
           lane = coalesce(v_lane, lane),
           updated_at = now()
     where work_id = p_work;
    perform public.work_score(v_cid);
    perform public.work_sync_loops(v_cid);
  elsif p_disposition = 'forgotten' then
    if p_reason is null or btrim(p_reason)='' then
      raise exception 'DISPOSITION_REASON_REQUIRED: forgetting an item requires a reason. An item that vanishes without one is data loss, not triage.'
        using errcode='22023'; end if;
    perform public.work_close(p_work, 'dropped', p_reason, null, null);
    update work_item set principal_acts = coalesce(principal_acts,false),
                         lane = coalesce(v_lane, lane),
                         updated_at = now()
     where work_id = p_work;
    perform public.work_sync_loops(v_cid);
  else
    raise exception 'DISPOSITION_UNKNOWN: % (tracked|forgotten)', p_disposition using errcode='22023';
  end if;

  return jsonb_build_object('ok',true,'work_id',p_work,'cid',v_cid,'disposition',p_disposition,
    'date_kind',p_date_kind,'lane',v_lane,'reason',p_reason,'retrievable',true);
end $$;

GRANT EXECUTE ON FUNCTION public.work_dispose(uuid,text,text,boolean,text,text) TO authenticated, service_role;

-- Q2 withdrawn · revert_change resolves through the same boot-aware path.
DROP FUNCTION IF EXISTS public.revert_change(bigint, text, text);

CREATE FUNCTION public.revert_change(p_ledger_id bigint, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare l change_ledger%rowtype; v_cid text; v_key text; v_cols text; v_new bigint;
        v_rows int; v_where text;
begin
  select * into l from change_ledger where ledger_id = p_ledger_id;
  if l.ledger_id is null then raise exception 'REVERT_UNKNOWN_CHANGE: %', p_ledger_id using errcode='23503'; end if;

  v_cid := public.resolve_write_cid(l.cid, 'revert_change');

  if l.reverted_by is not null then
    raise exception 'REVERT_ALREADY_DONE: change % was already reverted by %', p_ledger_id, l.reverted_by using errcode='23505'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'REVERT_NEEDS_REASON: say why, it goes in the record' using errcode='22023'; end if;

  v_key := coalesce(l.pk_col, 'id');
  v_where := format('%I = %L', v_key, l.row_pk);
  if l.cid is not null and exists (select 1 from information_schema.columns
        where table_schema='public' and table_name=l.table_name and column_name='cid') then
    v_where := v_where || format(' and cid = %L', l.cid);
  end if;

  perform set_config('cob.reason', 'revert of change '||p_ledger_id||': '||p_reason, true);

  if l.op = 'INSERT' then
    if exists (select 1 from information_schema.columns
                where table_schema='public' and table_name=l.table_name and column_name='status') then
      execute format('update public.%I set status=%L where %s', l.table_name, 'voided', v_where);
    else
      execute format('delete from public.%I where %s', l.table_name, v_where);
    end if;
  elsif l.op = 'DELETE' then
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
                   l.table_name, l.table_name) using l.before_row;
  else
    select string_agg(format('%I = ($1->>%L)::%s', key, key,
             (select data_type from information_schema.columns c
               where c.table_schema='public' and c.table_name=l.table_name and c.column_name=key)), ', ')
      into v_cols
      from jsonb_object_keys(l.before_row) key
     where key <> v_key
       and exists (select 1 from information_schema.columns c
                    where c.table_schema='public' and c.table_name=l.table_name and c.column_name=key);
    execute format('update public.%I set %s where %s', l.table_name, v_cols, v_where) using l.before_row;
  end if;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    perform set_config('cob.reason', '', true);
    raise exception 'REVERT_MATCHED_NOTHING: change % targeted %.% = %, and no row matched. Nothing was changed.',
      p_ledger_id, l.table_name, v_key, l.row_pk using errcode='02000';
  end if;

  select ledger_id into v_new from change_ledger
   where table_name=l.table_name and row_pk=l.row_pk order by ledger_id desc limit 1;
  if v_new is distinct from p_ledger_id then
    update change_ledger set op='REVERT', reverts=p_ledger_id where ledger_id=v_new;
    update change_ledger set reverted_by=v_new where ledger_id=p_ledger_id;
  else
    perform set_config('cob.reason', '', true);
    raise exception 'REVERT_LEFT_NO_TRACE: the write produced no new ledger row, so the revert is not auditable and has been rolled back.' using errcode='02000';
  end if;
  perform set_config('cob.reason', '', true);

  return jsonb_build_object('ok',true,'rows_changed',v_rows,'reverted',p_ledger_id,
    'new_change',v_new,'table',l.table_name,'record',l.row_pk,'reason',p_reason);
end $$;

GRANT EXECUTE ON FUNCTION public.revert_change(bigint,text) TO authenticated, service_role;