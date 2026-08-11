
DO $mig$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='kernel_boot_watchdog';
  v_src := replace(v_src,
    'where a.session_id = se.session_id',
    'where a.session_id::text = se.session_id::text');
  IF position('a.session_id::text' in v_src) = 0 THEN
    RAISE EXCEPTION 'PATCH_DID_NOT_APPLY';
  END IF;
  EXECUTE v_src;
END $mig$;
