-- HARDEN-10 · ITEM 1 (lane B) · self-identity, activation guard, annotations, grants.

-- ── my_tenant · never LIMIT 1 across memberships ─────────────────────────────
CREATE OR REPLACE FUNCTION public.my_tenant()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_status text; v_cid text; v_row tenants%rowtype;
begin
  select out_status, out_cid into v_status, v_cid from public.resolve_tenant_context(NULL);
  if v_status is distinct from 'OK' or v_cid is null then
    return jsonb_build_object('cid', null, 'status', v_status,
      'reason_human', case v_status
        when 'AMBIGUOUS' then 'This account belongs to more than one workspace. Identity is never guessed; an operator has to say which one.'
        when 'NO_MEMBERSHIP' then 'This account is not attached to a workspace yet.'
        when 'UNAUTHENTICATED' then 'Not signed in.'
        else 'Identity could not be resolved.' end);
  end if;
  select * into v_row from tenants t where t.cid = v_cid;
  return jsonb_build_object('cid', v_row.cid, 'display_name', v_row.display_name,
    'cob_name', v_row.cob_name, 'status', v_row.status);
end $function$;

-- ── my_cob · CID-keyed already; make the refusal legible, keep the shape ─────
CREATE OR REPLACE FUNCTION public.my_cob()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_status text; v_cid text; v_row tenants%rowtype;
begin
  select out_status, out_cid into v_status, v_cid from public.resolve_tenant_context(NULL);
  if v_status is distinct from 'OK' or v_cid is null then
    return jsonb_build_object('cid', null, 'status', v_status);
  end if;
  select * into v_row from tenants t where t.cid = v_cid;
  return jsonb_build_object(
    'cid', v_row.cid,
    'cob_name', coalesce(nullif(btrim(v_row.cob_name),''), 'COB'),
    'named', (nullif(btrim(v_row.cob_name),'') is not null),
    'display_name', v_row.display_name,
    'principal', v_row.principal,
    'status', v_row.status);
end $function$;

-- ── kernel activation guard · keyed on CID ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_duplicate_name_kernel_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_others int;
begin
  if new.status = 'active' and coalesce(old.status,'') <> 'active' then
    if new.cid is null then
      raise exception 'KERNEL_ACTIVATION_REFUSED_NO_CID: kernel % carries no CID. A kernel is activated for an identity, never for a name.', new.id
        using errcode='55006';
    end if;
    -- The only real ambiguity is two live kernels for one identity.
    select count(*) into v_others from kernels k
     where k.cid = new.cid and k.status = 'active' and k.id <> new.id;
    if v_others > 0 then
      raise exception 'DUPLICATE_KERNEL_ACTIVATION_HELD: % already holds % active kernel(s). Retire the incumbent before activating another.', new.cid, v_others
        using errcode='55006';
    end if;
  end if;
  return new;
end $function$;

COMMENT ON FUNCTION public.my_tenant() IS 'HARDEN-10. CID-keyed. Refuses on ambiguous membership; display_name is output only.';
COMMENT ON FUNCTION public.my_cob() IS 'HARDEN-10. CID-keyed via resolve_tenant_context; display_name and cob_name are presentation only.';
COMMENT ON FUNCTION public.guard_duplicate_name_kernel_activation() IS 'HARDEN-10. Activation ambiguity is measured per CID. tenant_id and aliases are no longer consulted.';
COMMENT ON FUNCTION public.admin_activity_read(text,text[],timestamptz,integer,timestamptz) IS 'HARDEN-10. Filters and joins on cid; cob_name/display_name are rendered, never matched.';
COMMENT ON FUNCTION public.admin_cid_audit(text) IS 'HARDEN-10. Keyed on p_cid against tenants.cid; names are reported, never looked up.';
COMMENT ON FUNCTION public.admin_fleet_live(timestamptz) IS 'HARDEN-10. Every counter joins on cid; names are display columns.';
COMMENT ON FUNCTION public.cid_null_watchdog() IS 'HARDEN-10. Reports the tenant label of an unstamped row as evidence only; attribution is by CID.';
COMMENT ON FUNCTION public.hq_records_fleet_v1() IS 'HARDEN-10. All aggregates join on t.cid; display_name and cob_name are output columns.';
COMMENT ON FUNCTION public.memory_write_v1(text,text,text,text,numeric,text,uuid,text,text) IS 'HARDEN-10. cid is the identity; the tenant column is a denormalised display label written from tenants.display_name and is never read back as a key.';
COMMENT ON FUNCTION public.mint_tenant(uuid,text,text,text) IS 'HARDEN-10. Mints a fresh CID; display_name is stored as presentation and is never a uniqueness test.';
COMMENT ON FUNCTION public.redeem_access_code(text,text,text) IS 'HARDEN-10. Binds by auth subject and CID; the supplied name is passed through as presentation only.';
COMMENT ON FUNCTION public.stamp_memory_cid() IS 'HARDEN-10. Stamps current_cid(); refuses rather than inferring a tenant from a name.';
COMMENT ON FUNCTION public.stamp_row_cid() IS 'HARDEN-10. Stamps current_cid(); refuses rather than inferring a tenant from a name.';
COMMENT ON FUNCTION public.bringup_state(text) IS 'HARDEN-10. Resolves to a CID first and refuses a display name; every stage counts rows by cid.';
COMMENT ON FUNCTION public.hq_records_keys_v1(text) IS 'HARDEN-10. Returns the CID alone. Name keys were removed.';

-- ── grants · no public/anon; server-only helpers to service_role ─────────────
REVOKE ALL ON FUNCTION public.my_tenant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_tenant() TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.my_cob() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_cob() TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.admin_cid_audit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cid_audit(text) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.admin_fleet_live(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_fleet_live(timestamptz) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.admin_activity_read(text,text[],timestamptz,integer,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activity_read(text,text[],timestamptz,integer,timestamptz) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.hq_records_fleet_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hq_records_fleet_v1() TO service_role;
REVOKE ALL ON FUNCTION public.memory_write_v1(text,text,text,text,numeric,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.memory_write_v1(text,text,text,text,numeric,text,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.mint_tenant(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_tenant(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.cid_null_watchdog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cid_null_watchdog() TO service_role;
REVOKE ALL ON FUNCTION public.redeem_access_code(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_access_code(text,text,text) TO service_role, authenticated;