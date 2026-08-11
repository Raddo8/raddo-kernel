-- HARDEN-05 · D1 · the completion gate removed a capability from every tenant.
-- record_decision is the only governed decision writer and it exposed no way
-- to cite a probe, so any decision whose wording contained a completion word
-- was unwritable by anyone. It also wrote p_client_ref into test_run_id, the
-- exact column the gate reads, overloading it with something that is not a
-- probe id.
--
-- The two new parameters are APPENDED, so every existing positional caller
-- still resolves against the same argument order.

DROP FUNCTION IF EXISTS public.record_decision(text,text,text,text,text,text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.record_decision(
  p_title text,
  p_decision_md text,
  p_rationale_md text DEFAULT NULL::text,
  p_decision_owner text DEFAULT NULL::text,
  p_execution_owner text DEFAULT NULL::text,
  p_reversibility text DEFAULT NULL::text,
  p_authority_tier text DEFAULT NULL::text,
  p_client_ref text DEFAULT NULL::text,
  p_cid text DEFAULT NULL::text,
  p_provenance text DEFAULT 'CLIENT'::text,
  p_source_session_id text DEFAULT NULL::text,
  p_source_subject text DEFAULT NULL::text,
  p_source_surface text DEFAULT NULL::text,
  p_tool_version text DEFAULT NULL::text,
  p_test_run_id text DEFAULT NULL::text,
  p_verification_state text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cid text; v_role text; v_curn text; v_id uuid; v_auth boolean; v_check uuid;
  v_probe_id uuid; v_probe record; v_state text; v_raw text;
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

  -- ── D1 · validate the cited proof inside the writer ─────────────────────
  v_raw := nullif(btrim(coalesce(p_test_run_id,'')),'');
  if v_raw is not null then
    begin
      v_probe_id := v_raw::uuid;
    exception when others then
      raise exception 'DECISION_PROOF_MALFORMED: test_run_id % is not a uuid. Cite the id returned by record_probe.', v_raw
        using errcode='22023';
    end;

    select r.id, r.cid, r.passed into v_probe from probe_runs r where r.id = v_probe_id;
    if v_probe.id is null then
      raise exception 'DECISION_PROOF_NOT_FOUND: no probe_runs row with id %. Record the probe first.', v_probe_id
        using errcode='23503';
    end if;
    if v_probe.cid is distinct from v_cid then
      raise exception 'DECISION_PROOF_FOREIGN: probe % belongs to another client. A decision may only cite its own tenant''s proof.', v_probe_id
        using errcode='42501';
    end if;
    if v_probe.passed is not true then
      raise exception 'DECISION_PROOF_FAILED: probe % recorded passed=false. A failed probe is not proof.', v_probe_id
        using errcode='22023';
    end if;
  end if;

  -- Resolve the claimed state through the controlled vocabulary, the same way
  -- the register does, so a writer is judged on meaning not spelling.
  select a.canonical into v_state
    from verification_state_alias a
   where a.alias = lower(btrim(coalesce(p_verification_state,'')));
  v_state := coalesce(v_state, nullif(btrim(coalesce(p_verification_state,'')),''));

  -- A passing probe cited with no state stated means probe_passed. That is the
  -- whole point of citing it.
  if v_state is null and v_probe_id is not null then
    v_state := 'probe_passed';
  end if;

  if v_state in ('probe_passed','verified') and v_probe_id is null then
    raise exception 'DECISION_PROOF_REQUIRED: verification_state % claims proof but no probe is cited. Record the probe with record_probe and pass its id as test_run_id.', v_state
      using errcode='22023';
  end if;

  if p_client_ref is not null then
    select id into v_id from decisions where cid=v_cid and curn=v_cid||'-D-'||p_client_ref;
    if v_id is not null then return jsonb_build_object('ok',true,'idempotent',true,'id',v_id,'cid',v_cid); end if;
    v_curn := v_cid||'-D-'||p_client_ref;
  else
    v_curn := public.next_curn(v_cid, 'D');
  end if;

  insert into decisions (cid, curn, title, decision_md, rationale_md, authority_tier, reversibility, decided_by,
                         provenance, authoritative, test_run_id, verification_state,
                         source_session_id, source_subject, source_surface, tool_version)
  values (v_cid, v_curn, p_title, coalesce(p_decision_md,p_title), p_rationale_md, p_authority_tier, p_reversibility,
          coalesce(p_decision_owner,'unspecified'), p_provenance, v_auth,
          -- D1 · this column holds a probe id or null. Never a client label.
          case when v_probe_id is null then null else v_probe_id::text end,
          v_state,
          p_source_session_id, p_source_subject, p_source_surface, p_tool_version)
  returning id into v_id;

  select id into v_check from decisions where id = v_id and cid = v_cid;
  if v_check is null then
    raise exception 'DECISION_WRITE_UNVERIFIED: insert reported success but the row is not readable' using errcode='25000'; end if;

  return jsonb_build_object('ok',true,'idempotent',false,'id',v_id,'cid',v_cid,'curn',v_curn,
    'provenance',p_provenance,'authoritative',v_auth,
    'verification_state',v_state,'test_run_id',v_probe_id,'verified',true);
end $function$;

GRANT EXECUTE ON FUNCTION public.record_decision(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) TO service_role, authenticated;