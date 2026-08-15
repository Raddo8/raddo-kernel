-- HARDEN-10 · K2 · retire the duplicate. public.run_scheduled_actions already
-- claims under the lease, honours the hold reasons, and executes each row's
-- own build_spec. A second runner with a different effect is the divergence,
-- not the fix.
DROP FUNCTION IF EXISTS public.scheduled_actions_run(text,integer,integer,integer);
DROP FUNCTION IF EXISTS public.scheduled_reap_stale_claims();
DROP FUNCTION IF EXISTS public.scheduled_runnable_states();
DROP FUNCTION IF EXISTS public.scheduled_human_owned_states();

CREATE OR REPLACE FUNCTION public.run_scheduled_actions(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare
  r public.scheduled_actions;
  v_hold text; v_spec jsonb; v_kind text; v_url text;
  v_req bigint; v_headers jsonb;
  n_claimed int := 0; n_done int := 0; n_held int := 0; n_failed int := 0;
  v_details jsonb := '[]'::jsonb;
  v_due int; v_human int; v_blocked int; v_leased int; v_reason text;
  v_human_states text[] := array['jake_owned','gated_credits','held','parked'];
begin
  -- 1 · release stranded leases before claiming anything
  perform public.reap_stale_action_claims();

  -- 2 · claim. status='scheduled' only, so parked / blocked / gated_credits /
  --     jake_owned / built / completed are untouchable by construction.
  for r in
    update public.scheduled_actions s
       set status = 'running',
           claimed_at = now(),
           claimed_by = 'pg_cron:run_scheduled_actions',
           claim_expires_at = now() + interval '5 minutes',
           attempts = s.attempts + 1,
           updated_at = now()
     where s.id in (
       select s2.id from public.scheduled_actions s2
        where s2.status = 'scheduled'
          and s2.run_at is not null and s2.run_at <= now()
          and coalesce(s2.claim_expires_at, '-infinity'::timestamptz) < now()
        order by s2.run_at
        for update skip locked
        limit greatest(1, least(coalesce(p_limit,10), 50)))
    returning s.*
  loop
    n_claimed := n_claimed + 1;
    v_hold := public.scheduled_action_hold_reason(r);

    if v_hold is not null then
      update public.scheduled_actions
         set status='held', outcome=v_hold, claim_expires_at=null, claimed_at=null, claimed_by=null,
             last_receipt=jsonb_build_object('phase','held','reason',v_hold,'at',now()), updated_at=now()
       where id = r.id;
      perform public.scheduled_action_receipt(r, 'held', jsonb_build_object('reason', v_hold));
      n_held := n_held + 1;
      v_details := v_details || jsonb_build_object('id', r.id, 'result','held','reason',v_hold);
      continue;
    end if;

    perform public.scheduled_action_receipt(r, 'started', '{}'::jsonb);
    v_spec := r.build_spec::jsonb;
    v_kind := v_spec->>'kind';

    begin
      if v_kind = 'edge_function' then
        v_url := v_spec->>'url';
        if v_url is null or v_url !~ '^https://' then
          raise exception 'SPEC_URL_INVALID: an edge_function spec must carry an https url.';
        end if;
        begin
          v_headers := public.get_cron_headers();
        exception when others then
          v_headers := jsonb_build_object('Content-Type','application/json');
        end;
        select net.http_post(
                 url := v_url,
                 headers := (v_headers || jsonb_build_object('Content-Type','application/json'))::jsonb,
                 body := coalesce(v_spec->'body','{}'::jsonb))
          into v_req;
        update public.scheduled_actions
           set status='completed', outcome='dispatched', fired_at=now(), completed_at=now(),
               last_error=null, claim_expires_at=null, claimed_at=null, claimed_by=null,
               last_receipt=jsonb_build_object('phase','succeeded','kind',v_kind,'request_id',v_req,'at',now()),
               updated_at=now()
         where id = r.id;
        perform public.scheduled_action_receipt(r,'succeeded', jsonb_build_object('kind',v_kind,'request_id',v_req));

      elsif v_kind = 'noop' then
        update public.scheduled_actions
           set status='completed', outcome=coalesce(v_spec->>'outcome','noop'), fired_at=now(), completed_at=now(),
               last_error=null, claim_expires_at=null, claimed_at=null, claimed_by=null,
               last_receipt=jsonb_build_object('phase','succeeded','kind','noop','at',now()), updated_at=now()
         where id = r.id;
        perform public.scheduled_action_receipt(r,'succeeded', jsonb_build_object('kind','noop'));

      else
        raise exception 'SPEC_KIND_UNKNOWN: %', v_kind;
      end if;

      n_done := n_done + 1;
      v_details := v_details || jsonb_build_object('id', r.id, 'result','succeeded');

    exception when others then
      update public.scheduled_actions
         set status='failed', outcome='error', last_error=SQLERRM,
             fired_at=now(), claim_expires_at=null, claimed_at=null, claimed_by=null,
             last_receipt=jsonb_build_object('phase','failed','error',SQLERRM,'at',now()), updated_at=now()
       where id = r.id;
      perform public.scheduled_action_receipt(r,'failed', jsonb_build_object('error', SQLERRM, 'reason', SQLERRM));
      n_failed := n_failed + 1;
      v_details := v_details || jsonb_build_object('id', r.id, 'result','failed','error',SQLERRM);
    end;
  end loop;

  -- HARDEN-10 · K2 · the runner reports what IT measured. Zero claimed is a
  -- reason, never a bare success: an empty tick and a broken tick look
  -- identical otherwise, and that is how a dead runner stays undetected.
  select count(*) filter (where run_at <= now()),
         count(*) filter (where run_at <= now() and status = any(v_human_states)),
         count(*) filter (where run_at <= now() and status in ('blocked','contained','superseded','failed')),
         count(*) filter (where claim_expires_at > now())
    into v_due, v_human, v_blocked, v_leased
    from public.scheduled_actions;

  if n_claimed = 0 then
    v_reason := case
      when v_due = 0 then 'Nothing is past its run_at. The runner claimed nothing because nothing was due.'
      else v_due || ' row(s) are past run_at and none were claimable: only status=scheduled is claimable, ' ||
           v_human || ' are owned by a person, ' || v_blocked ||
           ' are blocked, contained, superseded or failed, and ' || v_leased ||
           ' are already leased.' end;
  end if;

  return jsonb_build_object('claimed',n_claimed,'succeeded',n_done,'held',n_held,'failed',n_failed,
                            'at',now(),'details',v_details,
                            'reason', v_reason,
                            'measured', jsonb_build_object(
                              'rows_past_run_at', v_due,
                              'human_owned_untouched', v_human,
                              'blocked_or_failed', v_blocked,
                              'currently_leased', v_leased,
                              'claimable_status', 'scheduled',
                              'never_touched_states', to_jsonb(v_human_states)));
end $function$;