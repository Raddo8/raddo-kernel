
CREATE OR REPLACE FUNCTION public.open_save_attempt(
  p_cid text,
  p_session_id text,
  p_client_request_id text,
  p_ritual text,
  p_requested_layer_counts jsonb,
  p_surface text DEFAULT 'connector',
  p_tool_version text DEFAULT NULL,
  p_payload_hash text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_cid IS NULL THEN
    RAISE EXCEPTION 'SAVE_ATTEMPT_CID_REQUIRED: a save attempt is filed under a client and none was resolved.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.save_attempt(
    cid, tenancy, session_id, client_request_id, ritual, surface, tool_version,
    payload_hash, requested_layer_counts, status, received_at)
  VALUES (
    p_cid, 'TENANT', p_session_id,
    coalesce(nullif(p_client_request_id,''), gen_random_uuid()::text),
    coalesce(p_ritual,'save'), coalesce(p_surface,'connector'), p_tool_version,
    coalesce(p_payload_hash, md5(coalesce(p_requested_layer_counts::text,'{}'))),
    coalesce(p_requested_layer_counts, '{}'::jsonb),
    'RECEIVED', now())
  RETURNING save_attempt_id INTO v_id;

  RETURN v_id;
END $$;

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
         recovery_payload = coalesce(p_layer_results, recovery_payload)
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
    'layer_results', v_row.recovery_payload);
END $$;

CREATE OR REPLACE FUNCTION public.save_attempts_in_flight(p_older_than_minutes int DEFAULT 5)
RETURNS TABLE(cid text, ritual text, in_flight bigint, oldest timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sa.cid, sa.ritual, count(*), min(sa.received_at)
    FROM public.save_attempt sa
   WHERE sa.completed_at IS NULL
     AND sa.received_at < now() - make_interval(mins => p_older_than_minutes)
   GROUP BY sa.cid, sa.ritual
   ORDER BY 3 DESC
$$;

GRANT EXECUTE ON FUNCTION public.open_save_attempt(text,text,text,text,jsonb,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_save_attempt(uuid,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_attempts_in_flight(int) TO service_role, authenticated;
