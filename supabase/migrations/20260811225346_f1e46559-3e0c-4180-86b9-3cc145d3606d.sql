CREATE TABLE IF NOT EXISTS public.work_reschedule_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL,
  work_id uuid NOT NULL,
  title text,
  from_due date,
  to_due date NOT NULL,
  direction text NOT NULL,
  date_kind text,
  reason text NOT NULL,
  moved_by text NOT NULL,
  urgency_before numeric,
  urgency_after numeric,
  surface text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.work_reschedule_receipt TO authenticated;
GRANT ALL ON public.work_reschedule_receipt TO service_role;
ALTER TABLE public.work_reschedule_receipt ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reschedule receipts are readable inside the tenant"
  ON public.work_reschedule_receipt FOR SELECT TO authenticated
  USING (cid = public.current_cid());

CREATE INDEX IF NOT EXISTS work_reschedule_receipt_work_idx
  ON public.work_reschedule_receipt (work_id, created_at DESC);

-- H2 · a reschedule is an act, not a field edit.
CREATE OR REPLACE FUNCTION public.work_reschedule(
  p_work uuid, p_new_due date, p_reason text, p_date_kind text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  w public.work_item;
  v_old date;
  v_kind text;
  v_urg_before numeric;
  v_urg_after numeric;
  v_actor text;
  v_claims json;
  v_receipt uuid;
  v_loops int := 0;
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

  v_old  := w.due_date;
  v_kind := coalesce(nullif(btrim(coalesce(p_date_kind,'')),''), w.date_kind);
  v_urg_before := w.urgency;
  v_urg_after  := public.work_urgency(p_new_due, v_kind, w.consequence, w.principal_acts);

  UPDATE public.work_item
     SET due_date = p_new_due,
         date_kind = v_kind,
         urgency = v_urg_after,
         updated_at = now()
   WHERE work_id = p_work;

  -- the board carries the same date, in the same transaction.
  UPDATE public.open_loops
     SET hard_deadline = p_new_due,
         updated_at = now()
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
     CASE WHEN v_old IS NULL THEN 'set'
          WHEN p_new_due > v_old THEN 'later'
          WHEN p_new_due < v_old THEN 'earlier'
          ELSE 'unchanged' END,
     v_kind, btrim(p_reason), v_actor, v_urg_before, v_urg_after,
     CASE WHEN coalesce(v_claims->>'role','')='service_role' THEN 'connector' ELSE 'surface' END)
  RETURNING id INTO v_receipt;

  RETURN jsonb_build_object(
    'ok', true,
    'work_id', p_work,
    'title', w.title,
    'from_due', v_old,
    'to_due', p_new_due,
    'direction', CASE WHEN v_old IS NULL THEN 'set'
                      WHEN p_new_due > v_old THEN 'later'
                      WHEN p_new_due < v_old THEN 'earlier' ELSE 'unchanged' END,
    'date_kind', v_kind,
    'urgency_before', v_urg_before,
    'urgency_after', v_urg_after,
    'loops_updated', v_loops,
    'reason', btrim(p_reason),
    'moved_by', v_actor,
    'receipt_id', v_receipt);
END $$;

GRANT EXECUTE ON FUNCTION public.work_reschedule(uuid, date, text, text) TO authenticated, service_role;

-- the projection carries the date it ranks by.
CREATE OR REPLACE FUNCTION public.work_sync_loops(p_cid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_projected int := 0; v_withheld int := 0; v_created int := 0; v_today date; v_dates int := 0;
begin
  if p_cid is null then raise exception 'WORK_SYNC_CID_REQUIRED' using errcode='22023'; end if;
  v_today := (now() at time zone coalesce((select timezone from tenants where cid=p_cid),'UTC'))::date;

  update open_loops o
     set principal_acts = w.principal_acts,
         work_id = w.work_id,
         updated_at = now()
    from work_item w
   where w.work_id = o.work_id and o.cid = p_cid
     and (o.principal_acts is distinct from w.principal_acts);

  -- H2 · the field the board shows is the field the ranking uses.
  update open_loops o
     set hard_deadline = w.due_date,
         updated_at = now()
    from work_item w
   where w.work_id = o.work_id and o.cid = p_cid
     and o.hard_deadline is distinct from w.due_date;
  get diagnostics v_dates = row_count;

  insert into open_loops (cid, tenant, title, trigger, owner, state, brief_status, work_id, principal_acts, surfaced_count, hard_deadline)
  select w.cid, public.cob_tenant_key_or_cid(w.cid), w.title, w.detail, w.owner, 'open', 'open', w.work_id, true, 0, w.due_date
    from work_item w
   where w.cid = p_cid and w.state = 'open' and w.principal_acts is true
     and (w.snooze_until is null or w.snooze_until <= v_today)
     and not exists (select 1 from open_loops o where o.work_id = w.work_id);
  get diagnostics v_created = row_count;

  select count(*) into v_projected from open_loops o
   where o.cid=p_cid and o.brief_status='open' and o.superseded_by is null and o.principal_acts is true;
  select count(*) into v_withheld from open_loops o
   where o.cid=p_cid and o.brief_status='open' and o.superseded_by is null and o.principal_acts is not true;

  return jsonb_build_object('ok',true,'cid',p_cid,'projected',v_projected,
    'withheld',v_withheld,'created',v_created,'dates_aligned',v_dates);
end $function$;