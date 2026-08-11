
-- ── H7 · a real lane on work_item ────────────────────────────────────────
ALTER TABLE public.work_item ADD COLUMN IF NOT EXISTS lane text;
COMMENT ON COLUMN public.work_item.lane IS
  'The client''s own lane for this work (legal, sales, operations, …). Free text by design: lanes are the client''s vocabulary, not ours. Distinct from date_kind, which says what kind of date the item carries.';

DROP FUNCTION IF EXISTS public.work_dispose(uuid, text, text, boolean, text);

CREATE OR REPLACE FUNCTION public.work_dispose(
  p_work uuid,
  p_disposition text,
  p_reason text DEFAULT NULL::text,
  p_principal_acts boolean DEFAULT NULL::boolean,
  p_date_kind text DEFAULT NULL::text,
  p_lane text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cid text;
  v_date_kinds text[] := array['hard_deadline','scheduled_event','target','window','reference','expected_next'];
begin
  select cid into v_cid from work_item where work_id = p_work;
  if v_cid is null then raise exception 'WORK_ITEM_NOT_FOUND: %', p_work using errcode='23503'; end if;

  -- The old signature called the date kind "lane". A caller still doing that
  -- would file a date kind as a business lane and nothing would complain.
  if p_lane is not null and lower(btrim(p_lane)) = any(v_date_kinds) then
    raise exception 'LANE_IS_NOT_A_DATE_KIND: "%" is a date kind, not a lane. Pass it as p_date_kind. p_lane carries the client''s own lanes, such as legal or sales.',
      p_lane using errcode='22023';
  end if;

  if p_disposition = 'tracked' then
    if p_principal_acts is null then
      raise exception 'DISPOSITION_INCOMPLETE: tracking an item requires saying whether the principal is the one who must move.'
        using errcode='22023'; end if;
    if p_date_kind is not null and p_date_kind not in ('hard_deadline','scheduled_event','target','window','reference','expected_next') then
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

GRANT EXECUTE ON FUNCTION public.work_dispose(uuid, text, text, boolean, text, text) TO service_role;

-- ── H6 · a projection must not hide on a null ────────────────────────────
CREATE OR REPLACE FUNCTION public.board_render(p_cid text DEFAULT NULL::text, p_bump boolean DEFAULT true, p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cid text; v_role text; v_today date; v_row record;
  v_items jsonb := '[]'::jsonb; v_withheld jsonb := '[]'::jsonb;
  v_count int; v_urgent boolean; v_esc text; v_actions jsonb; v_mech int := 0;
  v_undisposed int := 0; v_unset int := 0; v_unset_on_board int := 0;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  if p_cid is not null then
    if v_role <> 'service_role' then
      raise exception 'BOARD_CID_NOT_ACCEPTED_FROM_CLIENT' using errcode='42501'; end if;
    v_cid := p_cid;
  else v_cid := public.current_cid(); end if;
  if v_cid is null then raise exception 'BOARD_UNAUTHENTICATED' using errcode='28000'; end if;

  v_today := (now() at time zone coalesce((select timezone from tenants where cid = v_cid), 'UTC'))::date;

  perform public.work_sync_loops(v_cid);

  for v_row in
    select * from open_loops o
     where o.cid = v_cid and o.brief_status = 'open'
       and (o.snooze_until is null or o.snooze_until <= v_today)
       and o.superseded_by is null
       -- H6 · an unanswered question is not a "no". Items the principal must
       -- act on show; items nobody has answered for show too, flagged.
       and o.principal_acts is not false
     order by (o.principal_acts is null), o.state nulls last, o.created_at
     limit greatest(1, coalesce(p_limit, 200))
  loop
    v_count := coalesce(v_row.surfaced_count, 0) + (case when p_bump then 1 else 0 end);
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

    v_actions := jsonb_build_array('answer', 'clear');
    if v_count >= 3 and not v_urgent then
      v_actions := v_actions || jsonb_build_array('snooze', 'rewrite', 'escalate');
    end if;
    if v_row.principal_acts is null then
      v_actions := v_actions || jsonb_build_array('say_who_acts');
      v_unset_on_board := v_unset_on_board + 1;
    end if;

    v_items := v_items || jsonb_build_object(
      'id', v_row.id, 'work_id', v_row.work_id,
      'title', v_row.title, 'trigger', v_row.trigger, 'owner', v_row.owner,
      'state', v_row.state, 'brief_status', v_row.brief_status, 'surfaced_count', v_count,
      'snooze_until', v_row.snooze_until, 'hard_deadline', v_row.hard_deadline,
      'urgent', v_urgent, 'urgent_reason', v_row.urgent_reason,
      'escalation_state', v_esc,
      'attribution', case when v_row.principal_acts is null then 'unset' else 'principal_acts' end,
      'offered_actions', v_actions,
      'note', case
        when v_row.principal_acts is null then 'Nobody has said who acts on this. It is on the board because an unanswered question is not a no. Say who acts, or forget it with a reason.'
        when v_esc = 'mechanism_review' then 'Surfaced ' || v_count || ' times. The surfacing is broken, not the principal. Rewrite or escalate; do not show it again unchanged.'
        when v_esc = 'flagged' then 'Surfaced ' || v_count || ' times with no action. Rewrite it, escalate it, or snooze it with a date. Do not surface it again unchanged.'
        when v_urgent then 'Urgent carve-out. Stays visible regardless of count.'
        else null end
    );

    if v_esc = 'mechanism_review' then v_mech := v_mech + 1; end if;
  end loop;

  -- What was held back, and why. Canon 11.8: never a bare absence.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'work_id', o.work_id, 'title', o.title,
           'reason', case
             when o.principal_acts is false then 'not yours to act on'
             when o.snooze_until > v_today then 'snoozed until ' || o.snooze_until
             else 'withheld' end)), '[]'::jsonb)
    into v_withheld
    from open_loops o
   where o.cid = v_cid and o.brief_status = 'open' and o.superseded_by is null
     and (o.principal_acts is false or o.snooze_until > v_today);

  select count(*) into v_unset from open_loops o
   where o.cid = v_cid and o.brief_status = 'open' and o.superseded_by is null
     and o.principal_acts is null;

  select count(*) into v_undisposed from work_item w
   where w.cid = v_cid and w.state in ('open','snoozed','blocked')
     and (w.principal_acts is null or w.date_kind is null);

  if p_bump and v_mech > 0 then
    perform public.cob_signal_raise_internal(
      v_cid,
      'board_surfacing_mechanism_failing',
      v_mech || ' open loop(s) have been surfaced eight or more times without resolution. The surfacing mechanism is the defect, not the principal.',
      null, 'board_render', 'board', 'open_loops', null, 'operator', 'board_render'
    );
  end if;

  -- H6 · the omission itself is reportable, not just visible.
  if p_bump and v_unset > 0 then
    perform public.cob_signal_raise_internal(
      v_cid,
      'board_attribution_unset',
      v_unset || ' open item(s) have never been told who must act on them. They are on the board flagged rather than hidden, because a projection that hides on a null makes the omission invisible.',
      null, 'board_render', 'board', 'open_loops',
      jsonb_build_object('unset_count', v_unset), 'operator', 'board_render'
    );
  end if;

  return jsonb_build_object('ok', true, 'cid', v_cid, 'today', v_today,
    'bumped', p_bump, 'count', jsonb_array_length(v_items),
    'mechanism_review_count', v_mech,
    'attribution_unset_count', v_unset,
    'attribution_unset_on_board', v_unset_on_board,
    'undisposed_count', v_undisposed,
    'empty_reason', case when jsonb_array_length(v_items) = 0 then
        case when v_undisposed > 0
          then 'Nothing is on the board because ' || v_undisposed || ' raised item(s) have not been disposed of yet.'
          when jsonb_array_length(v_withheld) > 0
          then 'Nothing is on the board because every open item is withheld. See withheld for the reason on each.'
          else 'Nothing is open on this board. No item is being withheld.' end
      else null end,
    'items', v_items, 'withheld', v_withheld);
end $function$;
