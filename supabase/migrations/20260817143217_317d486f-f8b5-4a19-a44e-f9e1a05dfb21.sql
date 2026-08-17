DO $$
DECLARE v_sid text := gen_random_uuid()::text; v_work uuid; v_dk text; v_ln text; v_lane text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM public.open_session_context(v_sid, 'CID-100002', NULL, 'probe', interval '10 minutes');

  INSERT INTO public.harden15_probe (probe, observed) VALUES
   ('R1d · booted · work_dispose reaches the body on own row',
     public.probe_write_refusal('{"role":"service_role"}','work_dispose_guard',
       (select work_id from work_item where cid='CID-100002' and state='open' limit 1), null)),
   ('R2b · booted · work_raise boot assertion passes',
     public.probe_write_refusal('{"role":"service_role"}','assert_booted', null, 'CID-100002')),
   ('R3b · booted · unknown lane refused by name',
     public.probe_write_refusal('{"role":"service_role"}','work_dispose_lane',
       (select work_id from work_item where cid='CID-100002' and state='open' limit 1), null));

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_lane := (public.tenant_lanes('CID-100002'))[1];
  v_work := ((public.session_raise('CID-100002','HARDEN-15 R3a probe · date_kind and lane in one call','audit'))->>'work_id')::uuid;
  PERFORM public.work_dispose(v_work, 'tracked', null, false, 'scheduled_event', v_lane);
  SELECT date_kind, lane INTO v_dk, v_ln FROM work_item WHERE work_id = v_work;
  INSERT INTO public.harden15_probe (probe, observed)
  VALUES ('R3a · date_kind and lane both land in one call',
          format('date_kind=%s lane=%s', v_dk, v_ln));
  PERFORM public.work_dispose(v_work, 'forgotten', 'probe item · closed immediately after proving the fix', false, null, v_lane);

  PERFORM public.close_session_context(v_sid);
END $$;