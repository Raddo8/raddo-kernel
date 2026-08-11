
CREATE OR REPLACE FUNCTION public.enforce_fleet_write_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_principal text;
  v_json jsonb;
  v_label text;
  v_cid text;
BEGIN
  IF NEW.tenancy IS NULL AND NEW.cid IS NOT NULL THEN
    NEW.tenancy := 'TENANT'::public.tenancy_t;
  END IF;

  -- No marker and no client identifier · read the client out of the row before
  -- refusing it. Resolution order: tenant label on the row, then the caller's
  -- own resolved session. Never a display-name guess: resolve_cid is the only
  -- authority and returns null when it cannot be sure.
  IF NEW.tenancy IS NULL AND NEW.cid IS NULL THEN
    v_json := to_jsonb(NEW);
    v_label := coalesce(v_json->>'tenant', v_json->>'tenant_id', v_json->>'tenant_key');
    IF v_label IS NOT NULL THEN
      BEGIN
        SELECT public.resolve_cid(v_label) INTO v_cid;
      EXCEPTION WHEN others THEN v_cid := NULL;
      END;
    END IF;
    IF v_cid IS NULL THEN
      BEGIN
        SELECT public.current_cid() INTO v_cid;
      EXCEPTION WHEN others THEN v_cid := NULL;
      END;
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
    RAISE EXCEPTION 'FLEET_WRITE_DENIED: principal % may not write a FLEET row into public.%. A fleet row binds every client, so only an active fleet operator can write one. Nothing was written. If this is for your principal, write it as TENANT.',
      v_principal, TG_TABLE_NAME
      USING ERRCODE = '42501';
  END;
END
$fn$;
