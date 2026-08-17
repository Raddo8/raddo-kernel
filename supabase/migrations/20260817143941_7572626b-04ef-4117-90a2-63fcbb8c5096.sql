DO $$
DECLARE v text; v_sid text := gen_random_uuid()::text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  BEGIN
    PERFORM public.record_signal(p_title => 'HARDEN-15 R2a probe · un-booted signal_raise',
                                 p_detail_md => 'probe', p_cid => 'CID-100001');
    v := 'NO_REFUSAL';
  EXCEPTION WHEN others THEN v := split_part(SQLERRM,':',1); END;
  INSERT INTO public.harden15_probe(probe, observed)
  VALUES ('R2a · un-booted · signal_raise (named args, CID-100001)', v);

  PERFORM public.open_session_context(v_sid, 'CID-100001', NULL, 'probe', interval '2 minutes');
  BEGIN
    PERFORM public.record_signal(p_title => 'HARDEN-15 R2b probe · booted signal_raise',
                                 p_detail_md => 'probe · fix verification', p_cid => 'CID-100001');
    v := 'ACCEPTED';
  EXCEPTION WHEN others THEN v := split_part(SQLERRM,':',1); END;
  PERFORM public.close_session_context(v_sid);
  INSERT INTO public.harden15_probe(probe, observed)
  VALUES ('R2b · booted · signal_raise accepted (named args)', v);
END $$;