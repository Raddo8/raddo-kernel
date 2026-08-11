
-- G2 · a dedicated, minimal login used only to write the refusal record on a
-- connection outside the aborting transaction. It can do nothing else.
DO $$
DECLARE v_pw text;
BEGIN
  v_pw := encode(extensions.gen_random_bytes(24), 'hex');
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cob_intel_writer') THEN
    EXECUTE format('CREATE ROLE cob_intel_writer LOGIN PASSWORD %L NOINHERIT', v_pw);
  ELSE
    EXECUTE format('ALTER ROLE cob_intel_writer LOGIN PASSWORD %L', v_pw);
  END IF;
  EXECUTE format('ALTER ROLE cob_intel_writer SET search_path = public');

  INSERT INTO public.internal_keys(name, key_value)
  VALUES ('fleet_denial_dsn',
          convert_to(format('host=127.0.0.1 port=5432 dbname=%s user=cob_intel_writer password=%s',
                            current_database(), v_pw), 'UTF8'))
  ON CONFLICT (name) DO UPDATE SET key_value = EXCLUDED.key_value;
END $$;

REVOKE ALL ON SCHEMA public FROM cob_intel_writer;
GRANT USAGE ON SCHEMA public TO cob_intel_writer;

-- The only thing this login may do.
CREATE OR REPLACE FUNCTION public.record_fleet_write_denial(
  p_principal text, p_table text, p_identity jsonb, p_cid text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_key text; v_detail text;
BEGIN
  v_key := 'fleet-write-denied:' || p_principal || ':' || p_table;
  v_detail := format(
    'Principal %s attempted a FLEET write into public.%s and was refused. Identifying fields on the attempted row: %s. A fleet row binds every client, so only an active fleet operator may write one. Nothing was written.',
    p_principal, p_table, coalesce(p_identity::text, '{}'));

  UPDATE public.improvement_signals
     SET sightings   = coalesce(sightings, 1) + 1,
         last_seen_at = now(),
         detail_md   = v_detail
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

GRANT EXECUTE ON FUNCTION public.record_fleet_write_denial(text,text,jsonb,text) TO cob_intel_writer;

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

    -- An attempted fleet write is intelligence. Record it on a connection of
    -- its own so the record survives the rollback that is about to happen.
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
