-- HARDEN-14 P1 · THE WORKING WORLD
-- One register class: the tenant's own working registers.
-- Read and write scoped to cid = current_cid(); FLEET rows are readable by all
-- principals and writable by none (operator write continues through the governed
-- path, and FLEET_WRITE_DENIED enforces the write half independently).
-- WITH CHECK is present on every write policy: read scoping without write scoping
-- is a cross-tenant write hole.

do $$
declare
  t text;
  tables text[] := array[
    'open_loops','work_item','decisions','improvement_signals','memory_entries',
    'blueprints','storyline','tenant_surfaces','comms','scheduled_actions','doctrine_rules'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t||'_office_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_office_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_office_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_office_delete', t);

    -- READ: your own tenant, plus the FLEET rows that govern you.
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (cid = public.current_cid() or tenancy = 'FLEET' or public.is_fleet_operator())
    $f$, t||'_office_read', t);

    -- INSERT: only into your own tenant, only as TENANT tenancy.
    execute format($f$
      create policy %I on public.%I
        for insert to authenticated
        with check (cid = public.current_cid() and tenancy = 'TENANT')
    $f$, t||'_office_insert', t);

    -- UPDATE: your own TENANT rows only, and the row must stay yours.
    execute format($f$
      create policy %I on public.%I
        for update to authenticated
        using (cid = public.current_cid() and tenancy = 'TENANT')
        with check (cid = public.current_cid() and tenancy = 'TENANT')
    $f$, t||'_office_update', t);

    -- DELETE: your own TENANT rows only. The client-facing answer to "delete this"
    -- is OFF (P4); this exists so the office is genuinely theirs, not so rows vanish.
    execute format($f$
      create policy %I on public.%I
        for delete to authenticated
        using (cid = public.current_cid() and tenancy = 'TENANT')
    $f$, t||'_office_delete', t);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);

    execute format($c$comment on table public.%I is
      'HARDEN-14 P1: office register. Principal reads and writes rows where cid = current_cid(). FLEET rows are readable by every principal and writable by none - they should see what governs them and must not be able to rewrite it.'$c$, t);
  end loop;
end $$;