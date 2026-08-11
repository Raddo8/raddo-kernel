
CREATE OR REPLACE FUNCTION public.enforce_fleet_write_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_principal text;
BEGIN
  -- Deterministic, not a default: a row that names a client belongs to it.
  -- A row that names none is left unmarked and refused by the check, unless
  -- the writer says FLEET out loud and can prove the authority to.
  IF NEW.tenancy IS NULL AND NEW.cid IS NOT NULL THEN
    NEW.tenancy := 'TENANT'::public.tenancy_t;
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
