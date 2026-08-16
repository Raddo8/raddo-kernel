-- HARDEN-14 P2 · THE IDENTITY KERNEL
-- Principal ruling, verbatim: "IDENTITY KERNEL = read yes, write absolutely not."
-- SELECT scoped to the owning tenant. No INSERT, UPDATE or DELETE policy exists
-- for any principal role, so every write attempt is refused regardless of role.
-- Operator write continues through the existing governed SECURITY DEFINER path,
-- and the PROTECTED IDENTITY REGISTRY still forbids re-authoring COB_PROFILE,
-- KNOX and SPINNEY at all.

drop policy if exists kernels_office_read on public.kernels;
drop policy if exists kernel_parts_office_read on public.kernel_parts;

create policy kernels_office_read on public.kernels
  for select to authenticated
  using (cid = public.current_cid());

create policy kernel_parts_office_read on public.kernel_parts
  for select to authenticated
  using (cid = public.current_cid());

revoke insert, update, delete on public.kernels from authenticated, anon;
revoke insert, update, delete on public.kernel_parts from authenticated, anon;
grant select on public.kernels to authenticated;
grant select on public.kernel_parts to authenticated;
grant all on public.kernels to service_role;
grant all on public.kernel_parts to service_role;

comment on table public.kernels is
  'HARDEN-14 P2: read yes, write absolutely not. A client kernel is not a preference, it is the thing that makes their COB behave like theirs. The owning principal must be able to read exactly what governs them and must not be able to edit it out from under themselves. No write policy exists for any principal role; operator write runs through the governed path only.';
comment on table public.kernel_parts is
  'HARDEN-14 P2: read yes, write absolutely not. Readable by the owning principal, writable by no principal under any role. Operator write runs through the governed path only, and the protected identity registry still forbids re-authoring COB_PROFILE, KNOX and SPINNEY.';