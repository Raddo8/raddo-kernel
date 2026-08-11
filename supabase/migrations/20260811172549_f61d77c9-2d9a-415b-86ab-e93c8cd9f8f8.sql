CREATE OR REPLACE FUNCTION public.enforce_decision_completion_proof()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_text text;
  v_word text;
  v_words text[] := array['executed','shipped','complete','completed','done','live','fixed','deployed'];
  v_hit text := null;
  v_probe_ok boolean := false;
  v_probe_id uuid;
  v_state text;
begin
  v_text := lower(coalesce(new.title,'') || ' ' || coalesce(new.decision_md,''));

  foreach v_word in array v_words loop
    if v_text ~ ('\m' || v_word || '\M') then
      v_hit := v_word;
      exit;
    end if;
  end loop;

  if v_hit is null then
    return new;
  end if;

  -- Resolve synonyms the same way the register does, so a writer is judged on
  -- meaning rather than spelling. The gate itself is unchanged.
  select a.canonical into v_state
    from verification_state_alias a
   where a.alias = lower(btrim(coalesce(new.verification_state,'')));
  v_state := coalesce(v_state, new.verification_state);

  if v_state is null or v_state not in ('probe_passed','verified') then
    raise exception 'DECISION_COMPLETION_UNPROVEN: this decision says "%" but carries verification_state %. A completion claim must be probe_passed or verified and must name a probe_runs row that passed. Run the probe, record it in public.probe_runs, then put its id in test_run_id.',
      v_hit, coalesce(new.verification_state,'null') using errcode = '22023';
  end if;

  begin
    v_probe_id := nullif(btrim(coalesce(new.test_run_id,'')),'')::uuid;
  exception when others then
    v_probe_id := null;
  end;

  if v_probe_id is null then
    raise exception 'DECISION_COMPLETION_UNPROVEN: this decision says "%" but test_run_id does not name a probe run. Record the probe in public.probe_runs and put its id in test_run_id.',
      v_hit using errcode = '22023';
  end if;

  select p.passed into v_probe_ok from probe_runs p where p.id = v_probe_id;

  if v_probe_ok is null then
    raise exception 'DECISION_COMPLETION_UNPROVEN: this decision says "%" and names probe run %, which does not exist.',
      v_hit, v_probe_id using errcode = '22023';
  end if;

  if v_probe_ok is false then
    raise exception 'DECISION_COMPLETION_UNPROVEN: this decision says "%" and names probe run %, which failed. A failed probe is not proof.',
      v_hit, v_probe_id using errcode = '22023';
  end if;

  return new;
end
$function$;