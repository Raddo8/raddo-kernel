-- HARDEN-15 R2 · uniform boot enforcement in SQL for the connector's
-- cid-carrying writers. A supplied cid is not permission to skip the boot.
-- Board writers are left alone here: they are also reached by operator
-- surfaces and are boot-gated at the connector.
CREATE TABLE IF NOT EXISTS public.boot_enforcement_report (
  id bigserial primary key,
  at timestamptz not null default now(),
  fn text not null,
  before_state text not null,
  after_state text not null,
  layer text not null
);
GRANT SELECT ON public.boot_enforcement_report TO authenticated;
GRANT ALL ON public.boot_enforcement_report TO service_role;
ALTER TABLE public.boot_enforcement_report ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS boot_enforcement_report_operator_read ON public.boot_enforcement_report;
CREATE POLICY boot_enforcement_report_operator_read ON public.boot_enforcement_report
  FOR SELECT TO authenticated USING (public.is_fleet_operator());

DO $$
DECLARE
  r record; v_def text; v_new text; v_pos int; v_before text;
  v_targets text[] := ARRAY['work_raise','work_reschedule','record_signal','record_probe',
    'cob_memory_write','cob_rule_write','cob_narrative_write','cob_blueprint_write',
    'cob_comm_write','cob_decision_write','cob_record_file','cob_request_resolve'];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.prosrc, p.proargnames
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY(v_targets)
       AND p.prolang = (SELECT oid FROM pg_language WHERE lanname='plpgsql')
       AND p.proargnames IS NOT NULL AND 'p_cid' = ANY(p.proargnames)
  LOOP
    v_before := CASE WHEN r.prosrc ILIKE '%assert_booted%' THEN 'ENFORCED' ELSE 'NOT_ENFORCED' END;
    IF v_before = 'ENFORCED' THEN
      INSERT INTO public.boot_enforcement_report(fn, before_state, after_state, layer)
      VALUES (r.proname, v_before, 'ENFORCED', 'sql');
      CONTINUE;
    END IF;

    v_def := pg_get_functiondef(r.oid);
    -- inject immediately after the first BEGIN of the function body
    v_pos := position(E'\nbegin' in lower(v_def));
    IF v_pos = 0 THEN v_pos := position(E'\nBEGIN' in v_def); END IF;
    IF v_pos = 0 THEN
      INSERT INTO public.boot_enforcement_report(fn, before_state, after_state, layer)
      VALUES (r.proname, v_before, 'NOT_ENFORCED · body shape not injectable', 'sql');
      CONTINUE;
    END IF;

    v_new := left(v_def, v_pos + 6) || E'\n  perform public.assert_booted(p_cid, ' || quote_literal(r.proname) || E');\n'
             || substr(v_def, v_pos + 7);
    BEGIN
      EXECUTE v_new;
      INSERT INTO public.boot_enforcement_report(fn, before_state, after_state, layer)
      VALUES (r.proname, v_before, 'ENFORCED', 'sql');
    EXCEPTION WHEN others THEN
      INSERT INTO public.boot_enforcement_report(fn, before_state, after_state, layer)
      VALUES (r.proname, v_before, 'NOT_ENFORCED · ' || SQLSTATE, 'sql');
    END;
  END LOOP;
END $$;

SELECT public.client_access_canary('AFTER','HARDEN-15 R2 uniform boot enforcement');