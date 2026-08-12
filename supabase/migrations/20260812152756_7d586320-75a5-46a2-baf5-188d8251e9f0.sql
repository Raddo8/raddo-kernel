-- HARDEN-10 · ITEM 2 · the scheduled_actions runner.

ALTER TABLE public.scheduled_actions
  ADD COLUMN IF NOT EXISTS claimed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS claim_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by        text,
  ADD COLUMN IF NOT EXISTS attempts          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error        text,
  ADD COLUMN IF NOT EXISTS last_receipt      jsonb;

CREATE INDEX IF NOT EXISTS scheduled_actions_due_idx
  ON public.scheduled_actions (run_at) WHERE status = 'scheduled';

COMMENT ON COLUMN public.scheduled_actions.claim_expires_at IS
  'HARDEN-10. Lease expiry. A run that stops mid-flight is reaped and requeued; a live lease makes double-firing impossible.';

-- ── gate test · one place, no guessing ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scheduled_action_hold_reason(r public.scheduled_actions)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
declare j jsonb;
begin
  if r.owner is distinct from 'cob' then
    return 'OWNED_BY_'||upper(coalesce(r.owner,'unknown'))||': a person owns this row. The runner does not fire work it does not own.';
  end if;
  if coalesce(r.spec_status,'OWED') <> 'ACCEPTED' then
    return 'SPEC_'||coalesce(r.spec_status,'OWED')||': no accepted build spec. Awaiting acceptance before it can be fired.';
  end if;
  if r.build_spec is null or btrim(r.build_spec) = '' then
    return 'SPEC_EMPTY: the row names no work to do.';
  end if;
  begin
    j := r.build_spec::jsonb;
  exception when others then
    return 'SPEC_UNREADABLE: build_spec is not a readable specification.';
  end;
  if coalesce(j->>'kind','') = '' then
    return 'SPEC_NO_KIND: the specification does not say what kind of work this is.';
  end if;
  if r.gates_total is not null and coalesce(r.gates_passed,0) < r.gates_total then
    return 'GATES_'||coalesce(r.gates_passed,0)||'_OF_'||r.gates_total||': gates are outstanding. Approval work is never auto-fired.';
  end if;
  return null;
end $function$;

-- ── receipt writer ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scheduled_action_receipt(
  p_row public.scheduled_actions, p_phase text, p_detail jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into change_ledger (cid, tenancy, table_name, row_pk, pk_col, op, after_row, actor, actor_role, reason)
  values (p_row.cid, coalesce(p_row.tenancy,'TENANT'::tenancy_t), 'scheduled_actions', p_row.id::text, 'id',
          'RUN_'||upper(p_phase),
          jsonb_build_object('title', p_row.title, 'run_at', p_row.run_at,
                             'attempt', p_row.attempts, 'phase', p_phase) || coalesce(p_detail,'{}'::jsonb),
          'scheduled_actions_runner', 'runner',
          coalesce(p_detail->>'reason', 'runner '||p_phase));
end $function$;

-- ── the runner ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_scheduled_actions(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  r public.scheduled_actions;
  v_hold text; v_spec jsonb; v_kind text; v_url text;
  v_req bigint; v_headers jsonb;
  n_claimed int := 0; n_done int := 0; n_held int := 0; n_failed int := 0;
  v_details jsonb := '[]'::jsonb;
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

  return jsonb_build_object('claimed',n_claimed,'succeeded',n_done,'held',n_held,'failed',n_failed,
                            'at',now(),'details',v_details);
end $function$;

-- ── reaper · a stopped run releases its claim ────────────────────────────────
CREATE OR REPLACE FUNCTION public.reap_stale_action_claims()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare r public.scheduled_actions; n int := 0;
begin
  for r in
    update public.scheduled_actions s
       set status='scheduled', claimed_at=null, claimed_by=null, claim_expires_at=null,
           outcome='claim released after a stopped run', updated_at=now()
     where s.status='running' and coalesce(s.claim_expires_at,'-infinity'::timestamptz) < now()
    returning s.*
  loop
    perform public.scheduled_action_receipt(r,'claim_released',
      jsonb_build_object('reason','lease expired mid-run; requeued'));
    n := n + 1;
  end loop;
  return n;
end $function$;

REVOKE ALL ON FUNCTION public.run_scheduled_actions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reap_stale_action_claims() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scheduled_action_receipt(public.scheduled_actions, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scheduled_action_hold_reason(public.scheduled_actions) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_scheduled_actions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reap_stale_action_claims() TO service_role;
GRANT EXECUTE ON FUNCTION public.scheduled_action_receipt(public.scheduled_actions, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.scheduled_action_hold_reason(public.scheduled_actions) TO service_role;

SELECT cron.schedule('scheduled-actions-runner', '*/5 * * * *',
                     $$select public.run_scheduled_actions(25);$$);