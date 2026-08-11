
CREATE OR REPLACE FUNCTION public.enforce_fleet_write_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_principal text;
BEGIN
  IF NEW.tenancy IS DISTINCT FROM 'FLEET'::public.tenancy_t THEN
    RETURN NEW;
  END IF;

  -- H2.4 · route into the repaired operator check. Never re-decide authority here.
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

DO $mig$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'tenancy'
       AND t.table_type = 'BASE TABLE'
     ORDER BY c.table_name
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_fleet_write_authority ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER zz_fleet_write_authority BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_fleet_write_authority()',
      r.table_name);
  END LOOP;
END $mig$;
