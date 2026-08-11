-- ── M2 · STOP THE TENANCY BLEEDING ────────────────────────────────────────
-- The display_name lookup is deleted outright. It matched two tenants for
-- 'JAEL' and silently fell through, which is how 65 open_loops rows landed
-- with cid NULL. A row that cannot be attributed is refused, never written.

CREATE OR REPLACE FUNCTION public.stamp_row_cid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cid text;
  v_tenant text := NULL;
BEGIN
  IF NEW.cid IS NOT NULL THEN
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

CREATE OR REPLACE FUNCTION public.stamp_memory_cid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cid text;
  v_tenant text := NULL;
BEGIN
  IF NEW.cid IS NOT NULL THEN
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

-- work_item had no stamping at all. Same rule, same refusal.
DROP TRIGGER IF EXISTS trg_stamp_cid ON public.work_item;
CREATE TRIGGER trg_stamp_cid
  BEFORE INSERT ON public.work_item
  FOR EACH ROW EXECUTE FUNCTION public.stamp_row_cid();