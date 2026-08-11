-- U1 · the live break: cob_decision_write emits 'recorded' with no alias row.
INSERT INTO public.verification_state_alias (alias, canonical) VALUES
  ('recorded', 'asserted')
ON CONFLICT (alias) DO NOTHING;

-- U2 · writer inventory for decisions / improvement_signals.
INSERT INTO public.verification_state_alias (alias, canonical) VALUES
  ('disputed', 'disputed'),        -- hq_act 'dispute' verb; a distinct standing, not an assertion
  ('gate_verified', 'verified'),   -- kernel_activate wording, in case it ever writes a governed table
  ('unknown', 'unverified'),
  ('pending', 'unverified'),
  ('none', 'unverified')
ON CONFLICT (alias) DO NOTHING;

-- U3 · loop / work state inventory. work_item writers emit these today; open_loops
-- shares the vocabulary, so both resolve regardless of which table gets the trigger.
INSERT INTO public.loop_state_alias (alias, canonical, note) VALUES
  ('auto_resolved', 'done',    'synonym · work_close emits this'),
  ('auto-resolved', 'done',    'synonym · work_close emits this'),
  ('superseded',    'dropped', 'synonym · work_item dedup path emits this'),
  ('closed_out',    'done',    'synonym')
ON CONFLICT (alias) DO NOTHING;

-- The canonical vocabulary now includes 'disputed'. Keep the trigger's own
-- message honest about what it will accept.
CREATE OR REPLACE FUNCTION public.normalize_verification_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare v_in text; v_out text;
begin
  if new.verification_state is null then
    return new;
  end if;
  v_in := lower(btrim(new.verification_state));
  if v_in = '' then
    new.verification_state := null;
    return new;
  end if;
  select a.canonical into v_out from verification_state_alias a where a.alias = v_in;
  if v_out is null then
    raise exception 'VERIFICATION_STATE_UNMAPPED: "%" is not a known verification state. Canonical vocabulary: unverified|asserted|probe_passed|probe_failed|verified|unverified_legacy|disputed. Add an alias to public.verification_state_alias to accept a new synonym. Raised BEFORE any write.', new.verification_state
      using errcode = '22023';
  end if;
  new.verification_state := v_out;
  return new;
end
$function$;

-- U4 · standing coverage report. Scans the source of every function in public
-- for string literals written into a vocabulary-controlled column and returns
-- one row per value the vocabulary would refuse. Empty result = covered.
CREATE OR REPLACE FUNCTION public.vocabulary_gaps()
RETURNS TABLE(vocabulary text, writer text, value text, verdict text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  return query
  with src as (
    select p.proname::text as writer, p.prosrc as body
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
  ),
  vs as (
    select 'verification_state'::text as vocabulary, s.writer,
           lower(btrim(m[1])) as value
      from src s,
           lateral regexp_matches(
             s.body,
             'verification_state\s*(?::=|=)\s*''([^'']+)''',
             'gi') m
     where s.writer <> 'normalize_verification_state'
  ),
  ls as (
    select 'loop_state'::text as vocabulary, s.writer,
           lower(btrim(m[1])) as value
      from src s,
           lateral regexp_matches(
             s.body,
             '\mstate\s*(?::=|=)\s*''([^'']+)''',
             'gi') m
     where s.writer <> 'normalize_loop_state'
       and s.body ilike '%open_loops%'
  )
  select v.vocabulary, v.writer, v.value,
         'UNMAPPED · this writer can emit a value the vocabulary refuses'::text
    from vs v
   where not exists (select 1 from verification_state_alias a where a.alias = v.value)
  union all
  select l.vocabulary, l.writer, l.value,
         'UNMAPPED · this writer can emit a value the vocabulary refuses'::text
    from ls l
   where not exists (select 1 from loop_state_alias a where a.alias = l.value);
end
$function$;

REVOKE ALL ON FUNCTION public.vocabulary_gaps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vocabulary_gaps() TO authenticated, service_role;