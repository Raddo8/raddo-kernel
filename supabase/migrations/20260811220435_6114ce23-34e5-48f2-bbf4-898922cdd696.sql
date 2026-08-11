
-- ────────────────────────────────────────────────────────── H4
CREATE OR REPLACE FUNCTION public.kernel_boot_watchdog()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare r record; flagged int := 0;
begin
  -- A · working with no identity kernel in existence at all. Unchanged.
  for r in
    select t.cid, t.cob_name, count(e.id) calls, max(e.created_at) last_call
    from public.tenants t join public.mcp_usage_events e on e.cid = t.cid
    where not exists (select 1 from public.kernels k where k.cid = t.cid and k.status='active')
    group by 1,2
  loop
    perform public.cob_signal_raise_internal(
      r.cid, 'kernel-absent',
      format('%s has no active identity kernel and has made %s tool calls, most recently %s. It is operating with no profile, no instructions, no preamble and no state pointer.',
             coalesce(r.cob_name,'This tenant'), r.calls, r.last_call),
      null, 'kernel_boot_watchdog', 'watchdog', r.cob_name,
      jsonb_build_object('cid', r.cid, 'calls', r.calls), 'provisioning', 'watchdog');
    flagged := flagged + 1;
  end loop;

  -- B · H4 · a SESSION that worked without loading its kernel IN THAT SESSION.
  -- Counting calls since the last load anywhere is a call counter, not a boot
  -- detector: it fires on exactly what a healthy working session looks like.
  for r in
    select se.cid, se.session_id, t.cob_name,
           count(*) calls, min(se.created_at) first_call
      from public.session_event se
      join public.tenants t on t.cid = se.cid
     where se.session_id is not null
       and se.created_at > now() - interval '7 days'
       and exists (select 1 from public.kernels k where k.cid = se.cid and k.status='active')
       and not exists (
         select 1 from public.kernel_access_log a
          where a.session_id = se.session_id
            and a.cid = se.cid
            and a.access_kind = 'RUNTIME_LOAD')
     group by 1,2,3
  loop
    if not exists (
      select 1 from public.improvement_signals s
       where s.cid = r.cid and s.pattern = 'kernel-not-booted'
         and s.status = 'open' and s.detail_md like '%' || r.session_id || '%')
    then
      perform public.cob_signal_raise_internal(
        r.cid, 'kernel-not-booted',
        format('%s worked in session %s from %s and never loaded its kernel in that session (%s tool call(s)). begin_session loads the kernel; a session that never calls it runs unbooted.',
               coalesce(r.cob_name,'This COB'), r.session_id, r.first_call, r.calls),
        r.session_id::text, 'kernel_boot_watchdog', 'watchdog', r.cob_name,
        jsonb_build_object('cid', r.cid, 'session_id', r.session_id, 'calls_in_session', r.calls),
        'operator', 'watchdog');
      flagged := flagged + 1;
    end if;
  end loop;

  return flagged;
end $function$;

-- Close the standing false warnings the call counter raised.
UPDATE public.improvement_signals
   SET status = 'resolved',
       detail_md = detail_md || E'\n\nClosed by HARDEN-06 H4. This was raised by a call counter wearing a boot detector''s name: it fired on tool calls accumulating after a successful kernel load, which is what a working session looks like. The watchdog now keys on the session and fires only when a session never loaded its kernel.',
       last_seen = now()
 WHERE pattern = 'kernel-not-booted' AND status = 'open';

-- ────────────────────────────────────────────────────────── H5
CREATE OR REPLACE FUNCTION public.enforce_decision_completion_proof()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_body text;
  v_first text;
  v_scope text;
  v_word text;
  -- The bare token "live" is gone: measured across the register it means
  -- "in real time" far more often than "finished". Its phrasal forms stay.
  v_words text[] := array[
    'executed','shipped','complete','completed','done','fixed','deployed',
    'goes live','went live','is live','now live','goes-live'];
  v_hit text := null;
  v_phrase text := null;
  v_probe_ok boolean := false;
  v_probe_id uuid;
  v_state text;
begin
  v_body := coalesce(new.decision_md, '');
  -- The claim is made in the headline, not buried forty lines down.
  v_first := split_part(regexp_replace(v_body, E'[\r\n]+', ' ', 'g'), '.', 1);
  v_scope := lower(coalesce(new.title,'') || '. ' || v_first);

  -- Carve-out: a finding about the gate itself must be recordable, or the
  -- guard's own defects are the one class the register cannot hold.
  if lower(coalesce(new.title,'') || ' ' || v_body) ~
     '(completion gate|finish[ -]word|finish word matcher|enforce_decision_completion_proof|the gate itself|the guard itself)' then
    return new;
  end if;

  foreach v_word in array v_words loop
    -- A hyphen is not a word boundary here: "read-complete-first" is prose.
    if v_scope ~ ('(^|[^[:alnum:]_-])' || v_word || '([^[:alnum:]_-]|$)') then
      v_hit := v_word;
      v_phrase := btrim((regexp_match(v_scope, '(.{0,40}' || v_word || '.{0,40})'))[1]);
      exit;
    end if;
  end loop;

  if v_hit is null then
    return new;
  end if;

  select a.canonical into v_state
    from verification_state_alias a
   where a.alias = lower(btrim(coalesce(new.verification_state,'')));
  v_state := coalesce(v_state, new.verification_state);

  if v_state is null or v_state not in ('probe_passed','verified') then
    raise exception 'DECISION_COMPLETION_UNPROVEN: the word "%" appears in "…%…" and reads as a completion claim, but this decision carries verification_state %. If it is a claim, run the probe, record it in public.probe_runs and put its id in test_run_id. If the word is doing ordinary work in the sentence, reword the headline.',
      v_hit, v_phrase, coalesce(new.verification_state,'null') using errcode = '22023';
  end if;

  begin
    v_probe_id := nullif(btrim(coalesce(new.test_run_id,'')),'')::uuid;
  exception when others then
    v_probe_id := null;
  end;

  if v_probe_id is null then
    raise exception 'DECISION_COMPLETION_UNPROVEN: the word "%" appears in "…%…" but test_run_id does not name a probe run. Record the probe in public.probe_runs and put its id in test_run_id.',
      v_hit, v_phrase using errcode = '22023';
  end if;

  select p.passed into v_probe_ok from probe_runs p where p.id = v_probe_id;

  if v_probe_ok is null then
    raise exception 'DECISION_COMPLETION_UNPROVEN: the word "%" appears in "…%…" and names probe run %, which does not exist.',
      v_hit, v_phrase, v_probe_id using errcode = '22023';
  end if;

  if v_probe_ok is false then
    raise exception 'DECISION_COMPLETION_UNPROVEN: the word "%" appears in "…%…" and names probe run %, which failed. A failed probe is not proof.',
      v_hit, v_phrase, v_probe_id using errcode = '22023';
  end if;

  return new;
end
$function$;
