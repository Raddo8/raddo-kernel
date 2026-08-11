-- ══ HARDEN-02 · H1 · record_probe ═════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_probe(
  p_subject_kind text,
  p_subject_ref  text,
  p_claim        text,
  p_method       text,
  p_expected     text,
  p_observed     text,
  p_passed       boolean,
  p_cid          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cid   text;
  v_role  text;
  v_actor text;
  v_id    uuid;
  v_claims json;
BEGIN
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  v_role   := coalesce(v_claims->>'role', '');

  -- cid is resolved server-side. The connector reaches us as service_role and
  -- has no auth.uid(); in that one case the gateway's own server-derived cid is
  -- accepted, and cob_guard proves it names a real tenant. It is never taken
  -- from a model-authored tool argument.
  v_cid := public.current_cid();
  IF v_cid IS NULL THEN
    IF v_role = 'service_role' THEN
      v_cid := public.cob_guard(p_cid);
    ELSE
      RAISE EXCEPTION 'CID_UNRESOLVED: a probe cannot be recorded without a resolvable tenant.'
        USING ERRCODE = '28000';
    END IF;
  END IF;

  IF p_passed IS NULL THEN
    RAISE EXCEPTION 'PROBE_NEEDS_VERDICT: passed must be true or false.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_claim),'') = '' OR coalesce(btrim(p_method),'') = ''
     OR coalesce(btrim(p_expected),'') = '' OR coalesce(btrim(p_observed),'') = '' THEN
    RAISE EXCEPTION 'PROBE_NEEDS_EVIDENCE: claim, method, expected and observed are all required.'
      USING ERRCODE = '22023';
  END IF;

  v_actor := coalesce(
    v_claims->>'email',
    nullif(auth.uid()::text, ''),
    CASE WHEN v_role = 'service_role' THEN 'connector:service_role' ELSE NULL END,
    session_user
  );

  INSERT INTO public.probe_runs
    (cid, subject_kind, subject_ref, claim, method, expected, observed, passed, ran_by)
  VALUES
    (v_cid, p_subject_kind, p_subject_ref, p_claim, p_method, p_expected, p_observed, p_passed, v_actor)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'probe_id', v_id,
    'test_run_id', v_id::text,
    'cid', v_cid,
    'passed', p_passed,
    'ran_by', v_actor,
    'note', CASE WHEN p_passed
      THEN 'Recorded. Put this probe_id in test_run_id and set verification_state to probe_passed to claim completion.'
      ELSE 'Recorded as a failure. A failed probe cannot carry a completion claim.' END
  );
END
$$;

REVOKE ALL ON FUNCTION public.record_probe(text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_probe(text,text,text,text,text,text,boolean,text) TO authenticated, service_role;

-- ══ H1 · the governed decision writer can now carry its proof ═════════════
CREATE OR REPLACE FUNCTION public.cob_decision_write(
  p_cid text,
  p_title text,
  p_decision_md text,
  p_rationale_md text DEFAULT NULL,
  p_reversibility text DEFAULT NULL,
  p_decided_by text DEFAULT NULL,
  p_minute_id uuid DEFAULT NULL,
  p_supersedes uuid DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_verification_state text DEFAULT NULL,
  p_test_run_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_cid text; v_id uuid; v_curn text;
BEGIN
  v_cid := public.cob_guard(p_cid);
  IF coalesce(btrim(p_title),'') = '' OR coalesce(btrim(p_decision_md),'') = '' THEN
    RAISE EXCEPTION 'COB_DECISION_NEEDS_TITLE_AND_BODY: a decision needs what was decided, in words'
      USING ERRCODE = '22023';
  END IF;
  IF p_supersedes IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM decisions d WHERE d.id = p_supersedes AND d.cid = v_cid) THEN
    RAISE EXCEPTION 'COB_DECISION_SUPERSEDES_NOT_FOUND: that earlier decision is not this client''s'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO decisions (cid, title, decision_md, rationale_md, reversibility, decided_by,
                         minute_id, decided_at, provenance, source_surface, source_session_id,
                         verification_state, test_run_id, authoritative)
  VALUES (v_cid, p_title, p_decision_md, p_rationale_md, p_reversibility,
          coalesce(p_decided_by, 'principal'), p_minute_id, now(), 'CLIENT', 'cob:decision_write',
          p_session_id, coalesce(nullif(btrim(p_verification_state),''), 'recorded'),
          nullif(btrim(p_test_run_id),''), true)
  RETURNING id, curn INTO v_id, v_curn;

  IF p_supersedes IS NOT NULL THEN
    UPDATE decisions SET superseded_by = v_id WHERE id = p_supersedes AND cid = v_cid;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'curn', v_curn, 'cid', v_cid,
                            'verification_state', coalesce(nullif(btrim(p_verification_state),''), 'recorded'),
                            'test_run_id', nullif(btrim(p_test_run_id),''));
END
$$;

-- ══ H4 · admin_guard checks the principal, not the connection ═════════════
CREATE OR REPLACE FUNCTION public.admin_guard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_claims json;
  v_escape text;
BEGIN
  IF public.is_fleet_operator() THEN
    RETURN;
  END IF;

  -- Migration and cron contexts have no auth.uid(). They keep the escape, but
  -- the escape is never silent.
  v_escape := coalesce(current_setting('cob.admin', true), '');
  IF v_escape IN ('1', 'true', 'on', 'yes') THEN
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::json;
    INSERT INTO public.admin_audit_access (operator, operator_email, target_cid, action, detail)
    VALUES (
      auth.uid(),
      coalesce(v_claims->>'email', session_user),
      coalesce(public.current_cid(), 'FLEET'),
      'admin_guard_escape',
      jsonb_build_object(
        'session_user', session_user,
        'jwt_role', coalesce(v_claims->>'role', 'none'),
        'application_name', coalesce(current_setting('application_name', true), 'none')
      )
    );
    RETURN;
  END IF;

  RAISE EXCEPTION 'ADMIN_ONLY: this action is reserved to an active fleet operator. Being connected as the service role is not authority.'
    USING ERRCODE = '42501';
END
$$;

-- ══ H5 · sandbox_exec loses write reach into governed tables ══════════════
REVOKE ALL ON public.doctrine_rules FROM sandbox_exec;

REVOKE INSERT, UPDATE, DELETE ON
  public.doctrine_amendments,
  public.doctrine_publications,
  public.doctrine_tiers,
  public.fleet_operators,
  public.kernels,
  public.kernel_parts,
  public.protected_artifacts,
  public.protected_kernel_registry,
  public.identity_observations,
  public.principals,
  public.admin_audit_access,
  public.wire_grants,
  public.execution_receipts,
  public.probe_runs,
  public.internal_keys,
  public.access_codes,
  public.tenants,
  public.decisions,
  public.curn_sequence
FROM sandbox_exec;

-- ══ H2 · gateway-written session event log (digests only) ═════════════════
CREATE TABLE IF NOT EXISTS public.session_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL,
  session_id uuid,
  tool text NOT NULL,
  ok boolean NOT NULL,
  error_code text,
  latency_ms integer,
  arg_digest text,
  result_digest text,
  surface text,
  tool_manifest_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.session_event TO service_role;
GRANT SELECT ON public.session_event TO authenticated;

ALTER TABLE public.session_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_event readable within the tenant" ON public.session_event;
CREATE POLICY "session_event readable within the tenant"
  ON public.session_event FOR SELECT TO authenticated
  USING (cid = public.current_cid());

CREATE INDEX IF NOT EXISTS session_event_cid_created_idx ON public.session_event (cid, created_at DESC);
CREATE INDEX IF NOT EXISTS session_event_session_idx ON public.session_event (session_id, created_at DESC);

-- ══ H7 · manifest history so a delta is computable ════════════════════════
CREATE TABLE IF NOT EXISTS public.tool_manifest_registry (
  version text PRIMARY KEY,
  tools text[] NOT NULL,
  renames jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.tool_manifest_registry TO service_role;
GRANT SELECT ON public.tool_manifest_registry TO authenticated, anon;

ALTER TABLE public.tool_manifest_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tool manifest is fleet-readable" ON public.tool_manifest_registry;
CREATE POLICY "tool manifest is fleet-readable"
  ON public.tool_manifest_registry FOR SELECT TO authenticated, anon
  USING (true);

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS tool_manifest_version text;
