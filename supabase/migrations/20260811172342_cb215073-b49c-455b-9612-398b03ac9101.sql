CREATE TABLE IF NOT EXISTS public.vocabulary_writer_registry (
  vocabulary text NOT NULL,
  writer     text NOT NULL,
  value      text NOT NULL,
  note       text,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vocabulary, writer, value)
);

GRANT SELECT ON public.vocabulary_writer_registry TO anon, authenticated;
GRANT ALL ON public.vocabulary_writer_registry TO service_role;
ALTER TABLE public.vocabulary_writer_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vocabulary registry is fleet-readable"
  ON public.vocabulary_writer_registry FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.vocabulary_writer_registry (vocabulary, writer, value, note) VALUES
  ('verification_state','cob_decision_write','recorded','default when the tool sends no proof'),
  ('verification_state','cob_decision_write','probe_passed','tool passes proof'),
  ('verification_state','cob_decision_write','verified','tool passes proof'),
  ('verification_state','cob_decision_write','asserted','tool passes an assertion'),
  ('verification_state','cob_decision_write','unverified','tool passes an explicit non-claim'),
  ('verification_state','cob_signal_raise_internal','verified','operator-raised signal'),
  ('verification_state','hq_act','disputed','the dispute verb on a decision'),
  ('verification_state','mcp-council:decision_write','probe_passed','gateway pass-through'),
  ('verification_state','mcp-council:decision_write','probe_failed','gateway pass-through'),
  ('verification_state','mcp-council:decision_write','asserted','gateway pass-through'),
  ('verification_state','mcp-council:decision_write','verified','gateway pass-through'),
  ('verification_state','mcp-council:decision_write','unverified','gateway pass-through'),
  ('loop_state','mcp-council:save_session','open','model-authored loop state'),
  ('loop_state','mcp-council:save_session','blocked','model-authored loop state'),
  ('loop_state','mcp-council:save_session','waiting','model-authored loop state'),
  ('loop_state','mcp-council:save_session','done','model-authored loop state'),
  ('loop_state','mcp-council:save_session','dropped','model-authored loop state'),
  ('loop_state','hq_act','open','loop verbs'),
  ('loop_state','hq_act','done','loop verbs'),
  ('loop_state','hq_act','dropped','loop verbs'),
  ('loop_state','work_close','closed','work item close'),
  ('loop_state','work_close','auto_resolved','work item auto close'),
  ('loop_state','work_item:dedup','superseded','dedup supersede path')
ON CONFLICT DO NOTHING;

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
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  ),
  scanned as (
    select 'verification_state'::text as vocabulary, s.writer, lower(btrim(m[1])) as value
      from src s,
           lateral regexp_matches(s.body, 'verification_state\s*(?::=|=)\s*''([^'']+)''', 'gi') m
     where s.writer <> 'normalize_verification_state'
    union all
    select 'verification_state', s.writer, lower(btrim(m[1]))
      from src s,
           lateral regexp_matches(s.body, 'p_verification_state[^;]{0,120}?''([^'']+)''', 'gi') m
     where s.writer <> 'normalize_verification_state'
    union all
    select 'loop_state', s.writer, lower(btrim(m[1]))
      from src s,
           lateral regexp_matches(s.body, '\mstate\s*(?::=|=)\s*''([^'']+)''', 'gi') m
     where s.writer <> 'normalize_loop_state' and s.body ilike '%open_loops%'
  ),
  declared as (
    select r.vocabulary, r.writer, lower(btrim(r.value)) as value
      from vocabulary_writer_registry r
  ),
  all_values as (
    select * from scanned union all select * from declared
  )
  select a.vocabulary, a.writer, a.value,
         'UNMAPPED · this writer can emit a value the vocabulary refuses'::text
    from all_values a
   where (a.vocabulary = 'verification_state'
          and not exists (select 1 from verification_state_alias x where x.alias = a.value))
      or (a.vocabulary = 'loop_state'
          and not exists (select 1 from loop_state_alias x where x.alias = a.value));
end
$function$;

REVOKE ALL ON FUNCTION public.vocabulary_gaps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vocabulary_gaps() TO authenticated, service_role;