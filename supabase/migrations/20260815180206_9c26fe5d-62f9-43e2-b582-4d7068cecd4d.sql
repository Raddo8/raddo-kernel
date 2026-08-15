CREATE OR REPLACE FUNCTION public.board_render(p_cid text DEFAULT NULL::text, p_bump boolean DEFAULT true, p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_cid text; v_role text; v_today date; v_row record;
  v_items jsonb := '[]'::jsonb; v_withheld jsonb := '[]'::jsonb;
  v_count int; v_urgent boolean; v_esc text; v_actions jsonb; v_mech int := 0;
  v_undisposed int := 0; v_unset int := 0; v_unset_on_board int := 0;
  v_dated boolean;
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
    select o.*, w.due_date as work_due_date, w.date_kind as work_date_kind, w.lane as work_lane
      from open_loops o
      left join work_item w on w.work_id = o.work_id and w.cid = o.cid
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

    -- K4a · the surface renders the menu it is handed. A row that can be
    -- acted on in HQ offers the act here; nothing is hardcoded downstream.
    v_actions := jsonb_build_array('answer', 'clear', 'snooze', 'rewrite', 'not_mine');
    if v_count >= 3 and not v_urgent then
      v_actions := v_actions || jsonb_build_array('escalate');
    end if;
    -- K4b · every dated row offers the move. A date that can only be met or
    -- missed, never moved, is how a board turns into a wall of stale dates.
    v_dated := v_row.hard_deadline is not null or v_row.work_due_date is not null;
    if v_dated and v_row.work_id is not null then
      v_actions := v_actions || jsonb_build_array('reschedule');
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
      'due_date', v_row.work_due_date, 'date_kind', v_row.work_date_kind, 'lane', v_row.work_lane,
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