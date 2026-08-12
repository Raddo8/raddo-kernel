-- ============ J2 · TENANCY BACKFILL ============
set local cob.intel_writer = 'on';

create table if not exists public.tenancy_quarantine_row (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_pk text,
  row_json jsonb not null,
  reason text not null,
  quarantined_at timestamptz not null default now()
);
grant select on public.tenancy_quarantine_row to authenticated;
grant all on public.tenancy_quarantine_row to service_role;
alter table public.tenancy_quarantine_row enable row level security;
create policy "operators read tenancy quarantine"
  on public.tenancy_quarantine_row for select to authenticated
  using (public.is_operator(auth.uid()));

create temporary table _lbl(label text primary key, cid text) on commit drop;
insert into _lbl(label,cid) values
  ('COB-HQ','CID-100001'),('cob-hq','CID-100001'),('AEL','CID-100002'),
  ('JAEL','CID-100002'),('JAEL-PWA','CID-100003'),('ROC','CID-100004'),
  ('SPINNEY','CID-100005'),('CAP','CID-100006'),('JAKE818','CID-100007');

-- FLEET registers: the fleet owns the row; client_label / tenant_scope is a reference, not ownership.
update public.fleet_artifacts      set tenancy='FLEET' where tenancy is null and cid is null;
update public.fleet_qa_scorecard   set tenancy='FLEET' where tenancy is null and cid is null;
update public.fleet_skill_install  set tenancy='FLEET' where tenancy is null and cid is null;

-- tenant-labelled registers
update public.blueprints b set tenancy='TENANT', cid=l.cid from _lbl l where b.tenancy is null and b.cid is null and b.tenant_id=l.label;
update public.boot_log   t set tenancy='TENANT', cid=l.cid from _lbl l where t.tenancy is null and t.cid is null and t.tenant_id=l.label;
update public.change_log t set tenancy='TENANT', cid=l.cid from _lbl l where t.tenancy is null and t.cid is null and t.tenant_id=l.label;
update public.directives t set tenancy='TENANT', cid=l.cid from _lbl l where t.tenancy is null and t.cid is null and t.tenant_id=l.label;
alter table public.execution_receipts disable trigger execution_receipts_no_update;
update public.execution_receipts t set tenancy='TENANT', cid=l.cid from _lbl l where t.tenancy is null and t.cid is null and t.tenant_display=l.label;
update public.mcp_usage_events   t set tenancy='TENANT', cid=l.cid from _lbl l where t.tenancy is null and t.cid is null and t.tenant=l.label;
update public.memory_entries     t set tenancy='TENANT', cid=l.cid from _lbl l where t.tenancy is null and t.cid is null and t.tenant=l.label;
alter table public.protected_artifacts disable trigger trg_guard_protected_artifacts;
update public.protected_artifacts t set tenancy='TENANT', cid=l.cid from _lbl l where t.tenancy is null and t.cid is null and t.tenant=l.label;
update public.ritual_runs        t set tenancy='TENANT', cid=l.cid from _lbl l where t.tenancy is null and t.cid is null and t.tenant=l.label;
update public.session_checkpoints t set tenancy='TENANT', cid=l.cid from _lbl l where t.tenancy is null and t.cid is null and t.tenant=l.label;
update public.tenant_offices     t set tenancy='TENANT', cid=l.cid from _lbl l where t.tenancy is null and t.cid is null and t.tenant=l.label;
update public.tenant_surfaces    t set tenancy='TENANT', cid=l.cid from _lbl l where t.tenancy is null and t.cid is null and t.tenant=l.label;

-- unlabelled fleet-side rows
update public.protected_artifacts set tenancy='FLEET' where tenancy is null and cid is null and tenant is null;
alter table public.protected_artifacts enable trigger trg_guard_protected_artifacts;
update public.execution_receipts  set tenancy='FLEET' where tenancy is null and cid is null and tenant_display is null;
alter table public.execution_receipts enable trigger execution_receipts_no_update;
-- the alias registry is fleet infrastructure; the ambiguous row carries no cid by design
update public.tenant_alias set tenancy='FLEET' where tenancy is null and cid is null;

-- connector installs follow their principal binding
update public.connector_installations ci
   set tenancy='TENANT', cid=b.cid
  from public.principal_binding b
 where ci.tenancy is null and ci.cid is null and b.principal_id=ci.principal_id and b.cid is not null;

insert into public.tenancy_quarantine_row(table_name,row_pk,row_json,reason)
select 'connector_installations', ci.installation_id::text, to_jsonb(ci),
       'principal has no binding in principal_binding; ownership not provable on evidence'
  from public.connector_installations ci where ci.tenancy is null;
delete from public.connector_installations where tenancy is null;

-- the change ledger inherits the marking of the row it audits
do $j2$
declare r record; n bigint;
begin
  for r in select distinct table_name, pk_col from public.change_ledger where tenancy is null and pk_col is not null loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=r.table_name)
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name=r.pk_col)
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='tenancy') then
      execute format(
        'update public.change_ledger cl set tenancy=t.tenancy, cid=t_cid
           from (select %I::text as k, tenancy, %s as t_cid from public.%I) t
          where cl.tenancy is null and cl.table_name=%L and cl.row_pk=t.k and t.tenancy is not null',
        r.pk_col,
        case when exists (select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='cid')
             then 'cid' else 'null::text' end,
        r.table_name, r.table_name);
    end if;
  end loop;
  get diagnostics n = row_count;
end $j2$;

insert into public.tenancy_quarantine_row(table_name,row_pk,row_json,reason)
select 'change_ledger', cl.ledger_id::text, to_jsonb(cl),
       'the audited row no longer exists or carries no marking of its own; ownership not provable on evidence'
  from public.change_ledger cl where cl.tenancy is null;
delete from public.change_ledger where tenancy is null;

-- workspaces cannot be resolved and must not be destroyed: mark and report
alter table public.workspaces add column if not exists tenancy_quarantine_reason text;
update public.workspaces
   set tenancy_quarantine_reason='self-serve workspace with no cid and no tenant label; ownership not provable on evidence'
 where tenancy is null and tenancy_quarantine_reason is null;

insert into public.tenancy_quarantine_row(table_name,row_pk,row_json,reason)
select 'workspaces', w.id::text, to_jsonb(w),
       'self-serve workspace with no cid and no tenant label; row left in place because live records reference it'
  from public.workspaces w where w.tenancy is null
  and not exists (select 1 from public.tenancy_quarantine_row q where q.table_name='workspaces' and q.row_pk=w.id::text);

-- make the marking mandatory everywhere it is now complete
alter table public.blueprints              alter column tenancy set not null;
alter table public.boot_log                alter column tenancy set not null;
alter table public.change_ledger           alter column tenancy set not null;
alter table public.change_log              alter column tenancy set not null;
alter table public.connector_installations alter column tenancy set not null;
alter table public.directives              alter column tenancy set not null;
alter table public.execution_receipts      alter column tenancy set not null;
alter table public.fleet_artifacts         alter column tenancy set not null;
alter table public.fleet_qa_scorecard      alter column tenancy set not null;
alter table public.fleet_skill_install     alter column tenancy set not null;
alter table public.mcp_usage_events        alter column tenancy set not null;
alter table public.memory_entries          alter column tenancy set not null;
alter table public.protected_artifacts     alter column tenancy set not null;
alter table public.ritual_runs             alter column tenancy set not null;
alter table public.session_checkpoints     alter column tenancy set not null;
alter table public.tenant_alias            alter column tenancy set not null;
alter table public.tenant_offices          alter column tenancy set not null;
alter table public.tenant_surfaces         alter column tenancy set not null;

-- validate every coupling check that was left NOT VALID
do $v$
declare c record;
begin
  for c in select conrelid::regclass::text as rel, conname from pg_constraint
            where contype='c' and not convalidated and conname like '%tenancy_cid_check' loop
    begin
      execute format('alter table %s validate constraint %I', c.rel, c.conname);
    exception when others then
      raise notice 'validate failed % %: %', c.rel, c.conname, sqlerrm;
    end;
  end loop;
end $v$;

-- ============ J2d · blueprint_write can no longer write an untenanted row ============

create or replace function public.cob_blueprint_write(p_cid text, p_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_intent text DEFAULT NULL::text, p_current_state text DEFAULT NULL::text, p_next_action text DEFAULT NULL::text, p_owner text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_loop_cadence text DEFAULT NULL::text, p_milestones jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cid text; v_key text; v_lbl text[]; v_id uuid; v_before jsonb;
begin
  v_cid := public.cob_guard(p_cid);
  v_key := public.cob_tenant_key_or_cid(v_cid);
  v_lbl := public.cob_tenant_labels(v_cid);

  if p_status is not null and p_status not in ('active','blocked','done','retired') then
    raise exception 'COB_BLUEPRINT_BAD_STATUS: use active, blocked, done or retired (got %)', p_status using errcode='22023'; end if;
  if p_owner is not null and p_owner not in ('cob','client','shared') then
    raise exception 'COB_BLUEPRINT_BAD_OWNER: use cob, client or shared (got %)', p_owner using errcode='22023'; end if;
  if p_loop_cadence is not null and p_loop_cadence not in ('daily','weekly','monthly','event') then
    raise exception 'COB_BLUEPRINT_BAD_CADENCE: use daily, weekly, monthly or event (got %)', p_loop_cadence using errcode='22023'; end if;

  if p_id is null then
    if coalesce(btrim(p_title),'')='' then raise exception 'COB_BLUEPRINT_NEEDS_TITLE' using errcode='22023'; end if;
    insert into blueprints (tenant_id, cid, tenancy, title, intent, current_state, next_action, owner, status, loop_cadence, milestones, version)
    values (v_key, v_cid, 'TENANT'::public.tenancy_t, p_title, p_intent, p_current_state, p_next_action,
            coalesce(p_owner,'cob'), coalesce(p_status,'active'), coalesce(p_loop_cadence,'event'),
            coalesce(p_milestones,'[]'::jsonb), 1)
    returning id into v_id;
    return jsonb_build_object('ok',true,'action','create','id',v_id,'tenant_id',v_key,'cid',v_cid,
      'human','Opened. It is on your Blueprints board now.');
  end if;

  select to_jsonb(b) into v_before from blueprints b where b.id=p_id and b.tenant_id = any(v_lbl);
  if v_before is null then raise exception 'COB_BLUEPRINT_NOT_FOUND_IN_TENANT' using errcode='23503'; end if;
  update blueprints set
    title=coalesce(p_title,title), intent=coalesce(p_intent,intent),
    current_state=coalesce(p_current_state,current_state), next_action=coalesce(p_next_action,next_action),
    owner=coalesce(p_owner,owner), status=coalesce(p_status,status),
    loop_cadence=coalesce(p_loop_cadence,loop_cadence),
    milestones=coalesce(p_milestones,milestones), version=version+1, updated_at=now()
  where id=p_id and tenant_id = any(v_lbl) returning id into v_id;
  return jsonb_build_object('ok',true,'action','advance','id',v_id,'before',v_before,
    'human','Advanced. The version moved and the record kept what it was before.');
end $function$;

-- ============ J3 · INVOCATION vs OBSERVATION ============

alter table public.probe_runs add column if not exists probe_kind text;
update public.probe_runs set probe_kind='INVOCATION' where probe_kind is null;
alter table public.probe_runs alter column probe_kind set default 'INVOCATION';
alter table public.probe_runs alter column probe_kind set not null;
alter table public.probe_runs drop constraint if exists probe_runs_probe_kind_check;
alter table public.probe_runs add constraint probe_runs_probe_kind_check
  check (probe_kind in ('INVOCATION','OBSERVATION'));

-- the real rule: a probe may never name a direct write against its own subject
create or replace function public.probe_method_writes_subject(p_method text, p_subject_ref text)
returns boolean language sql immutable as $$
  with s as (
    select regexp_replace(coalesce(p_subject_ref,''), '^.*[\.:/ ]', '') as name
  )
  select case when coalesce((select name from s),'') = '' then false
    else coalesce(p_method,'') ~* (
      '\m(insert\s+into|update|delete\s+from|upsert\s+into|copy)\M[^;]{0,80}\m'
      || regexp_replace((select name from s), '([^a-zA-Z0-9_])', '\\\1', 'g') || '\M')
      or coalesce(p_method,'') ~* '\m(hand[- ]set|fixture|inserted\s+(straight\s+)?into)\M'
    end;
$$;

create or replace function public.probe_method_is_observation(p_method text)
returns boolean language sql immutable as $$
  SELECT coalesce(p_method,'') ~* '(\mselect\M)|(\mquery\M)|(\mread\M)|(\mobserv)|(\mcount\()|(\mpg_[a-z_]+\M)|(\minformation_schema\M)|(\mpsql\M)|(\mcurl\M)|(\martifact\M)|(\mfile\M)|(\mlog\M)';
$$;

create or replace function public.record_probe(
  p_subject_kind text, p_subject_ref text, p_claim text, p_method text,
  p_expected text, p_observed text, p_passed boolean,
  p_cid text DEFAULT NULL::text, p_probe_kind text DEFAULT 'INVOCATION')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cid   text;
  v_role  text;
  v_actor text;
  v_id    uuid;
  v_kind  text;
  v_claims json;
BEGIN
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  v_role   := coalesce(v_claims->>'role', '');

  v_cid := public.current_cid();
  IF v_cid IS NULL THEN
    IF v_role = 'service_role' THEN
      v_cid := public.cob_guard(p_cid);
    ELSE
      RAISE EXCEPTION 'CID_UNRESOLVED: a probe cannot be recorded without a resolvable tenant.'
        USING ERRCODE = '28000';
    END IF;
  END IF;

  v_kind := upper(coalesce(nullif(btrim(p_probe_kind),''),'INVOCATION'));
  IF v_kind NOT IN ('INVOCATION','OBSERVATION') THEN
    RAISE EXCEPTION 'PROBE_KIND_UNKNOWN: probe_kind must be INVOCATION or OBSERVATION (got %).', p_probe_kind
      USING ERRCODE = '22023';
  END IF;

  IF p_passed IS NULL THEN
    RAISE EXCEPTION 'PROBE_NEEDS_VERDICT: passed must be true or false.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_claim),'') = '' OR coalesce(btrim(p_method),'') = ''
     OR coalesce(btrim(p_expected),'') = '' OR coalesce(btrim(p_observed),'') = '' THEN
    RAISE EXCEPTION 'PROBE_NEEDS_EVIDENCE: claim, method, expected and observed are all required.'
      USING ERRCODE = '22023';
  END IF;

  -- the one rule that applies to both kinds
  IF public.probe_method_writes_subject(p_method, p_subject_ref) THEN
    RAISE EXCEPTION 'PROBE_METHOD_WRITES_ITS_OWN_SUBJECT: a row written straight into the subject under test is a fixture, not a probe. Method read: %', left(p_method, 200)
      USING ERRCODE = '22023';
  END IF;

  IF v_kind = 'INVOCATION' AND NOT public.probe_method_is_entry_point(p_method) THEN
    RAISE EXCEPTION 'PROBE_METHOD_NOT_AN_ENTRY_POINT: an invocation probe must name the function or endpoint it called. Record it as OBSERVATION if it read a query or an artifact. Method read: %', left(p_method, 200)
      USING ERRCODE = '22023';
  END IF;

  IF v_kind = 'OBSERVATION' AND NOT public.probe_method_is_observation(p_method) THEN
    RAISE EXCEPTION 'PROBE_METHOD_NAMES_NO_READ: an observation probe must name the query or artifact it read. Method read: %', left(p_method, 200)
      USING ERRCODE = '22023';
  END IF;

  v_actor := coalesce(
    v_claims->>'email',
    nullif(auth.uid()::text, ''),
    CASE WHEN v_role = 'service_role' THEN 'connector:service_role' ELSE NULL END,
    session_user
  );

  INSERT INTO public.probe_runs
    (cid, subject_kind, subject_ref, claim, method, expected, observed, passed, ran_by, probe_kind)
  VALUES
    (v_cid, p_subject_kind, p_subject_ref, p_claim, p_method, p_expected, p_observed, p_passed, v_actor, v_kind)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'probe_id', v_id,
    'test_run_id', v_id::text,
    'cid', v_cid,
    'probe_kind', v_kind,
    'passed', p_passed,
    'ran_by', v_actor,
    'note', CASE WHEN p_passed
      THEN 'Recorded. Put this probe_id in test_run_id and set verification_state to probe_passed to claim completion.'
      ELSE 'Recorded as a failure. A failed probe cannot carry a completion claim.' END
  );
END
$function$;

-- ============ J4 · connection_inventory retired ============
comment on table public.connection_inventory is
  'RETIRED 2026-08-12 (HARDEN-09 J4): never written in its lifetime; connector_installations is the live counterpart and carries principal, surface, scopes and status.';
drop table if exists public.connection_inventory;