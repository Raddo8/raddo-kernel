-- HARDEN-05 · D4 · escalation_state is written at render time, so a tenant
-- whose principal has not booted reads as healthy. Health must derive from
-- surfaced_count, which is a fact about the mechanism, not from
-- escalation_state, which is a rendering artifact.

CREATE OR REPLACE FUNCTION public.fleet_surfacing_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not is_fleet_operator() then
    raise exception 'ADMIN_AUDIT_DENIED: fleet operator only' using errcode='42501';
  end if;

  select jsonb_agg(x order by x->>'cid') into v from (
    select jsonb_build_object(
      'cid', t.cid,
      'principal', t.principal,
      -- Every number below is computed from surfaced_count. escalation_state
      -- is deliberately absent as a source; it is reported only so an
      -- operator can see the render lag, never to decide health.
      'open_items', (select count(*) from open_loops o
                      where o.cid=t.cid and o.brief_status='open' and o.superseded_by is null),
      'surfaced_3_plus', (select count(*) from open_loops o
                      where o.cid=t.cid and o.brief_status='open' and o.superseded_by is null
                        and coalesce(o.surfaced_count,0) >= 3),
      'surfaced_8_plus', (select count(*) from open_loops o
                      where o.cid=t.cid and o.brief_status='open' and o.superseded_by is null
                        and coalesce(o.surfaced_count,0) >= 8),
      'max_surfaced', (select coalesce(max(coalesce(o.surfaced_count,0)),0) from open_loops o
                      where o.cid=t.cid and o.brief_status='open' and o.superseded_by is null),
      'last_render', (select max(o.last_surfaced) from open_loops o where o.cid=t.cid),
      -- Render lag: how many count-qualified rows the render has not caught up
      -- to yet. Diagnostic only.
      'unstamped_at_8_plus', (select count(*) from open_loops o
                      where o.cid=t.cid and o.brief_status='open' and o.superseded_by is null
                        and coalesce(o.surfaced_count,0) >= 8 and o.escalation_state is null),
      'surfacing_healthy', (select count(*) from open_loops o
                      where o.cid=t.cid and o.brief_status='open' and o.superseded_by is null
                        and coalesce(o.surfaced_count,0) >= 8) = 0
    ) x from tenants t) s;

  return jsonb_build_object('ok', true, 'source', 'surfaced_count',
    'basis', 'escalation_state is a rendering artifact and is never a health source',
    'tenants', coalesce(v,'[]'::jsonb));
end $function$;

GRANT EXECUTE ON FUNCTION public.fleet_surfacing_health() TO authenticated, service_role;

-- The operator fleet board carried open_loops counts with no surfacing signal
-- at all, which is why this afternoon's read named COB-HQ as the only tenant
-- with a problem. Same derivation, same table.
CREATE OR REPLACE FUNCTION public.admin_fleet_board()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not is_fleet_operator() then
    raise exception 'ADMIN_AUDIT_DENIED: fleet operator only' using errcode='42501';
  end if;
  insert into admin_audit_access(operator, operator_email, target_cid, action)
  values (auth.uid(), (select email from auth.users where id=auth.uid()), 'ALL', 'fleet_board');
  select jsonb_agg(x order by x->>'cid') into v from (
    select jsonb_build_object(
      'cid', t.cid, 'cob_name', t.cob_name, 'principal', t.principal, 'status', t.status,
      'active_logins', (select count(*) from tenant_members m where m.cid=t.cid and m.status='ACTIVE'),
      'entities', (select count(*) from world_entities w where w.cid=t.cid),
      'claims', (select count(*) from world_claims c where c.cid=t.cid and c.status<>'voided'),
      'memories', (select count(*) from memory_entries m where m.cid=t.cid),
      'open_loops', (select count(*) from open_loops o where o.cid=t.cid and o.state='open'),
      -- D4 · derived from surfaced_count, never from escalation_state.
      'surfaced_8_plus', (select count(*) from open_loops o
                           where o.cid=t.cid and o.brief_status='open' and o.superseded_by is null
                             and coalesce(o.surfaced_count,0) >= 8),
      'surfacing_healthy', (select count(*) from open_loops o
                           where o.cid=t.cid and o.brief_status='open' and o.superseded_by is null
                             and coalesce(o.surfaced_count,0) >= 8) = 0,
      'last_save', (select max(created_at) from save_receipts r where r.cid=t.cid),
      'reachable', (select count(*) from tenant_members m where m.cid=t.cid and m.status='ACTIVE')>0
    ) x from tenants t) s;
  return coalesce(v,'[]'::jsonb);
end $function$;