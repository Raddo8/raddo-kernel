
ALTER TABLE public.save_attempt ADD COLUMN IF NOT EXISTS layer_results jsonb;

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
DECLARE v_row public.save_attempt;
BEGIN
  IF p_status NOT IN ('COMPLETED','PARTIAL','FAILED') THEN
    RAISE EXCEPTION 'SAVE_ATTEMPT_OUTCOME_UNKNOWN: % is not one of COMPLETED, PARTIAL, FAILED.', p_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.save_attempt
     SET status = p_status,
         completed_at = now(),
         failure_stage = p_failure_stage,
         layer_results = coalesce(p_layer_results, layer_results)
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
