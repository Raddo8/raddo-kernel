create extension if not exists "pgcrypto";

create table if not exists public.consult_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  name text,
  current_state_words jsonb not null,
  aspiration_state_words jsonb not null,
  theme_gap_analysis jsonb not null,
  app_inventory jsonb not null,
  other_apps_text text,
  disc_responses jsonb not null,
  disc_scores jsonb not null,
  primary_style text not null,
  secondary_style text not null,
  is_hybrid boolean not null default false,
  persona_name_candidates text[] not null default '{}'
);

alter table public.consult_submissions enable row level security;

create policy "anon can insert consult_submissions"
  on public.consult_submissions
  for insert
  to anon, authenticated
  with check (true);

create policy "deny select to anon and authenticated"
  on public.consult_submissions
  as restrictive
  for select
  to anon, authenticated
  using (false);

create policy "deny update on consult_submissions"
  on public.consult_submissions
  as restrictive
  for update
  to anon, authenticated
  using (false);

create policy "deny delete on consult_submissions"
  on public.consult_submissions
  as restrictive
  for delete
  to anon, authenticated
  using (false);