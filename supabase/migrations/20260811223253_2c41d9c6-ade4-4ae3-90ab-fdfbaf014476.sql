
CREATE OR REPLACE FUNCTION public.stamp_row_cid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cid text;
  v_tenant text := NULL;
  v_tenancy text := NULL;
BEGIN
  IF NEW.cid IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- A row declared fleet-wide legitimately carries no client identifier.
  -- Whether the writer may declare it is the fleet-authority check's ruling, not this one's.
  BEGIN
    v_tenancy := NEW.tenancy::text;
  EXCEPTION WHEN undefined_column THEN
    v_tenancy := NULL;
  END;
  IF v_tenancy = 'FLEET' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_tenant := NEW.tenant;
  EXCEPTION WHEN undefined_column THEN
    v_tenant := NULL;
  END;

  v_cid := public.current_cid();

  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'CID_UNRESOLVED: public.% cannot be written without a tenant. Attempted tenant: %. The caller has no resolvable session (public.current_cid() returned null), and a tenant is never guessed from a display name. Pass cid explicitly from a server-side resolved identity.',
      TG_TABLE_NAME, coalesce(v_tenant,'(none)') USING ERRCODE = '28000';
  END IF;

  NEW.cid := v_cid;
  RETURN NEW;
END;
$function$;
