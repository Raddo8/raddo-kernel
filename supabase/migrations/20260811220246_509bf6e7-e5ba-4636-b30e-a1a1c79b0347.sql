
DO $mig$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'cob_rule_write';

  v_src := replace(v_src,
    'insert into change_log (tenant_id, entity, entity_id, change, summary, actor)',
    'insert into change_log (tenant_id, cid, entity, entity_id, change, summary, actor)');
  v_src := replace(v_src,
    'values (v_key, ''directive''',
    'values (v_key, v_cid, ''directive''');

  IF position('v_cid, ''directive''' in v_src) = 0 THEN
    RAISE EXCEPTION 'PATCH_DID_NOT_APPLY: the change_log insert was not found in cob_rule_write';
  END IF;

  EXECUTE v_src;
END $mig$;
