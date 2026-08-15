CREATE OR REPLACE FUNCTION public.scheduled_actions_run(
  p_worker text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 120,
  p_max_attempts integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_worker text := coalesce(nullif(btrim(coalesce(p_worker,'')),''), 'runner:' || gen_random_uuid()::text);
  v_row record; v_reaped int; v_claimed int := 0; v_ran int := 0; v_failed int := 0;
  v_deferred int := 0; v_results jsonb := '[]'::jsonb; v_work uuid; v_receipt jsonb;
  v_due int; v_human int; v_blocked int; v_leased int;
BEGIN
  v_reaped := public.scheduled_reap_stale_claims();

  FOR v_row IN
    UPDATE scheduled_actions s
       SET claimed_at = now(),
           claim_expires_at = now() + make_interval(secs => greatest(10, coalesce(p_lease_seconds,120))),
           claimed_by = v_worker,
           attempts = coalesce(s.attempts,0) + 1,
           updated_at = now()
     WHERE s.id IN (
       SELECT c.id FROM scheduled_actions c
        WHERE c.run_at <= now()
          AND c.status = ANY (public.scheduled_runnable_states())
          AND NOT (c.status = ANY (public.scheduled_human_owned_states()))
          AND (c.claim_expires_at IS NULL OR c.claim_expires_at < now())
          AND coalesce(c.attempts,0) < greatest(1, coalesce(p_max_attempts,5))
        ORDER BY c.run_at
        LIMIT greatest(1, coalesce(p_limit,25))
        FOR UPDATE SKIP LOCKED)
    RETURNING s.*
  LOOP
    v_claimed := v_claimed + 1;
    BEGIN
      -- 'scheduled' is the origin the work register accepts. The first run
      -- named the mismatch instead of swallowing it; this is the correction.
      v_work := public.work_raise(
        v_row.cid, coalesce(v_row.title, v_row.program, 'scheduled action'),
        'task', 'scheduled', 'scheduled_actions', v_row.id::text,
        v_row.detail, v_row.owner, (v_row.run_at at time zone 'UTC')::date, NULL);

      v_receipt := jsonb_build_object(
        'ran_at', now(), 'worker', v_worker, 'work_id', v_work,
        'effect', 'raised into work_item and surfaced on the board',
        'attempt', v_row.attempts, 'program', v_row.program);

      UPDATE scheduled_actions
         SET status = 'completed', outcome = 'raised_into_work',
             fired_at = coalesce(fired_at, now()), completed_at = now(),
             last_receipt = v_receipt, last_error = NULL,
             claimed_at = NULL, claim_expires_at = NULL, claimed_by = NULL,
             updated_at = now()
       WHERE id = v_row.id;

      v_ran := v_ran + 1;
      v_results := v_results || jsonb_build_object('id', v_row.id, 'result', 'ran', 'work_id', v_work);

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      UPDATE scheduled_actions
         SET last_error = SQLERRM,
             last_receipt = jsonb_build_object('failed_at', now(), 'worker', v_worker,
                                               'attempt', v_row.attempts, 'sqlstate', SQLSTATE),
             status = CASE WHEN coalesce(v_row.attempts,0) >= greatest(1, coalesce(p_max_attempts,5))
                           THEN 'blocked' ELSE status END,
             claimed_at = NULL, claim_expires_at = NULL, claimed_by = NULL,
             updated_at = now()
       WHERE id = v_row.id;
      v_results := v_results || jsonb_build_object('id', v_row.id, 'result', 'failed', 'error', SQLERRM);
    END;
  END LOOP;

  SELECT count(*) FILTER (WHERE run_at <= now()),
         count(*) FILTER (WHERE run_at <= now() AND status = ANY (public.scheduled_human_owned_states())),
         count(*) FILTER (WHERE run_at <= now() AND status IN ('blocked','contained','superseded')),
         count(*) FILTER (WHERE claim_expires_at > now())
    INTO v_due, v_human, v_blocked, v_leased
    FROM scheduled_actions;

  RETURN jsonb_build_object(
    'ok', v_failed = 0,
    'worker', v_worker,
    'reaped_stale_leases', v_reaped,
    'claimed', v_claimed, 'ran', v_ran, 'failed', v_failed, 'deferred', v_deferred,
    'results', v_results,
    'measured', jsonb_build_object(
      'rows_past_run_at', v_due,
      'human_owned_untouched', v_human,
      'blocked_or_contained', v_blocked,
      'currently_leased', v_leased,
      'runnable_states', to_jsonb(public.scheduled_runnable_states()),
      'never_touched_states', to_jsonb(public.scheduled_human_owned_states())),
    'reason', CASE WHEN v_claimed > 0 THEN NULL
      WHEN v_due = 0 THEN 'Nothing is past its run_at. The runner claimed nothing because there was nothing due.'
      ELSE v_due || ' row(s) are past run_at and none were eligible: ' || v_human ||
           ' are owned by a person, ' || v_blocked || ' are blocked, contained or superseded, ' ||
           v_leased || ' are already leased by another runner, and the remainder have exhausted their attempts.'
      END);
END $function$;