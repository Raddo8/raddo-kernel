-- HARDEN-10 · ITEM 1 (lane A) · resolver + name-keyed readers re-keyed to CID.
-- Reversible: the prior bodies are name-keyed; a rollback recreates them but MUST NOT
-- restore public/anon grants (see grant block at the end).

CREATE OR REPLACE FUNCTION public.resolve_cid_strict(k text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_cid text; n int;
begin
  if k is null or btrim(k) = '' then return null; end if;

  -- (1) a CID is an exact key
  if exists (select 1 from tenants t where t.cid = k) then return k; end if;

  -- (2) a registered, non-ambiguous alias is an exact key
  select count(*) into n from tenant_alias a
   where a.alias = k and not coalesce(a.ambiguous,false);
  if n = 1 then
    select a.cid into v_cid from tenant_alias a
     where a.alias = k and not coalesce(a.ambiguous,false);
    return v_cid;
  elsif n > 1 then
    raise exception 'NAMES_ARE_NEVER_KEYS: alias "%" maps to % tenants. Pass a CID.', k, n
      using errcode='22023';
  end if;

  -- (3) a display or COB name is presentation, never a key
  select count(*) into n from tenants t where t.display_name = k or t.cob_name = k;
  if n > 0 then
    raise exception 'NAMES_ARE_NEVER_KEYS: "%" is a display name held by % tenant(s), not an identity key. Pass a CID.', k, n
      using errcode='22023';
  end if;

  return null;
end
$function$;

COMMENT ON FUNCTION public.resolve_cid_strict(text) IS
  'HARDEN-10. Canonical identity resolution. CID or unambiguous registered alias only; a display name is refused, never resolved.';

-- ── hq_blueprints_read() · caller identity, CID only ──────────────────────────
CREATE OR REPLACE FUNCTION public.hq_blueprints_read()
RETURNS TABLE(id uuid, title text, intent text, status text, owner text, loop_cadence text, current_state text, next_action text, milestones jsonb, version integer, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cid text; v_status text;
BEGIN
  SELECT out_status, out_cid INTO v_status, v_cid FROM public.resolve_tenant_context(NULL);
  IF v_status IS DISTINCT FROM 'OK' OR v_cid IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT b.id,b.title,b.intent,b.status,b.owner,b.loop_cadence,b.current_state,b.next_action,b.milestones,b.version,b.updated_at
    FROM public.blueprints b
    WHERE b.cid = v_cid AND b.status <> 'retired'
    ORDER BY b.created_at;
END; $function$;

CREATE OR REPLACE FUNCTION public.hq_blueprints_read(p_cid text)
RETURNS TABLE(id uuid, title text, intent text, status text, owner text, loop_cadence text, current_state text, next_action text, milestones jsonb, version integer, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cid text;
BEGIN
  v_cid := public.resolve_cid_strict(p_cid);   -- raises on a name
  IF v_cid IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT b.id,b.title,b.intent,b.status,b.owner,b.loop_cadence,b.current_state,b.next_action,b.milestones,b.version,b.updated_at
    FROM public.blueprints b
    WHERE b.cid = v_cid AND b.status <> 'retired'
    ORDER BY b.created_at;
END; $function$;

CREATE OR REPLACE FUNCTION public.hq_blueprints_read(p_workspace_id uuid)
RETURNS TABLE(id uuid, title text, intent text, status text, owner text, loop_cadence text, current_state text, next_action text, milestones jsonb, version integer, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cid text;
BEGIN
  IF NOT public.is_workspace_member(auth.uid(), p_workspace_id) THEN RETURN; END IF;
  SELECT w.cid INTO v_cid FROM workspaces w WHERE w.id = p_workspace_id;
  IF v_cid IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT b.id,b.title,b.intent,b.status,b.owner,b.loop_cadence,b.current_state,b.next_action,b.milestones,b.version,b.updated_at
    FROM public.blueprints b
    WHERE b.cid = v_cid AND b.status <> 'retired'
    ORDER BY b.created_at;
END; $function$;

-- ── hq_scheduled_read · CID only ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hq_scheduled_read()
RETURNS TABLE(id uuid, blueprint_id uuid, program text, title text, detail text, run_at timestamp with time zone, cadence text, seq integer, status text, outcome text, spec_status text, gates_total integer, gates_passed integer, owner text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cid text; v_status text;
BEGIN
  SELECT out_status, out_cid INTO v_status, v_cid FROM public.resolve_tenant_context(NULL);
  IF v_status IS DISTINCT FROM 'OK' OR v_cid IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.id,s.blueprint_id,s.program,s.title,s.detail,s.run_at,s.cadence,s.seq,s.status,s.outcome,s.spec_status,s.gates_total,s.gates_passed,s.owner
    FROM public.scheduled_actions s
    WHERE s.cid = v_cid
    ORDER BY s.run_at NULLS LAST, s.seq;
END; $function$;

CREATE OR REPLACE FUNCTION public.hq_scheduled_read(p_cid text)
RETURNS TABLE(id uuid, blueprint_id uuid, program text, title text, detail text, run_at timestamp with time zone, cadence text, seq integer, status text, outcome text, spec_status text, gates_total integer, gates_passed integer, owner text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cid text;
BEGIN
  v_cid := public.resolve_cid_strict(p_cid);
  IF v_cid IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.id,s.blueprint_id,s.program,s.title,s.detail,s.run_at,s.cadence,s.seq,s.status,s.outcome,s.spec_status,s.gates_total,s.gates_passed,s.owner
    FROM public.scheduled_actions s
    WHERE s.cid = v_cid
    ORDER BY s.run_at NULLS LAST, s.seq;
END; $function$;

CREATE OR REPLACE FUNCTION public.hq_scheduled_read(p_workspace_id uuid)
RETURNS TABLE(id uuid, blueprint_id uuid, program text, title text, detail text, run_at timestamp with time zone, cadence text, seq integer, status text, outcome text, spec_status text, gates_total integer, gates_passed integer, owner text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cid text;
BEGIN
  IF NOT public.is_workspace_member(auth.uid(), p_workspace_id) THEN RETURN; END IF;
  SELECT w.cid INTO v_cid FROM workspaces w WHERE w.id = p_workspace_id;
  IF v_cid IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.id,s.blueprint_id,s.program,s.title,s.detail,s.run_at,s.cadence,s.seq,s.status,s.outcome,s.spec_status,s.gates_total,s.gates_passed,s.owner
    FROM public.scheduled_actions s
    WHERE s.cid = v_cid
    ORDER BY s.run_at NULLS LAST, s.seq;
END; $function$;

-- ── hq_records_keys_v1 · the key set is the CID, nothing else ─────────────────
CREATE OR REPLACE FUNCTION public.hq_records_keys_v1(_cid text)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- HARDEN-10: a display name is never a key. The key set is the CID alone.
  SELECT array_remove(ARRAY[public.resolve_cid_strict(_cid)], NULL);
$function$;

-- ── bringup_state · resolves to a CID, refuses a name ────────────────────────
CREATE OR REPLACE FUNCTION public.bringup_state(p_tenant text)
RETURNS TABLE(seq integer, stage text, state text, evidence text)
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
declare v_kid uuid; v_ver int; n int; ok boolean; v_cid text; v_name text;
begin
  begin
    v_cid := public.resolve_cid_strict(p_tenant);
  exception when others then
    seq:=0; stage:='IDENTITY'; state:='REFUSED';
    evidence:=SQLERRM; return next; return;
  end;

  if v_cid is null then
    seq:=0; stage:='IDENTITY'; state:='REFUSED';
    evidence:='No tenant carries the identifier '||coalesce(p_tenant,'(null)')||'. Bring-up is reported by CID only.';
    return next; return;
  end if;

  select t.display_name into v_name from tenants t where t.cid = v_cid;

  seq:=0; stage:='IDENTITY'; state:='PASS';
  evidence:=v_cid||' ('||coalesce(v_name,'unnamed')||')'; return next;

  seq:=1; stage:='TENANT_ROW';
  select count(*) into n from tenants t where t.cid = v_cid;
  state:=case when n>0 then 'PASS' else 'FAIL' end;
  evidence:=n||' row(s) in tenants'; return next;

  seq:=2; stage:='KERNEL_ACTIVE';
  select k.id, k.version into v_kid, v_ver from kernels k where k.cid = v_cid and k.status='active';
  state:=case when v_kid is not null then 'PASS' else 'FAIL' end;
  evidence:=coalesce('active kernel v'||v_ver, 'no active kernel; boots the flagged fallback every time'); return next;

  seq:=3; stage:='KERNEL_PARTS_VERIFIED';
  if v_kid is null then state:='BLOCKED'; evidence:='no kernel to verify';
  else
    select count(*) into n from kernel_parts p where p.kernel_id=v_kid;
    select count(*)=0 into ok from kernel_parts p where p.kernel_id=v_kid
      and (p.sha256 <> encode(sha256(convert_to(p.content_md,'UTF8')),'hex') or p.bytes <> octet_length(p.content_md));
    state:=case when ok then 'PASS' else 'FAIL' end;
    evidence:=n||' parts; hash and byte contract '||case when ok then 'verified' else 'MISMATCH' end;
  end if; return next;

  seq:=4; stage:='ROSTER_IN_KERNEL';
  if v_kid is null then state:='BLOCKED'; evidence:='no kernel';
  else
    select count(*) into n from kernel_parts p where p.kernel_id=v_kid and p.part='roster';
    state:=case when n>0 then 'PASS' else 'FAIL' end;
    evidence:=case when n>0 then 'roster part present' else 'no roster part; Council resolves from the global hard-code' end;
  end if; return next;

  seq:=5; stage:='OFFICE_MAPPED';
  select count(*) into n from tenant_offices o where o.cid = v_cid and o.status='active';
  state:=case when n>0 then 'PASS' else 'FAIL' end;
  evidence:=case when n>0 then 'tenant_offices row active' else 'no tenant_offices row; file_to_office fails closed' end; return next;

  seq:=6; stage:='BOOT_EVIDENCE_NO_FALLBACK';
  select count(*) into n from boot_log b where b.cid = v_cid and b.fallback_used=false;
  state:=case when n>0 then 'PASS' else 'FAIL' end;
  evidence:=n||' server-written boot(s) with fallback_used=false'; return next;

  seq:=7; stage:='OFFICE_WRITE_PROVEN';
  select count(*) into n from mcp_usage_events e where e.cid = v_cid and e.tool='file_to_office';
  state:=case when n>0 then 'PASS' else 'FAIL' end;
  evidence:=n||' file_to_office call(s) recorded'; return next;

  seq:=8; stage:='GOALS_RATIFIED';
  select count(*) into n from goals g where g.cid = v_cid;
  state:=case when n>0 then 'PASS' else 'FAIL' end;
  evidence:=n||' goal row(s); destination state '||case when n>0 then 'present' else 'INCOMPLETE' end; return next;

  seq:=9; stage:='CONNECTOR_IDENTITY_CLAIM';
  state:='UNCHECKABLE';
  evidence:='tenant claim and tenant_map live on the separate auth project, not reachable from this store. Must be probed at the gateway, never inferred here.'; return next;

  seq:=10; stage:='FIRST_BRIEFING';
  state:='UNCHECKABLE';
  evidence:='no table records a delivered briefing. Nothing in this store can prove this stage.'; return next;
end $function$;

-- ── grants · least privilege, no public/anon anywhere ────────────────────────
REVOKE ALL ON FUNCTION public.resolve_cid_strict(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_cid_strict(text) TO service_role, authenticated;

REVOKE ALL ON FUNCTION public.bringup_state(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bringup_state(text) TO service_role;

REVOKE ALL ON FUNCTION public.hq_records_keys_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hq_records_keys_v1(text) TO service_role;

REVOKE ALL ON FUNCTION public.hq_blueprints_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_blueprints_read() TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.hq_blueprints_read(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hq_blueprints_read(text) TO service_role;
REVOKE ALL ON FUNCTION public.hq_blueprints_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_blueprints_read(uuid) TO service_role, authenticated;

REVOKE ALL ON FUNCTION public.hq_scheduled_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_scheduled_read() TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.hq_scheduled_read(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hq_scheduled_read(text) TO service_role;
REVOKE ALL ON FUNCTION public.hq_scheduled_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_scheduled_read(uuid) TO service_role, authenticated;