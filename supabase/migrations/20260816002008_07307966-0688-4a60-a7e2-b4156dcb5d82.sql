-- HARDEN-14 P3 · THE AUDIT TRAIL
-- Principal ruling, verbatim: "AUDIT TRAIL = read yes, write never, delete never."
-- SELECT scoped to the tenant. No INSERT, UPDATE or DELETE policy exists on any of
-- these registers, for the principal or for an operator. They fill only from triggers
-- and governed SECURITY DEFINER writers, as a byproduct of real work.
-- A forged receipt is worse than a deleted one: a gap is something you notice, a
-- fabricated line reads as evidence. The defect that opened this program was a
-- scheduler reporting 4,320 successes it never performed.

do $$
declare
  t text;
  tables text[] := array[
    'change_ledger','probe_runs','save_attempt','save_receipts','execution_receipts',
    'work_merge_receipt','work_reschedule_receipt','boot_log','session_event','mcp_usage_events'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t||'_audit_read', t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (cid = public.current_cid())
    $f$, t||'_audit_read', t);

    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);

    execute format($c$comment on table public.%I is
      'HARDEN-14 P3: audit trail. Read yes, write never, delete never. Scoped SELECT only - no insert, update or delete policy exists for the principal or for an operator. Written solely by triggers and governed SECURITY DEFINER writers as a byproduct of real work. A forged receipt is worse than a deleted one: a gap is something you notice, a fabricated line reads as evidence.'$c$, t);
  end loop;
end $$;

-- authority_access_receipts keys the tenant on target_cid and already carries an
-- operator read policy from HARDEN-12; the client gets the same visibility of
-- decisions taken about their own data.
drop policy if exists authority_receipts_tenant_read on public.authority_access_receipts;
create policy authority_receipts_tenant_read on public.authority_access_receipts
  for select to authenticated
  using (target_cid = public.current_cid());

revoke insert, update, delete on public.authority_access_receipts from authenticated, anon;
grant select on public.authority_access_receipts to authenticated;
grant all on public.authority_access_receipts to service_role;

comment on table public.authority_access_receipts is
  'HARDEN-14 P3: audit trail. Read yes, write never, delete never. The client reads every authority decision recorded about their own tenant; nobody hand-authors a row.';