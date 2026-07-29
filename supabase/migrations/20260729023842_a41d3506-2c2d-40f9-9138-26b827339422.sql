alter table public.execution_receipts
  add column if not exists tool_catalogued boolean not null default true;

alter table public.execution_receipts
  drop constraint if exists execution_receipts_contract_ok_derived_chk;

alter table public.execution_receipts
  add constraint execution_receipts_contract_ok_derived_chk
  check (contract_ok = (jsonb_array_length(undeclared_effects) = 0 and tool_catalogued));

comment on column public.execution_receipts.tool_catalogued is
  'False when the invoked tool is absent from the effect catalog. contract_ok is derived from this column AND undeclared_effects, never supplied independently by a caller.';