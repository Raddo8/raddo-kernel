-- H1a · status is derived from the receipt, from nothing else.
CREATE OR REPLACE FUNCTION public.save_attempt_status(p_layer_results jsonb, p_completed_at timestamptz)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_layers   jsonb;
  v_failed   bigint := 0;
  v_saved    bigint := 0;
  v_applic   bigint := 0;
  v_unverif  bigint := 0;
  v_has_err  boolean := false;
BEGIN
  IF p_completed_at IS NULL THEN RETURN 'ABANDONED'; END IF;
  IF p_layer_results IS NULL THEN RETURN 'FAILED'; END IF;

  v_layers := p_layer_results->'layers';

  IF v_layers IS NOT NULL AND jsonb_typeof(v_layers) = 'array' THEN
    SELECT
      coalesce(sum(coalesce((l->>'failed')::bigint,0)),0),
      coalesce(sum(coalesce((l->>'saved')::bigint,0) + coalesce((l->>'updated')::bigint,0)),0),
      count(*) FILTER (WHERE coalesce((l->>'requested')::bigint,0) > 0
                          OR coalesce((l->>'attempted')::bigint,0) > 0),
      count(*) FILTER (WHERE (coalesce((l->>'requested')::bigint,0) > 0
                          OR coalesce((l->>'attempted')::bigint,0) > 0)
                         AND coalesce((l->>'verified')::boolean,false) = false)
    INTO v_failed, v_saved, v_applic, v_unverif
    FROM jsonb_array_elements(v_layers) l;
  ELSE
    -- flat {layer: SAVED|FAILED} shape
    SELECT
      count(*) FILTER (WHERE upper(coalesce(value #>> '{}','')) = 'FAILED'),
      count(*) FILTER (WHERE upper(coalesce(value #>> '{}','')) = 'SAVED'),
      count(*) FILTER (WHERE jsonb_typeof(value) = 'string'),
      0
    INTO v_failed, v_saved, v_applic, v_unverif
    FROM jsonb_each(p_layer_results)
    WHERE key <> 'error_detail';
    v_has_err := (p_layer_results ? 'error_detail');
  END IF;

  IF v_failed = 0 AND v_unverif = 0 AND NOT v_has_err THEN RETURN 'COMPLETED'; END IF;
  IF v_saved > 0 THEN RETURN 'PARTIAL'; END IF;
  IF v_failed > 0 OR v_has_err THEN RETURN 'FAILED'; END IF;
  RETURN 'PARTIAL';
END $$;

GRANT EXECUTE ON FUNCTION public.save_attempt_status(jsonb, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.close_save_attempt(p_save_attempt_id uuid, p_status text, p_layer_results jsonb DEFAULT NULL::jsonb, p_failure_stage text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.save_attempt;
  v_stage text := NULL;
  v_detail text := NULL;
  v_results jsonb := coalesce(p_layer_results, '{}'::jsonb);
  v_final jsonb;
  v_derived text;
  v_allowed text[] := ARRAY['AUTH','CID_RESOLUTION','MANIFEST_VERSION','SESSION_VALIDATION',
                            'LAYER_WRITE','LEG_EXCEPTION','VERIFICATION','RECEIPT'];
BEGIN
  IF p_status IS NOT NULL AND p_status NOT IN ('COMPLETED','PARTIAL','FAILED') THEN
    RAISE EXCEPTION 'SAVE_ATTEMPT_OUTCOME_UNKNOWN: % is not one of COMPLETED, PARTIAL, FAILED.', p_status
      USING ERRCODE = '22023';
  END IF;

  IF p_failure_stage IS NOT NULL THEN
    IF p_failure_stage = ANY (v_allowed) THEN
      v_stage := p_failure_stage;
    ELSE
      v_detail := p_failure_stage;
      v_stage := CASE
        WHEN p_failure_stage ILIKE 'receipt%' THEN 'RECEIPT'
        WHEN p_failure_stage ILIKE '%cid%'    THEN 'CID_RESOLUTION'
        WHEN p_failure_stage ILIKE '%transcript%' THEN 'VERIFICATION'
        WHEN p_status = 'FAILED'              THEN 'LEG_EXCEPTION'
        ELSE 'LAYER_WRITE' END;
      v_results := v_results || jsonb_build_object('error_detail', v_detail);
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.save_attempt WHERE save_attempt_id = p_save_attempt_id;
  IF v_row.save_attempt_id IS NULL THEN
    RAISE EXCEPTION 'SAVE_ATTEMPT_NOT_FOUND: no attempt row % to close.', p_save_attempt_id
      USING ERRCODE = 'P0002';
  END IF;

  v_final := CASE WHEN p_layer_results IS NULL AND v_detail IS NULL
                  THEN v_row.layer_results ELSE v_results END;

  -- H1a · the caller's opinion of the outcome is not consulted. The status is
  -- computed from the layer results this row carries.
  v_derived := public.save_attempt_status(v_final, now());

  UPDATE public.save_attempt
     SET status = v_derived,
         completed_at = now(),
         failure_stage = CASE WHEN v_derived = 'COMPLETED' THEN NULL ELSE v_stage END,
         layer_results = v_final
   WHERE save_attempt_id = p_save_attempt_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'save_attempt_id', v_row.save_attempt_id,
    'status', v_row.status,
    'status_source', 'derived_from_layer_results',
    'reported_status', p_status,
    'failure_stage', v_row.failure_stage,
    'layer_results', v_row.layer_results);
END $function$;

-- H1c · recompute every existing row from its own evidence.
UPDATE public.save_attempt
   SET status = public.save_attempt_status(layer_results, completed_at),
       failure_stage = CASE WHEN public.save_attempt_status(layer_results, completed_at) = 'COMPLETED'
                            THEN NULL ELSE failure_stage END
 WHERE layer_results IS NOT NULL;

-- H1b · STANDING RULE. A probe must name the entry point it called.
CREATE OR REPLACE FUNCTION public.probe_method_is_entry_point(p_method text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_method,'') ~* '(\m[a-z_][a-z0-9_]*\s*\()|(/functions/v1/)|(https?://)|(\mtools/call\M)|(\mrpc\M)'
     AND coalesce(p_method,'') !~* '\m(insert\s+into|update\s+public\.|delete\s+from|copy\s+|direct\s+(table\s+)?(insert|write|update)|hand[- ]set|inserted\s+(straight\s+)?into)\M';
$$;

CREATE OR REPLACE FUNCTION public.record_probe(p_subject_kind text, p_subject_ref text, p_claim text, p_method text, p_expected text, p_observed text, p_passed boolean, p_cid text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cid   text;
  v_role  text;
  v_actor text;
  v_id    uuid;
  v_claims json;
BEGIN
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  v_role   := coalesce(v_claims->>'role', '');

  v_cid := public.current_cid();
  IF v_cid IS NULL THEN
    IF v_role = 'service_role' THEN
      v_cid := public.cob_guard(p_cid);
    ELSE
      RAISE EXCEPTION 'CID_UNRESOLVED: a probe cannot be recorded without a resolvable tenant.'
        USING ERRCODE = '28000';
    END IF;
  END IF;

  IF p_passed IS NULL THEN
    RAISE EXCEPTION 'PROBE_NEEDS_VERDICT: passed must be true or false.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_claim),'') = '' OR coalesce(btrim(p_method),'') = ''
     OR coalesce(btrim(p_expected),'') = '' OR coalesce(btrim(p_observed),'') = '' THEN
    RAISE EXCEPTION 'PROBE_NEEDS_EVIDENCE: claim, method, expected and observed are all required.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.probe_method_is_entry_point(p_method) THEN
    RAISE EXCEPTION 'PROBE_METHOD_NOT_AN_ENTRY_POINT: the method must name the function or endpoint it invoked, and a row written straight into the table under test is a fixture, not a probe. Method read: %', left(p_method, 200)
      USING ERRCODE = '22023';
  END IF;

  v_actor := coalesce(
    v_claims->>'email',
    nullif(auth.uid()::text, ''),
    CASE WHEN v_role = 'service_role' THEN 'connector:service_role' ELSE NULL END,
    session_user
  );

  INSERT INTO public.probe_runs
    (cid, subject_kind, subject_ref, claim, method, expected, observed, passed, ran_by)
  VALUES
    (v_cid, p_subject_kind, p_subject_ref, p_claim, p_method, p_expected, p_observed, p_passed, v_actor)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'probe_id', v_id,
    'test_run_id', v_id::text,
    'cid', v_cid,
    'passed', p_passed,
    'ran_by', v_actor,
    'note', CASE WHEN p_passed
      THEN 'Recorded. Put this probe_id in test_run_id and set verification_state to probe_passed to claim completion.'
      ELSE 'Recorded as a failure. A failed probe cannot carry a completion claim.' END
  );
END
$function$;