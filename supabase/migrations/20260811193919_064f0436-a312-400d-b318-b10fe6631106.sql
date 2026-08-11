-- F2/F3 substrate ────────────────────────────────────────────────────────────
ALTER TABLE public.open_loops
  ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS urgent_reason text,
  ADD COLUMN IF NOT EXISTS hard_deadline date,
  ADD COLUMN IF NOT EXISTS last_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_state text,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.open_loops(id);

DO $$ BEGIN
  ALTER TABLE public.open_loops
    ADD CONSTRAINT open_loops_escalation_state_chk
    CHECK (escalation_state IS NULL OR escalation_state IN ('flagged','mechanism_review'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- F1 · id-authoritative bulk board write ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.board_update(p_items jsonb, p_cid text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cid text; v_role text; v_item jsonb; v_id uuid; v_row_id uuid;
  v_applied jsonb := '[]'::jsonb; v_rejected jsonb := '[]'::jsonb;
  v_state text; v_status text; v_snooze date; v_today date;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  if p_cid is not null then
    if v_role <> 'service_role' then
      raise exception 'BOARD_CID_NOT_ACCEPTED_FROM_CLIENT: p_cid is accepted only from a service_role caller.' using errcode='42501'; end if;
    v_cid := p_cid;
  else
    v_cid := public.current_cid();
  end if;
  if v_cid is null then
    raise exception 'BOARD_UNAUTHENTICATED: no resolvable CID' using errcode='28000'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'BOARD_ITEMS_REQUIRED: pass items as a JSON array.' using errcode='22023'; end if;

  v_today := (now() at time zone 'UTC')::date;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := null; v_snooze := null; v_row_id := null;
    begin
      v_id := nullif(btrim(coalesce(v_item->>'id','')),'')::uuid;
    exception when others then v_id := null; end;
    if v_id is null then
      v_rejected := v_rejected || jsonb_build_object('item', v_item, 'reason', 'BOARD_ITEM_ID_REQUIRED');
      continue;
    end if;

    v_status := nullif(lower(btrim(coalesce(v_item->>'brief_status',''))),'');
    if v_status is not null and v_status not in ('open','answered','snoozed','cleared') then
      v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_STATUS_UNKNOWN', 'detail', v_status);
      continue;
    end if;

    if coalesce(btrim(v_item->>'snooze_until'),'') <> '' then
      begin v_snooze := (v_item->>'snooze_until')::date;
      exception when others then
        v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_SNOOZE_DATE_MALFORMED', 'detail', v_item->>'snooze_until');
        continue;
      end;
      if v_snooze < v_today then
        v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_SNOOZE_DATE_PAST', 'detail', v_snooze::text);
        continue;
      end if;
    end if;
    if v_status = 'snoozed' and v_snooze is null then
      v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_SNOOZE_DATE_REQUIRED',
        'detail', 'say when it should come back; a snooze without a date is not stored');
      continue;
    end if;

    v_state := nullif(lower(btrim(coalesce(v_item->>'state',''))),'');

    update open_loops o
       set title        = coalesce(nullif(btrim(coalesce(v_item->>'title','')),''), o.title),
           trigger      = coalesce(nullif(btrim(coalesce(v_item->>'trigger','')),''), o.trigger),
           owner        = coalesce(nullif(btrim(coalesce(v_item->>'owner','')),''), o.owner),
           state        = coalesce(v_state, o.state),
           brief_status = coalesce(v_status, o.brief_status),
           snooze_until = case when v_status = 'snoozed' then v_snooze else coalesce(v_snooze, o.snooze_until) end,
           urgent       = coalesce((v_item->>'urgent')::boolean, o.urgent),
           urgent_reason= coalesce(nullif(btrim(coalesce(v_item->>'urgent_reason','')),''), o.urgent_reason),
           hard_deadline= coalesce(nullif(btrim(coalesce(v_item->>'hard_deadline','')),'')::date, o.hard_deadline),
           last_action_at = now(),
           escalation_state = case when v_status in ('answered','cleared','snoozed') or v_state in ('done','dropped')
                                   then null else o.escalation_state end,
           updated_at   = now()
     where o.id = v_id and o.cid = v_cid
    returning o.id into v_row_id;

    if v_row_id is null then
      v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_ITEM_NOT_FOUND');
    else
      v_applied := v_applied || jsonb_build_object('id', v_row_id, 'brief_status', v_status, 'state', v_state, 'snooze_until', v_snooze);
    end if;
  end loop;

  return jsonb_build_object('ok', jsonb_array_length(v_rejected) = 0, 'cid', v_cid,
    'applied', v_applied, 'rejected', v_rejected);
end $function$;

REVOKE ALL ON FUNCTION public.board_update(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_update(jsonb, text) TO authenticated, service_role;

-- F1b · supersede a duplicate rather than delete it ───────────────────────────
CREATE OR REPLACE FUNCTION public.board_supersede(p_keep uuid, p_duplicate uuid, p_cid text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_cid text; v_role text; v_ok uuid;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  if p_cid is not null then
    if v_role <> 'service_role' then
      raise exception 'BOARD_CID_NOT_ACCEPTED_FROM_CLIENT' using errcode='42501'; end if;
    v_cid := p_cid;
  else v_cid := public.current_cid(); end if;
  if v_cid is null then raise exception 'BOARD_UNAUTHENTICATED' using errcode='28000'; end if;
  if p_keep = p_duplicate then raise exception 'BOARD_SUPERSEDE_SAME_ROW' using errcode='22023'; end if;

  perform 1 from open_loops where id = p_keep and cid = v_cid;
  if not found then raise exception 'BOARD_KEEP_NOT_FOUND' using errcode='22023'; end if;

  update open_loops
     set brief_status = 'cleared', state = 'dropped', superseded_by = p_keep,
         last_action_at = now(), escalation_state = null, updated_at = now()
   where id = p_duplicate and cid = v_cid
  returning id into v_ok;
  if v_ok is null then raise exception 'BOARD_DUPLICATE_NOT_FOUND' using errcode='22023'; end if;

  return jsonb_build_object('ok', true, 'cid', v_cid, 'kept', p_keep, 'superseded', v_ok);
end $function$;

REVOKE ALL ON FUNCTION public.board_supersede(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_supersede(uuid, uuid, text) TO authenticated, service_role;

-- F2/F3 · the governed board renderer ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.board_render(p_cid text DEFAULT NULL, p_bump boolean DEFAULT true, p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cid text; v_role text; v_today date; v_row record;
  v_items jsonb := '[]'::jsonb; v_withheld jsonb := '[]'::jsonb;
  v_count int; v_urgent boolean; v_esc text; v_actions jsonb; v_mech int := 0;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  if p_cid is not null then
    if v_role <> 'service_role' then
      raise exception 'BOARD_CID_NOT_ACCEPTED_FROM_CLIENT' using errcode='42501'; end if;
    v_cid := p_cid;
  else v_cid := public.current_cid(); end if;
  if v_cid is null then raise exception 'BOARD_UNAUTHENTICATED' using errcode='28000'; end if;

  v_today := (now() at time zone coalesce((select timezone from tenants where cid = v_cid), 'UTC'))::date;

  for v_row in
    select * from open_loops o
     where o.cid = v_cid and o.brief_status = 'open'
       and (o.snooze_until is null or o.snooze_until <= v_today)
       and o.superseded_by is null
     order by o.state nulls last, o.created_at
     limit greatest(1, coalesce(p_limit, 200))
  loop
    v_count := coalesce(v_row.surfaced_count, 0) + (case when p_bump then 1 else 0 end);
    -- Urgent carve-out: hard deadline, or explicitly marked. Never auto-deferred.
    v_urgent := coalesce(v_row.urgent, false) or v_row.hard_deadline is not null;
    v_esc := v_row.escalation_state;

    if not v_urgent then
      if v_count >= 8 then v_esc := 'mechanism_review';
      elsif v_count >= 3 and v_row.last_action_at is null then v_esc := 'flagged';
      end if;
    else
      v_esc := null;
    end if;

    if p_bump then
      update open_loops
         set surfaced_count = v_count, last_surfaced = now(),
             escalation_state = v_esc,
             escalated_at = case when v_esc is not null and v_row.escalation_state is distinct from v_esc
                                 then now() else escalated_at end,
             updated_at = now()
       where id = v_row.id;
    end if;

    -- F3 · snooze is offered at the moment it is warranted, not documented elsewhere.
    v_actions := jsonb_build_array('answer', 'clear');
    if v_count >= 3 and not v_urgent then
      v_actions := v_actions || jsonb_build_array('snooze', 'rewrite', 'escalate');
    end if;

    v_items := v_items || jsonb_build_object(
      'id', v_row.id, 'title', v_row.title, 'trigger', v_row.trigger, 'owner', v_row.owner,
      'state', v_row.state, 'brief_status', v_row.brief_status, 'surfaced_count', v_count,
      'snooze_until', v_row.snooze_until, 'hard_deadline', v_row.hard_deadline,
      'urgent', v_urgent, 'urgent_reason', v_row.urgent_reason,
      'escalation_state', v_esc,
      'offered_actions', v_actions,
      'note', case
        when v_esc = 'mechanism_review' then 'Surfaced ' || v_count || ' times. The surfacing is broken, not the principal. Rewrite or escalate; do not show it again unchanged.'
        when v_esc = 'flagged' then 'Surfaced ' || v_count || ' times with no action. Rewrite it, escalate it, or snooze it with a date. Do not surface it again unchanged.'
        when v_urgent then 'Urgent carve-out. Stays visible regardless of count.'
        else null end
    );

    if v_esc = 'mechanism_review' then v_mech := v_mech + 1; end if;
  end loop;

  -- One signal against the MECHANISM per render, never per item.
  if p_bump and v_mech > 0 then
    perform public.cob_signal_raise_internal(
      v_cid,
      'board_surfacing_mechanism_failing',
      v_mech || ' open loop(s) have been surfaced eight or more times without resolution. The surfacing mechanism is the defect, not the principal.',
      null, 'board_render', 'board', 'open_loops', null, 'operator', 'board_render'
    );
  end if;

  return jsonb_build_object('ok', true, 'cid', v_cid, 'today', v_today,
    'bumped', p_bump, 'count', jsonb_array_length(v_items),
    'mechanism_review_count', v_mech,
    'items', v_items, 'withheld', v_withheld);
end $function$;

REVOKE ALL ON FUNCTION public.board_render(text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_render(text, boolean, integer) TO authenticated, service_role;