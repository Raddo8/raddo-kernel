-- s0_security_containment_reconciliation
-- Reconciliation of state applied live on 2026-08-02. No-op against current DB.
-- sandbox_exec grants are intentionally untouched.

revoke execute on function public.bridge_claim_next() from public;
revoke execute on function public.bridge_claim_next() from anon;
revoke execute on function public.bridge_claim_next() from authenticated;
grant execute on function public.bridge_claim_next() to service_role;

revoke execute on function public.bridge_reap_stale_claims() from public;
revoke execute on function public.bridge_reap_stale_claims() from anon;
revoke execute on function public.bridge_reap_stale_claims() from authenticated;
grant execute on function public.bridge_reap_stale_claims() to service_role;

revoke execute on function public.is_operator(uuid) from public;
revoke execute on function public.is_operator(uuid) from anon;

revoke execute on function public.is_workspace_member(uuid, uuid) from public;
revoke execute on function public.is_workspace_member(uuid, uuid) from anon;

revoke execute on function public.redeem_access_code(text, text, text) from public;
revoke execute on function public.redeem_access_code(text, text, text) from anon;

revoke execute on function public.verify_cron_token(text, text) from public;
revoke execute on function public.verify_cron_token(text, text) from anon;

do $$
declare r record;
begin
  for r in
    select distinct c.relname, g.grantee
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral (values ('authenticated'), ('anon')) as g(grantee)
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and has_table_privilege(g.grantee, c.oid, 'TRUNCATE')
  loop
    execute format('revoke truncate on table public.%I from %I', r.relname, r.grantee);
  end loop;
end $$;

alter table public.principals enable row level security;
alter table public.external_identities enable row level security;
alter table public.tenant_memberships_v2 enable row level security;