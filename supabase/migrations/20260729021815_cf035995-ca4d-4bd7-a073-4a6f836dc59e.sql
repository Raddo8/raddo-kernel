create table if not exists public.execution_receipts (
  id                        uuid primary key default gen_random_uuid(),
  request_id                text not null,
  correlation_id            text not null,
  cid                       text,
  tenant_display            text,
  authenticated_sub         text,
  auth_mode                 text,
  surface                   text,
  tool                      text not null,
  contract_version          text not null,
  effects_catalog_version   text not null,
  build_id                  text,
  declared_effects          jsonb not null default '[]'::jsonb,
  observed_effects          jsonb not null default '[]'::jsonb,
  undeclared_effects        jsonb not null default '[]'::jsonb,
  contract_ok               boolean not null default true,
  outcome                   text not null,
  error_class               text,
  canonical_refs            jsonb not null default '{}'::jsonb,
  notes                     jsonb not null default '{}'::jsonb,
  started_at                timestamptz,
  duration_ms               integer,
  created_at                timestamptz not null default now()
);

create unique index if not exists execution_receipts_request_id_key
  on public.execution_receipts (request_id);

create index if not exists execution_receipts_cid_created_idx
  on public.execution_receipts (cid, created_at desc);

create index if not exists execution_receipts_tool_created_idx
  on public.execution_receipts (tool, created_at desc);

create index if not exists execution_receipts_contract_violation_idx
  on public.execution_receipts (created_at desc)
  where contract_ok = false;

alter table public.execution_receipts enable row level security;

comment on table public.execution_receipts is
  'PKT-0A append-only execution evidence. Service-role only. Pointers and outcomes, never business content. cid is authoritative identity; tenant_display is a label and may collide.';