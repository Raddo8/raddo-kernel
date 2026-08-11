
CREATE OR REPLACE FUNCTION public.record_fleet_write_denial(
  p_principal text, p_table text, p_identity jsonb, p_cid text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_key text; v_detail text;
BEGIN
  -- This writer exists only to record refusals. Its own row is authorised.
  PERFORM set_config('cob.intel_writer', 'on', true);

  v_key := 'fleet-write-denied:' || p_principal || ':' || p_table;
  v_detail := format(
    'Principal %s attempted a FLEET write into public.%s and was refused. Identifying fields on the attempted row: %s. A fleet row binds every client, so only an active fleet operator may write one. Nothing was written.',
    p_principal, p_table, coalesce(p_identity::text, '{}'));

  UPDATE public.improvement_signals
     SET sightings    = coalesce(sightings, 1) + 1,
         last_seen_at = now(),
         detail_md    = v_detail
   WHERE pattern = 'fleet-write-denied'
     AND source_subject = v_key
     AND status = 'open'
     AND last_seen_at > now() - interval '1 hour'
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    INSERT INTO public.improvement_signals(
      cid, pattern, detail_md, source_subject, source_tool, source_surface,
      status, audience, raised_by, sightings, tenancy)
    VALUES (
      coalesce(p_cid, 'CID-100001'), 'fleet-write-denied', v_detail, v_key,
      'enforce_fleet_write_authority', 'trigger', 'open', 'operator',
      'enforce_fleet_write_authority', 1, 'FLEET')
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_fleet_write_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_principal text;
  v_json jsonb;
  v_label text;
  v_cid text;
  v_identity jsonb;
  v_dsn text;
BEGIN
  IF coalesce(current_setting('cob.intel_writer', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.tenancy IS NULL AND NEW.cid IS NOT NULL THEN
    NEW.tenancy := 'TENANT'::public.tenancy_t;
  END IF;

  IF NEW.tenancy IS NULL AND NEW.cid IS NULL THEN
    v_json := to_jsonb(NEW);
    v_label := coalesce(v_json->>'tenant', v_json->>'tenant_id', v_json->>'tenant_key');
    IF v_label IS NOT NULL THEN
      BEGIN SELECT public.resolve_cid(v_label) INTO v_cid;
      EXCEPTION WHEN others THEN v_cid := NULL; END;
    END IF;
    IF v_cid IS NULL THEN
      BEGIN SELECT public.current_cid() INTO v_cid;
      EXCEPTION WHEN others THEN v_cid := NULL; END;
    END IF;
    IF v_cid IS NOT NULL THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object('cid', v_cid, 'tenancy', 'TENANT'));
    ELSE
      RAISE EXCEPTION 'TENANCY_UNRESOLVED: public.% was written with no client identifier and no fleet declaration, so it cannot be told apart from an orphan. Name the client, or declare the row FLEET if it belongs to every client (which only a fleet operator may do).',
        TG_TABLE_NAME USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NEW.tenancy IS DISTINCT FROM 'FLEET'::public.tenancy_t THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.admin_guard();
    RETURN NEW;
  EXCEPTION WHEN others THEN
    v_principal := coalesce(public.current_cid(), auth.uid()::text, session_user, 'unknown');

    v_json := to_jsonb(NEW);
    v_identity := (
      SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
        FROM jsonb_each(v_json) AS e(k, v)
       WHERE k IN ('id','cid','tenant','tenant_id','tenant_key','key','name','title',
                   'rule_key','pattern','curn','session_id','work_id','slug','status')
         AND v IS NOT NULL AND jsonb_typeof(v) <> 'null'
    );
    BEGIN
      SELECT convert_from(key_value, 'UTF8') INTO v_dsn
        FROM public.internal_keys WHERE name = 'fleet_denial_dsn';
      IF v_dsn IS NOT NULL THEN
        PERFORM extensions.dblink_exec(v_dsn, format(
          'SELECT public.record_fleet_write_denial(%L,%L,%L::jsonb,%L)',
          v_principal, TG_TABLE_NAME, v_identity::text, nullif(v_json->>'cid','')));
      END IF;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'fleet_denial_record_failed: %', SQLERRM;
    END;

    RAISE EXCEPTION 'FLEET_WRITE_DENIED: principal % may not write a FLEET row into public.%. A fleet row binds every client, so only an active fleet operator can write one. Nothing was written. The attempt has been recorded. If this is for your principal, write it as TENANT.',
      v_principal, TG_TABLE_NAME
      USING ERRCODE = '42501';
  END;
END
$function$;
