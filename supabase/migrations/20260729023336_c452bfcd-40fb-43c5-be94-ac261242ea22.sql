alter table public.execution_receipts
  add column if not exists identity_status text,
  add column if not exists identity_candidates jsonb;

alter table public.execution_receipts
  drop constraint if exists execution_receipts_outcome_chk;
alter table public.execution_receipts
  add constraint execution_receipts_outcome_chk
  check (outcome in ('ok','error','degraded'));

alter table public.execution_receipts
  drop constraint if exists execution_receipts_auth_mode_chk;
alter table public.execution_receipts
  add constraint execution_receipts_auth_mode_chk
  check (auth_mode is null or auth_mode in ('static','oauth'));

alter table public.execution_receipts
  drop constraint if exists execution_receipts_identity_status_chk;
alter table public.execution_receipts
  add constraint execution_receipts_identity_status_chk
  check (identity_status is null or identity_status in ('RESOLVED','AMBIGUOUS','UNRESOLVED'));

alter table public.execution_receipts
  drop constraint if exists execution_receipts_duration_chk;
alter table public.execution_receipts
  add constraint execution_receipts_duration_chk
  check (duration_ms is null or duration_ms >= 0);

alter table public.execution_receipts
  drop constraint if exists execution_receipts_effects_shape_chk;
alter table public.execution_receipts
  add constraint execution_receipts_effects_shape_chk
  check (
    jsonb_typeof(declared_effects) = 'array'
    and jsonb_typeof(observed_effects) = 'array'
    and jsonb_typeof(undeclared_effects) = 'array'
    and jsonb_typeof(canonical_refs) = 'object'
    and jsonb_typeof(notes) = 'object'
  );

alter table public.execution_receipts
  drop constraint if exists execution_receipts_contract_ok_derived_chk;
alter table public.execution_receipts
  add constraint execution_receipts_contract_ok_derived_chk
  check (contract_ok = (jsonb_array_length(undeclared_effects) = 0));

alter table public.execution_receipts
  drop constraint if exists execution_receipts_evidence_size_chk;
alter table public.execution_receipts
  add constraint execution_receipts_evidence_size_chk
  check (
    length(canonical_refs::text) <= 4096
    and length(notes::text) <= 4096
  );

create or replace function public.execution_receipts_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'execution_receipts is append-only: % is not permitted', tg_op;
end;
$$;

drop trigger if exists execution_receipts_no_update on public.execution_receipts;
create trigger execution_receipts_no_update
  before update on public.execution_receipts
  for each row execute function public.execution_receipts_append_only();

drop trigger if exists execution_receipts_no_delete on public.execution_receipts;
create trigger execution_receipts_no_delete
  before delete on public.execution_receipts
  for each row execute function public.execution_receipts_append_only();

comment on table public.execution_receipts is
  'PKT-0A execution evidence. Append-only ENFORCED by trigger, not by convention: UPDATE and DELETE raise, including for the service role. Service-role access only. Pointers, counts and outcomes; never business content. cid is authoritative identity and is NULL whenever identity did not resolve to exactly one candidate; tenant_display is a label and may collide by design.';