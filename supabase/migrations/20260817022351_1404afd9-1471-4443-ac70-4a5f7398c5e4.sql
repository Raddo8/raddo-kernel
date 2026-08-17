-- HARDEN-15 Q1 · work_dispose accepts p_cid, exactly as board_respond does.
-- Adding a defaulted trailing parameter would create an ambiguous overload
-- (as record_probe did in J3), so the old signature is dropped and one
-- function is recreated.
DROP FUNCTION IF EXISTS public.work_dispose(uuid, text, text, boolean, text, text);

CREATE OR REPLACE FUNCTION public.work_dispose(
  p_work uuid,
  p_disposition text,
  p_reason text DEFAULT NULL::text,
  p_principal_acts boolean DEFAULT NULL::boolean,
  p_date_kind text DEFAULT NULL::text,
  p_lane text DEFAULT NULL::text,
  p_cid text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cid text;
  v_caller_cid text;
  v_role text;
  v_svc boolean;
  v_date_kinds text[] := array['hard_deadline','scheduled_event','target','window','reference','expected_next'];
begin
  select cid into v_cid from work_item where work_id = p_work;
  if v_cid is null then raise exception 'WORK_ITEM_NOT_FOUND: %', p_work using errcode='23503'; end if;

  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  v_svc  := v_role = 'service_role' or current_user in ('postgres','supabase_admin');

  -- Authority · a service_role caller may DECLARE which client it acts for,
  -- because auth.uid() is null on that path and current_cid() cannot resolve.
  -- Declaring widens who may name a tenant, never which tenant may be touched:
  -- the declared cid must equal the row's own cid.
  if p_cid is not null then
    if not v_svc then
      raise exception 'BOARD_CID_NOT_ACCEPTED_FROM_CLIENT: p_cid is accepted only from a service_role caller.'
        using errcode='42501';
    end if;
    if p_cid is distinct from v_cid then
      raise exception 'CROSS_TENANT_REFUSED: this item belongs to another client and you are not on the operator ledger.'
        using errcode='42501';
    end if;
    v_caller_cid := p_cid;
  else
    v_caller_cid := public.current_cid();
  end if;

  if v_caller_cid is distinct from v_cid then
    if not public.operator_read_guard(v_cid, 'work_dispose') then
      raise exception 'CROSS_TENANT_REFUSED: this item belongs to another client and you are not on the operator ledger.'
        using errcode='42501';
    end if;
  end if;

  if p_lane is not null and lower(btrim(p_lane)) = any(v_date_kinds) then
    raise exception 'LANE_IS_NOT_A_DATE_KIND: "%" is a date kind, not a lane. Pass it as p_date_kind. p_lane carries the client''s own lanes, such as legal or sales.',
      p_lane using errcode='22023';
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
           lane = coalesce(nullif(btrim(p_lane),''), lane),
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
                         lane = coalesce(nullif(btrim(p_lane),''), lane),
                         updated_at = now()
     where work_id = p_work;
    perform public.work_sync_loops(v_cid);

  else
    raise exception 'DISPOSITION_UNKNOWN: % (tracked|forgotten)', p_disposition using errcode='22023';
  end if;

  return jsonb_build_object('ok',true,'work_id',p_work,'cid',v_cid,'disposition',p_disposition,
    'date_kind',p_date_kind,'lane',p_lane,'reason',p_reason,'retrievable',true);
end $function$;

COMMENT ON FUNCTION public.work_dispose(uuid,text,text,boolean,text,text,text) IS
  'Disposes a work item. p_cid lets a service_role connector declare the client it acts for (auth.uid() is null on that path); the declared cid must match the row cid. Without p_cid the HQ browser path resolves through current_cid() exactly as before.';

-- HARDEN-15 Q2 · revert_change carries the identical defect, latent today.
DROP FUNCTION IF EXISTS public.revert_change(bigint, text);

CREATE OR REPLACE FUNCTION public.revert_change(p_ledger_id bigint, p_reason text, p_cid text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare l change_ledger%rowtype; v_cid text; v_key text; v_cols text; v_new bigint;
        v_svc boolean; v_rows int; v_where text;
begin
  select * into l from change_ledger where ledger_id = p_ledger_id;
  if l.ledger_id is null then raise exception 'REVERT_UNKNOWN_CHANGE: %', p_ledger_id using errcode='23503'; end if;

  v_svc := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','') = 'service_role'
           or current_user in ('postgres','supabase_admin');

  if p_cid is not null then
    if not v_svc then
      raise exception 'BOARD_CID_NOT_ACCEPTED_FROM_CLIENT: p_cid is accepted only from a service_role caller.'
        using errcode='42501';
    end if;
    if p_cid is distinct from l.cid then
      raise exception 'CROSS_TENANT_REFUSED: that change belongs to another client and you are not on the operator ledger.'
        using errcode='42501';
    end if;
    v_cid := p_cid;
  else
    v_cid := current_cid();
  end if;

  if not v_svc and l.cid is distinct from v_cid and not is_fleet_operator() then
    raise exception 'REVERT_DENIED: that change belongs to another tenant' using errcode='42501'; end if;
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
end $function$;