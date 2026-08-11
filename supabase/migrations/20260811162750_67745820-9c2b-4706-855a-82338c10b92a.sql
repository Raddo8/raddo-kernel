-- ── M3 · CONCURRENCY-SAFE curn ────────────────────────────────────────────
CREATE TABLE public.curn_sequence (
  cid text NOT NULL,
  kind text NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cid, kind),
  CONSTRAINT curn_sequence_kind_chk CHECK (kind IN ('S','D'))
);

GRANT ALL ON public.curn_sequence TO service_role;
ALTER TABLE public.curn_sequence ENABLE ROW LEVEL SECURITY;
-- No policy: the allocator is SECURITY DEFINER; nothing else reads this.

CREATE OR REPLACE FUNCTION public.next_curn(p_cid text, p_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if p_cid is null or btrim(p_cid) = '' then
    raise exception 'CURN_CID_REQUIRED' using errcode = '22023';
  end if;
  if p_kind not in ('S','D') then
    raise exception 'CURN_KIND_UNKNOWN: % (S|D)', p_kind using errcode = '22023';
  end if;

  -- One row per (cid, kind). The UPDATE ... RETURNING takes the row lock, so
  -- two concurrent writers queue rather than collide. No count(*) anywhere.
  insert into curn_sequence (cid, kind, last_value)
  values (p_cid, p_kind, 1)
  on conflict (cid, kind) do update
    set last_value = curn_sequence.last_value + 1,
        updated_at = now()
  returning last_value into v_n;

  return p_cid || '-' || p_kind || '-' || lpad(v_n::text, 5, '0');
end $function$;

-- ── Backfill history in date order, per tenant ────────────────────────────
-- The decisions completion gate would refuse legacy rows mid-backfill; it is
-- a rule about new claims, not a reason to leave history unnumbered.
ALTER TABLE public.decisions DISABLE TRIGGER trg_enforce_decision_completion_proof;

-- Seed the counter from the highest numeric suffix already in use per tenant.
INSERT INTO public.curn_sequence (cid, kind, last_value)
SELECT cid, 'S',
       coalesce(max((regexp_match(curn, '-S-([0-9]+)$'))[1]::int), 0)
FROM public.improvement_signals
WHERE cid IS NOT NULL AND curn IS NOT NULL
GROUP BY cid
ON CONFLICT (cid, kind) DO UPDATE SET last_value = excluded.last_value;

INSERT INTO public.curn_sequence (cid, kind, last_value)
SELECT cid, 'D',
       coalesce(max((regexp_match(curn, '-D-([0-9]+)$'))[1]::int), 0)
FROM public.decisions
WHERE cid IS NOT NULL AND curn IS NOT NULL
GROUP BY cid
ON CONFLICT (cid, kind) DO UPDATE SET last_value = excluded.last_value;

-- Signals
WITH ranked AS (
  SELECT s.id, s.cid,
         row_number() OVER (PARTITION BY s.cid ORDER BY s.first_seen NULLS LAST, s.id) AS rn
  FROM public.improvement_signals s
  WHERE s.curn IS NULL AND s.cid IS NOT NULL
), assigned AS (
  SELECT r.id, r.cid,
         r.cid || '-S-' || lpad((coalesce(q.last_value,0) + r.rn)::text, 5, '0') AS new_curn
  FROM ranked r
  LEFT JOIN public.curn_sequence q ON q.cid = r.cid AND q.kind = 'S'
)
UPDATE public.improvement_signals s
SET curn = a.new_curn
FROM assigned a
WHERE s.id = a.id;

-- Decisions
WITH ranked AS (
  SELECT d.id, d.cid,
         row_number() OVER (PARTITION BY d.cid ORDER BY d.decided_at NULLS LAST, d.id) AS rn
  FROM public.decisions d
  WHERE d.curn IS NULL AND d.cid IS NOT NULL
), assigned AS (
  SELECT r.id, r.cid,
         r.cid || '-D-' || lpad((coalesce(q.last_value,0) + r.rn)::text, 5, '0') AS new_curn
  FROM ranked r
  LEFT JOIN public.curn_sequence q ON q.cid = r.cid AND q.kind = 'D'
)
UPDATE public.decisions d
SET curn = a.new_curn
FROM assigned a
WHERE d.id = a.id;

-- Move the counters past everything now in use.
INSERT INTO public.curn_sequence (cid, kind, last_value)
SELECT cid, 'S', coalesce(max((regexp_match(curn, '-S-([0-9]+)$'))[1]::int), 0)
FROM public.improvement_signals WHERE cid IS NOT NULL AND curn IS NOT NULL
GROUP BY cid
ON CONFLICT (cid, kind) DO UPDATE SET last_value = greatest(curn_sequence.last_value, excluded.last_value);

INSERT INTO public.curn_sequence (cid, kind, last_value)
SELECT cid, 'D', coalesce(max((regexp_match(curn, '-D-([0-9]+)$'))[1]::int), 0)
FROM public.decisions WHERE cid IS NOT NULL AND curn IS NOT NULL
GROUP BY cid
ON CONFLICT (cid, kind) DO UPDATE SET last_value = greatest(curn_sequence.last_value, excluded.last_value);

ALTER TABLE public.decisions ENABLE TRIGGER trg_enforce_decision_completion_proof;

ALTER TABLE public.improvement_signals ALTER COLUMN curn SET NOT NULL;
ALTER TABLE public.decisions ALTER COLUMN curn SET NOT NULL;

-- ── Allocators in the two writers ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_signal(p_title text, p_detail_md text DEFAULT NULL::text, p_pattern text DEFAULT NULL::text, p_signal_type text DEFAULT NULL::text, p_status text DEFAULT 'open'::text, p_client_ref text DEFAULT NULL::text, p_cid text DEFAULT NULL::text, p_provenance text DEFAULT 'CLIENT'::text, p_source_session_id text DEFAULT NULL::text, p_source_subject text DEFAULT NULL::text, p_source_surface text DEFAULT NULL::text, p_tool_version text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_cid text; v_role text; v_curn text; v_id uuid; v_auth boolean; v_check uuid;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  if p_cid is not null then
    if v_role <> 'service_role' then
      raise exception 'SIGNAL_CID_NOT_ACCEPTED_FROM_CLIENT: p_cid is accepted only from a service_role caller.' using errcode='42501'; end if;
    if not exists (select 1 from tenants t where t.cid=p_cid) then
      raise exception 'SIGNAL_UNKNOWN_CID: %', p_cid using errcode='23503'; end if;
    v_cid := p_cid;
  else v_cid := public.current_cid(); end if;
  if v_cid is null then raise exception 'SIGNAL_UNAUTHENTICATED: no resolvable CID' using errcode='28000'; end if;
  if p_title is null or btrim(p_title)='' then raise exception 'SIGNAL_TITLE_REQUIRED' using errcode='22023'; end if;
  if p_provenance not in ('CLIENT','OPERATOR','QA','TEST','MIGRATED_LEGACY','UNKNOWN_LEGACY') then
    raise exception 'SIGNAL_BAD_PROVENANCE: %', p_provenance using errcode='22023'; end if;
  v_auth := p_provenance not in ('TEST','QA','UNKNOWN_LEGACY');

  if p_client_ref is not null then
    select id into v_id from improvement_signals where cid=v_cid and curn=v_cid||'-S-'||p_client_ref;
    if v_id is not null then return jsonb_build_object('ok',true,'idempotent',true,'id',v_id,'cid',v_cid); end if;
    v_curn := v_cid||'-S-'||p_client_ref;
  else
    v_curn := public.next_curn(v_cid, 'S');
  end if;

  insert into improvement_signals (cid, curn, pattern, detail_md, status, audience, silent,
     provenance, authoritative, test_run_id, source_session_id, source_subject, source_surface, tool_version)
  values (v_cid, v_curn, coalesce(p_pattern,p_title), coalesce(p_detail_md,p_title), coalesce(p_status,'open'),
     coalesce(p_signal_type,'process'), false, p_provenance, v_auth,
     case when v_auth then null else coalesce(p_client_ref,'unlabelled-test') end,
     p_source_session_id, p_source_subject, p_source_surface, p_tool_version)
  returning id into v_id;
  select id into v_check from improvement_signals where id=v_id and cid=v_cid;
  if v_check is null then raise exception 'SIGNAL_WRITE_UNVERIFIED' using errcode='25000'; end if;
  return jsonb_build_object('ok',true,'idempotent',false,'id',v_id,'cid',v_cid,'curn',v_curn,'provenance',p_provenance,'authoritative',v_auth,'verified',true);
end $function$;

CREATE OR REPLACE FUNCTION public.record_decision(p_title text, p_decision_md text, p_rationale_md text DEFAULT NULL::text, p_decision_owner text DEFAULT NULL::text, p_execution_owner text DEFAULT NULL::text, p_reversibility text DEFAULT NULL::text, p_authority_tier text DEFAULT NULL::text, p_client_ref text DEFAULT NULL::text, p_cid text DEFAULT NULL::text, p_provenance text DEFAULT 'CLIENT'::text, p_source_session_id text DEFAULT NULL::text, p_source_subject text DEFAULT NULL::text, p_source_surface text DEFAULT NULL::text, p_tool_version text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_cid text; v_role text; v_curn text; v_id uuid; v_auth boolean; v_check uuid;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  if p_cid is not null then
    if v_role <> 'service_role' then
      raise exception 'DECISION_CID_NOT_ACCEPTED_FROM_CLIENT: p_cid is accepted only from a service_role caller.' using errcode='42501'; end if;
    if not exists (select 1 from tenants t where t.cid=p_cid) then
      raise exception 'DECISION_UNKNOWN_CID: %', p_cid using errcode='23503'; end if;
    v_cid := p_cid;
  else v_cid := public.current_cid(); end if;
  if v_cid is null then raise exception 'DECISION_UNAUTHENTICATED: no resolvable CID' using errcode='28000'; end if;
  if p_title is null or btrim(p_title)='' then raise exception 'DECISION_TITLE_REQUIRED' using errcode='22023'; end if;
  if p_provenance not in ('CLIENT','OPERATOR','QA','TEST') then
    raise exception 'DECISION_BAD_PROVENANCE: % (CLIENT|OPERATOR|QA|TEST)', p_provenance using errcode='22023'; end if;
  v_auth := p_provenance not in ('TEST','QA');

  if p_client_ref is not null then
    select id into v_id from decisions where cid=v_cid and curn=v_cid||'-D-'||p_client_ref;
    if v_id is not null then return jsonb_build_object('ok',true,'idempotent',true,'id',v_id,'cid',v_cid); end if;
    v_curn := v_cid||'-D-'||p_client_ref;
  else
    v_curn := public.next_curn(v_cid, 'D');
  end if;

  insert into decisions (cid, curn, title, decision_md, rationale_md, authority_tier, reversibility, decided_by,
                         provenance, authoritative, test_run_id, source_session_id, source_subject, source_surface, tool_version)
  values (v_cid, v_curn, p_title, coalesce(p_decision_md,p_title), p_rationale_md, p_authority_tier, p_reversibility,
          coalesce(p_decision_owner,'unspecified'), p_provenance, v_auth,
          case when v_auth then null else coalesce(p_client_ref,'unlabelled-test') end,
          p_source_session_id, p_source_subject, p_source_surface, p_tool_version)
  returning id into v_id;

  select id into v_check from decisions where id = v_id and cid = v_cid;
  if v_check is null then
    raise exception 'DECISION_WRITE_UNVERIFIED: insert reported success but the row is not readable' using errcode='25000'; end if;

  return jsonb_build_object('ok',true,'idempotent',false,'id',v_id,'cid',v_cid,'curn',v_curn,
    'provenance',p_provenance,'authoritative',v_auth,'verified',true);
end $function$;