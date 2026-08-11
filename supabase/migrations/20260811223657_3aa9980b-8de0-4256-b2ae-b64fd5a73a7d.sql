
CREATE OR REPLACE FUNCTION public.close_save_attempt(
  p_save_attempt_id uuid,
  p_status text,
  p_layer_results jsonb DEFAULT NULL,
  p_failure_stage text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.save_attempt;
  v_stage text := NULL;
  v_detail text := NULL;
  v_results jsonb := coalesce(p_layer_results, '{}'::jsonb);
  v_allowed text[] := ARRAY['AUTH','CID_RESOLUTION','MANIFEST_VERSION','SESSION_VALIDATION',
                            'LAYER_WRITE','LEG_EXCEPTION','VERIFICATION','RECEIPT'];
BEGIN
  IF p_status NOT IN ('COMPLETED','PARTIAL','FAILED') THEN
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

  UPDATE public.save_attempt
     SET status = p_status,
         completed_at = now(),
         failure_stage = v_stage,
         layer_results = CASE WHEN p_layer_results IS NULL AND v_detail IS NULL
                              THEN layer_results ELSE v_results END
   WHERE save_attempt_id = p_save_attempt_id
  RETURNING * INTO v_row;

  IF v_row.save_attempt_id IS NULL THEN
    RAISE EXCEPTION 'SAVE_ATTEMPT_NOT_FOUND: no attempt row % to close.', p_save_attempt_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'save_attempt_id', v_row.save_attempt_id,
    'status', v_row.status,
    'failure_stage', v_row.failure_stage,
    'layer_results', v_row.layer_results);
END $$;
