CREATE TABLE IF NOT EXISTS public.harden16_probe (
  id bigserial primary key,
  probe text not null,
  observed jsonb,
  ran_at timestamptz not null default now()
);
REVOKE ALL ON public.harden16_probe FROM PUBLIC;
GRANT ALL ON public.harden16_probe TO service_role;
ALTER TABLE public.harden16_probe ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_j jsonb; v_work uuid; v_prev boolean; v_lane text; v_sid text; v_row jsonb;
BEGIN
  -- S1a/S1b · canary after fix
  v_j := public.client_access_canary('AFTER','HARDEN-16 S1');
  INSERT INTO public.harden16_probe(probe, observed) VALUES ('S1a/S1b canary', v_j);

  -- S1c · a real work_dispose on a booted session (CID-100002)
  SELECT work_id, principal_acts, lane INTO v_work, v_prev, v_lane
    FROM public.work_item
   WHERE cid='CID-100002' AND coalesce(state,'') NOT IN ('closed','dropped')
   ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF v_work IS NOT NULL THEN
    v_sid := gen_random_uuid()::text;
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
    PERFORM public.open_session_context(v_sid,'CID-100002',NULL,'harden16-s1c', interval '2 minutes');
    v_row := public.work_dispose(v_work,'tracked',NULL,coalesce(v_prev,false),NULL,v_lane);
    INSERT INTO public.harden16_probe(probe, observed)
    SELECT 'S1c work_dispose', v_row || jsonb_build_object(
      'row_after', to_jsonb(w) - 'embedding')
      FROM public.work_item w WHERE w.work_id = v_work;
    PERFORM public.close_session_context(v_sid);
  ELSE
    INSERT INTO public.harden16_probe(probe, observed) VALUES ('S1c work_dispose', '{"note":"no open work item on CID-100002"}'::jsonb);
  END IF;
END $$;