DROP FUNCTION IF EXISTS public.work_reschedule(uuid, date, text, text);

CREATE OR REPLACE FUNCTION public.work_reschedule(
  p_work uuid, p_new_due date, p_reason text,
  p_date_kind text DEFAULT NULL, p_cid text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  w public.work_item;
  v_old date; v_kind text; v_urg_before numeric; v_urg_after numeric;
  v_actor text; v_claims json; v_receipt uuid; v_loops int := 0;
BEGIN
  IF p_work IS NULL THEN
    RAISE EXCEPTION 'WORK_RESCHEDULE_WORK_REQUIRED: name the work item to move.' USING ERRCODE='22023';
  END IF;
  IF p_new_due IS NULL THEN
    RAISE EXCEPTION 'WORK_RESCHEDULE_DATE_REQUIRED: a reschedule needs the date it moves to.' USING ERRCODE='22023';
  END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'WORK_RESCHEDULE_REASON_REQUIRED: a date moves for a reason and the reason is recorded with it.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO w FROM public.work_item WHERE work_id = p_work FOR UPDATE;
  IF w.work_id IS NULL THEN
    RAISE EXCEPTION 'WORK_NOT_FOUND: no work item %.', p_work USING ERRCODE='P0002';
  END IF;
  IF p_cid IS NOT NULL AND w.cid IS DISTINCT FROM p_cid THEN
    RAISE EXCEPTION 'WORK_RESCHEDULE_WRONG_TENANT: that work item belongs to another tenant.' USING ERRCODE='42501';
  END IF;

  v_old  := w.due_date;
  v_kind := coalesce(nullif(btrim(coalesce(p_date_kind,'')),''), w.date_kind);
  v_urg_before := w.urgency;
  v_urg_after  := public.work_urgency(p_new_due, v_kind, w.consequence, w.principal_acts);

  UPDATE public.work_item
     SET due_date = p_new_due, date_kind = v_kind, urgency = v_urg_after, updated_at = now()
   WHERE work_id = p_work;

  UPDATE public.open_loops
     SET hard_deadline = p_new_due, updated_at = now()
   WHERE work_id = p_work;
  GET DIAGNOSTICS v_loops = ROW_COUNT;

  v_claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  v_actor := coalesce(v_claims->>'email', nullif(auth.uid()::text,''),
                      CASE WHEN coalesce(v_claims->>'role','')='service_role'
                           THEN 'connector:service_role' ELSE NULL END, session_user);

  INSERT INTO public.work_reschedule_receipt
    (cid, work_id, title, from_due, to_due, direction, date_kind, reason, moved_by,
     urgency_before, urgency_after, surface)
  VALUES
    (w.cid, p_work, w.title, v_old, p_new_due,
     CASE WHEN v_old IS NULL THEN 'set' WHEN p_new_due > v_old THEN 'later'
          WHEN p_new_due < v_old THEN 'earlier' ELSE 'unchanged' END,
     v_kind, btrim(p_reason), v_actor, v_urg_before, v_urg_after,
     CASE WHEN coalesce(v_claims->>'role','')='service_role' THEN 'connector' ELSE 'surface' END)
  RETURNING id INTO v_receipt;

  RETURN jsonb_build_object(
    'ok', true, 'work_id', p_work, 'title', w.title, 'from_due', v_old, 'to_due', p_new_due,
    'direction', CASE WHEN v_old IS NULL THEN 'set' WHEN p_new_due > v_old THEN 'later'
                      WHEN p_new_due < v_old THEN 'earlier' ELSE 'unchanged' END,
    'date_kind', v_kind, 'urgency_before', v_urg_before, 'urgency_after', v_urg_after,
    'loops_updated', v_loops, 'reason', btrim(p_reason), 'moved_by', v_actor,
    'receipt_id', v_receipt);
END $$;

GRANT EXECUTE ON FUNCTION public.work_reschedule(uuid, date, text, text, text) TO authenticated, service_role;