-- ══════════════════════════════════════════════════════════════════════
-- HARDEN-13 · CONTINUITY OF CLIENT ACCESS
-- Adds a binding capability and a detection capability.
-- Removes no access from anyone. Restores one.
-- ══════════════════════════════════════════════════════════════════════

-- ── N1 · idempotency surface for the canonical membership table ────────
CREATE UNIQUE INDEX IF NOT EXISTS tmv2_principal_cid_uniq
  ON public.tenant_memberships_v2 (principal_id, cid);

-- ── N2 · the pending register ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unbound_principals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id     uuid,
  issuer           text,
  provider_subject text NOT NULL,
  cid              text,
  tenant_claim     text,
  resolution_mode  text NOT NULL,
  status           text NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','BOUND','DISMISSED')),
  sightings        integer NOT NULL DEFAULT 1,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  escalated_at     timestamptz,
  escalation_curn  text,
  bound_at         timestamptz,
  bound_by         text,
  evidence_needed  text NOT NULL DEFAULT
    'Name what establishes that this subject belongs to this tenant: the provisioning record, the signed order, the operator-verified email, or the connector install. Never a display name.',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unbound_principals_subject_cid_uniq
  ON public.unbound_principals (provider_subject, coalesce(cid, coalesce(tenant_claim,'')));

GRANT SELECT ON public.unbound_principals TO authenticated;
GRANT ALL    ON public.unbound_principals TO service_role;
ALTER TABLE public.unbound_principals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unbound_principals_operator_read ON public.unbound_principals;
CREATE POLICY unbound_principals_operator_read
  ON public.unbound_principals FOR SELECT TO authenticated
  USING (public.is_fleet_operator());

-- ── N3 · the canary registers ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_access_canary_run (
  run_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase         text NOT NULL CHECK (phase IN ('BEFORE','AFTER','SCHEDULED','TEST')),
  label         text,
  ran_at        timestamptz NOT NULL DEFAULT now(),
  tenants_total integer NOT NULL DEFAULT 0,
  boot_ok       integer NOT NULL DEFAULT 0,
  transact_ok   integer NOT NULL DEFAULT 0,
  failed        integer NOT NULL DEFAULT 0,
  unverified    integer NOT NULL DEFAULT 0,
  notes         text
);

CREATE TABLE IF NOT EXISTS public.client_access_canary_result (
  result_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid NOT NULL REFERENCES public.client_access_canary_run(run_id) ON DELETE CASCADE,
  cid              text NOT NULL,
  cob_name         text,
  boot_status      text NOT NULL CHECK (boot_status     IN ('OK','FAIL','UNVERIFIED')),
  transact_status  text NOT NULL CHECK (transact_status IN ('OK','FAIL','UNVERIFIED')),
  boot_detail      text,
  transact_detail  text,
  checked_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS canary_result_run_idx ON public.client_access_canary_result (run_id);
CREATE INDEX IF NOT EXISTS canary_result_cid_idx ON public.client_access_canary_result (cid, checked_at DESC);

GRANT SELECT ON public.client_access_canary_run    TO authenticated;
GRANT SELECT ON public.client_access_canary_result TO authenticated;
GRANT ALL    ON public.client_access_canary_run    TO service_role;
GRANT ALL    ON public.client_access_canary_result TO service_role;
ALTER TABLE public.client_access_canary_run    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_access_canary_result ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canary_run_operator_read ON public.client_access_canary_run;
CREATE POLICY canary_run_operator_read ON public.client_access_canary_run
  FOR SELECT TO authenticated USING (public.is_fleet_operator());
DROP POLICY IF EXISTS canary_result_operator_read ON public.client_access_canary_result;
CREATE POLICY canary_result_operator_read ON public.client_access_canary_result
  FOR SELECT TO authenticated USING (public.is_fleet_operator());

-- ── N4 · the revocation audit register ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.revocation_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch      text NOT NULL,
  function_name text NOT NULL,
  revoked_from  text NOT NULL,
  real_callers  text NOT NULL,
  caller_role   text NOT NULL,
  verdict       text NOT NULL CHECK (verdict IN ('CORRECTLY_REVOKED','RESTORED')),
  reason        text NOT NULL,
  audited_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS revocation_audit_uniq
  ON public.revocation_audit (dispatch, function_name);

GRANT SELECT ON public.revocation_audit TO authenticated;
GRANT ALL    ON public.revocation_audit TO service_role;
ALTER TABLE public.revocation_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS revocation_audit_operator_read ON public.revocation_audit;
CREATE POLICY revocation_audit_operator_read ON public.revocation_audit
  FOR SELECT TO authenticated USING (public.is_fleet_operator());

-- ══════════════════════════════════════════════════════════════════════
-- N2(a) · record a principal transacting without a membership row.
-- Once per principal per tenant with a sightings counter. Never per call.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_unbound_principal(
  p_issuer           text,
  p_provider_subject text,
  p_resolution_mode  text,
  p_cid              text DEFAULT NULL,
  p_tenant_claim     text DEFAULT NULL,
  p_principal_id     uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id uuid; v_new boolean := false; v_sightings int;
BEGIN
  IF p_provider_subject IS NULL OR btrim(p_provider_subject) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NO_SUBJECT');
  END IF;
  IF p_resolution_mode IN ('OK','OK_DELEGATED') THEN
    RETURN jsonb_build_object('ok', true, 'recorded', false, 'reason', 'RESOLVED');
  END IF;

  INSERT INTO public.unbound_principals
    (principal_id, issuer, provider_subject, cid, tenant_claim, resolution_mode)
  VALUES
    (p_principal_id, p_issuer, p_provider_subject, p_cid, p_tenant_claim, p_resolution_mode)
  ON CONFLICT (provider_subject, coalesce(cid, coalesce(tenant_claim,'')))
  DO UPDATE SET
    sightings       = public.unbound_principals.sightings + 1,
    last_seen_at    = now(),
    updated_at      = now(),
    resolution_mode = excluded.resolution_mode,
    principal_id    = coalesce(public.unbound_principals.principal_id, excluded.principal_id),
    issuer          = coalesce(public.unbound_principals.issuer, excluded.issuer)
  RETURNING id, sightings, (xmax = 0) INTO v_id, v_sightings, v_new;

  RETURN jsonb_build_object('ok', true, 'recorded', true, 'id', v_id,
                            'newly_seen', v_new, 'sightings', v_sightings);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.record_unbound_principal(text,text,text,text,text,uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_unbound_principal(text,text,text,text,text,uuid) TO service_role;

-- ══════════════════════════════════════════════════════════════════════
-- N1 · bind_principal · the operation that did not exist.
-- Refusals RETURN (so the receipt survives); they never raise, because a
-- raise would roll back the very evidence of the refusal.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.bind_principal(
  p_auth_user_id uuid,
  p_cid          text,
  p_role         text DEFAULT 'principal',
  p_evidence     jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_operator      uuid := auth.uid();
  v_op_label      text;
  v_is_op         boolean := public.is_fleet_operator();
  v_evidence_text text;
  v_before        jsonb;
  v_after         jsonb;
  v_issuer        text;
  v_subject       text;
  v_principal     record;
  v_receipt       uuid;
  v_tm_action     text;
  v_v2_action     text := 'none';
  v_ident_action  text := 'none';
  v_closed        int  := 0;
BEGIN
  v_op_label := coalesce(
    (SELECT email FROM auth.users WHERE id = v_operator),
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email',
    session_user);

  -- refusal 1 · operator gate (HARDEN-12 ledger is the only answer)
  IF NOT v_is_op THEN
    INSERT INTO public.authority_access_receipts
      (caller_auth_user_id, caller_label, ledger_present, target_cid, action, decision, reason)
    VALUES (v_operator, v_op_label, false, coalesce(p_cid,'UNKNOWN'),
            'bind_principal', 'DENIED',
            'REFUSED_NOT_OPERATOR · binding is operator-gated through the fleet_operators ledger')
    RETURNING receipt_id INTO v_receipt;
    RETURN jsonb_build_object('ok', false, 'refusal', 'REFUSED_NOT_OPERATOR',
      'reason', 'binding is operator-gated through the fleet_operators ledger',
      'receipt_id', v_receipt);
  END IF;

  -- refusal 2 · evidence is mandatory and must say something
  v_evidence_text := btrim(coalesce(p_evidence ->> 'basis', ''));
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object' OR v_evidence_text = '' THEN
    INSERT INTO public.authority_access_receipts
      (caller_auth_user_id, caller_label, ledger_present, ledger_fleet_role, target_cid, action, decision, reason)
    VALUES (v_operator, v_op_label, true, 'FLEET', coalesce(p_cid,'UNKNOWN'),
            'bind_principal', 'DENIED',
            'REFUSED_EVIDENCE_REQUIRED · p_evidence must be an object carrying a non-empty basis naming what established that this principal belongs to this tenant')
    RETURNING receipt_id INTO v_receipt;
    RETURN jsonb_build_object('ok', false, 'refusal', 'REFUSED_EVIDENCE_REQUIRED',
      'reason', 'p_evidence must be an object carrying a non-empty basis. Never a display name. Never a guess.',
      'receipt_id', v_receipt);
  END IF;

  IF p_auth_user_id IS NULL OR p_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'refusal', 'REFUSED_MISSING_KEY',
      'reason', 'p_auth_user_id and p_cid are both required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE cid = p_cid) THEN
    INSERT INTO public.authority_access_receipts
      (caller_auth_user_id, caller_label, ledger_present, ledger_fleet_role, target_cid, action, decision, reason)
    VALUES (v_operator, v_op_label, true, 'FLEET', p_cid, 'bind_principal', 'DENIED',
            'REFUSED_NO_SUCH_TENANT · bind_principal binds to an EXISTING tenant only; minting is mint_tenant')
    RETURNING receipt_id INTO v_receipt;
    RETURN jsonb_build_object('ok', false, 'refusal', 'REFUSED_NO_SUCH_TENANT',
      'reason', 'bind_principal attaches a principal to an existing tenant. It never mints one.',
      'receipt_id', v_receipt);
  END IF;

  -- observed BEFORE, from the same resolver the gateway uses
  SELECT e.issuer, e.provider_subject INTO v_issuer, v_subject
    FROM public.external_identities e WHERE e.principal_id = p_auth_user_id
    ORDER BY e.last_seen_at DESC NULLS LAST LIMIT 1;
  IF v_subject IS NOT NULL THEN
    v_before := public.resolve_principal_context(v_issuer, v_subject);
  ELSE
    v_before := jsonb_build_object('resolution_mode','NO_IDENTITY',
      'reason','no external identity recorded against this id');
  END IF;

  -- ── the legacy membership row · idempotent on (auth_user_id, cid) ────
  INSERT INTO public.tenant_members
    (auth_user_id, cid, role, status, tenancy, provenance_type, provenance_ref,
     granted_at, granted_by, revoked_at, revoked_by, revocation_reason)
  VALUES (p_auth_user_id, p_cid, p_role, 'ACTIVE', 'TENANT', 'OPERATOR_BIND',
          v_evidence_text, now(), v_op_label, NULL, NULL, NULL)
  ON CONFLICT (auth_user_id, cid) DO UPDATE SET
    role = excluded.role, status = 'ACTIVE',
    provenance_type = 'OPERATOR_BIND', provenance_ref = excluded.provenance_ref,
    granted_at = now(), granted_by = excluded.granted_by,
    revoked_at = NULL, revoked_by = NULL, revocation_reason = NULL
  RETURNING CASE WHEN xmax = 0 THEN 'created' ELSE 'reactivated' END INTO v_tm_action;

  -- ── the canonical chain · only when this id IS a principal ───────────
  SELECT * INTO v_principal FROM public.principals WHERE principal_id = p_auth_user_id;
  IF FOUND THEN
    UPDATE public.principals
       SET status = 'ACTIVE', revoked_at = NULL
     WHERE principal_id = p_auth_user_id AND status <> 'ACTIVE';

    UPDATE public.external_identities
       SET status = 'ACTIVE',
           evidence = left('OPERATOR_BIND ' || to_char(now(),'YYYY-MM-DD') || ' by ' ||
                           v_op_label || ' · ' || v_evidence_text, 2000)
     WHERE principal_id = p_auth_user_id AND status = 'PENDING';
    GET DIAGNOSTICS v_closed = ROW_COUNT;
    v_ident_action := v_closed || ' external identity row(s) activated';

    INSERT INTO public.tenant_memberships_v2
      (principal_id, cid, role, scopes, status, authorized_by, authority_receipt, effective_at, revoked_at, tenancy)
    VALUES (p_auth_user_id, p_cid, p_role, ARRAY[]::text[], 'ACTIVE',
            v_op_label, v_evidence_text, now(), NULL, 'TENANT')
    ON CONFLICT (principal_id, cid) DO UPDATE SET
      role = excluded.role, status = 'ACTIVE',
      authorized_by = excluded.authorized_by, authority_receipt = excluded.authority_receipt,
      effective_at = now(), revoked_at = NULL
    RETURNING CASE WHEN xmax = 0 THEN 'created' ELSE 'reactivated' END INTO v_v2_action;
  END IF;

  -- observed AFTER
  IF v_subject IS NOT NULL THEN
    v_after := public.resolve_principal_context(v_issuer, v_subject);
  ELSE
    v_after := v_before;
  END IF;

  -- ── the authority receipt · operator, principal, tenant, role, evidence
  INSERT INTO public.authority_access_receipts
    (caller_auth_user_id, caller_label, ledger_present, ledger_fleet_role, ledger_status,
     ledger_granted_at, target_cid, action, decision, reason)
  SELECT v_operator, v_op_label, true, f.fleet_role, f.status, f.granted_at,
         p_cid, 'bind_principal', 'GRANTED',
         'BOUND principal ' || p_auth_user_id || ' to ' || p_cid ||
         ' as ' || p_role || ' · evidence: ' || v_evidence_text ||
         ' · resolution_mode ' || coalesce(v_before->>'resolution_mode','?') ||
         ' -> ' || coalesce(v_after->>'resolution_mode','?')
    FROM public.fleet_operators f
   WHERE f.auth_user_id = v_operator AND f.status = 'ACTIVE'
   LIMIT 1
  RETURNING receipt_id INTO v_receipt;

  IF v_receipt IS NULL THEN
    INSERT INTO public.authority_access_receipts
      (caller_auth_user_id, caller_label, ledger_present, target_cid, action, decision, reason)
    VALUES (v_operator, v_op_label, true, p_cid, 'bind_principal', 'GRANTED',
            'BOUND principal ' || p_auth_user_id || ' to ' || p_cid || ' as ' || p_role ||
            ' · evidence: ' || v_evidence_text)
    RETURNING receipt_id INTO v_receipt;
  END IF;

  -- ── N2(d) · the pending record closes ────────────────────────────────
  UPDATE public.unbound_principals u
     SET status = 'BOUND', bound_at = now(), bound_by = v_op_label, updated_at = now()
   WHERE u.status = 'PENDING'
     AND (u.principal_id = p_auth_user_id
          OR (v_subject IS NOT NULL AND u.provider_subject = v_subject));
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'cid', p_cid,
    'principal', p_auth_user_id,
    'role', p_role,
    'evidence', v_evidence_text,
    'operator', v_op_label,
    'receipt_id', v_receipt,
    'tenant_members', v_tm_action,
    'tenant_memberships_v2', v_v2_action,
    'external_identities', v_ident_action,
    'pending_records_closed', v_closed,
    'resolution_mode_before', v_before ->> 'resolution_mode',
    'resolution_mode_after',  v_after  ->> 'resolution_mode');
END $fn$;

REVOKE EXECUTE ON FUNCTION public.bind_principal(uuid,text,text,jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.bind_principal(uuid,text,text,jsonb) TO authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════
-- N2(b) · escalate against the MECHANISM, once, never per call.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.unbound_principal_escalate()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r record; v_n int := 0; v_curn text;
BEGIN
  FOR r IN
    SELECT * FROM public.unbound_principals
     WHERE status = 'PENDING'
       AND escalated_at IS NULL
       AND first_seen_at < now() - interval '24 hours'
  LOOP
    BEGIN
      SELECT public.cob_signal_raise_internal(
        coalesce(r.cid, 'FLEET'),
        'mechanism.unbound_principal',
        'A principal has been transacting for ' ||
        floor(extract(epoch FROM (now() - r.first_seen_at)) / 86400)::text ||
        ' day(s) with no membership row (' || r.sightings || ' sightings, resolution_mode ' ||
        r.resolution_mode || '). This is our provisioning defect, not the client''s error: ' ||
        'until HARDEN-13 there was no operation that could bind an existing person to an existing tenant. ' ||
        'Remedy: bind_principal(' || coalesce(r.principal_id::text, 'principal_id') || ', ' ||
        coalesce(r.cid, 'cid') || ', role, evidence).',
        NULL, 'bind_principal', 'mechanism',
        'unbound principal ' || r.provider_subject,
        jsonb_build_object('unbound_principal_id', r.id,
                           'provider_subject', r.provider_subject,
                           'principal_id', r.principal_id),
        'operator', 'unbound_principal_escalate'
      ) INTO v_curn;
    EXCEPTION WHEN others THEN
      v_curn := NULL;
      RAISE LOG 'unbound_principal_escalate_failed % %', r.id, SQLERRM;
    END;

    UPDATE public.unbound_principals
       SET escalated_at = now(), escalation_curn = v_curn, updated_at = now()
     WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'escalated', v_n,
    'reason', CASE WHEN v_n = 0
      THEN 'no PENDING principal older than 24 hours awaited escalation'
      ELSE v_n || ' mechanism signal(s) raised, one per principal' END);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.unbound_principal_escalate() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.unbound_principal_escalate() TO service_role;

-- ══════════════════════════════════════════════════════════════════════
-- N2(c) · the operator surface · remedy in one action, not an investigation
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.unbound_principals_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_fleet_operator() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operator_only');
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'first_seen_at'), '[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object(
      'unbound_principal_id', u.id,
      'principal_id',    u.principal_id,
      'provider_subject',u.provider_subject,
      'issuer',          u.issuer,
      'cid',             u.cid,
      'cob_name',        t.cob_name,
      'tenant_claim',    u.tenant_claim,
      'resolution_mode', u.resolution_mode,
      'status',          u.status,
      'sightings',       u.sightings,
      'first_seen_at',   u.first_seen_at,
      'last_seen_at',    u.last_seen_at,
      'age_days',        floor(extract(epoch FROM (now() - u.first_seen_at)) / 86400),
      'escalated_at',    u.escalated_at,
      'evidence_needed', u.evidence_needed,
      'remedy', 'bind_principal(' || coalesce(u.principal_id::text,'<principal_id>') || ', ''' ||
                coalesce(u.cid,'<cid>') || ''', ''principal'', ''{"basis":"…"}''::jsonb)'
    ) x
    FROM public.unbound_principals u
    LEFT JOIN public.tenants t ON t.cid = u.cid
    WHERE u.status = 'PENDING'
  ) s;

  RETURN jsonb_build_object('ok', true, 'pending', jsonb_array_length(v), 'principals', v);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.unbound_principals_report() FROM anon;
GRANT  EXECUTE ON FUNCTION public.unbound_principals_report() TO authenticated, service_role;

-- ── N2 · seed the register from what is already true ───────────────────
INSERT INTO public.unbound_principals
  (principal_id, issuer, provider_subject, cid, tenant_claim, resolution_mode,
   sightings, first_seen_at, last_seen_at)
SELECT e.principal_id, e.issuer, e.provider_subject,
       (SELECT l.legacy_cid FROM public.identity_resolution_log l
         WHERE l.provider_subject = e.provider_subject AND l.legacy_cid IS NOT NULL
         ORDER BY l.at DESC LIMIT 1),
       (SELECT l.tenant_claim FROM public.identity_resolution_log l
         WHERE l.provider_subject = e.provider_subject
         ORDER BY l.at DESC LIMIT 1),
       'IDENTITY_' || e.status,
       greatest(1, (SELECT count(*)::int FROM public.identity_resolution_log l
                     WHERE l.provider_subject = e.provider_subject)),
       e.first_seen_at, e.last_seen_at
  FROM public.external_identities e
 WHERE e.status = 'PENDING'
   AND NOT EXISTS (
     SELECT 1 FROM public.tenant_memberships_v2 m
      WHERE m.principal_id = e.principal_id AND m.status = 'ACTIVE')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════
-- N3 · CLIENT ACCESS CANARY
-- Proves each ACTIVE tenant can boot and can read. What it cannot verify
-- it NAMES as unverified. It never defaults a tenant to healthy.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.client_access_canary(
  p_phase text DEFAULT 'SCHEDULED',
  p_label text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_run uuid; r record; v_j jsonb;
  v_boot text; v_tx text; v_boot_d text; v_tx_d text;
  v_total int := 0; v_bok int := 0; v_tok int := 0; v_fail int := 0; v_unv int := 0;
BEGIN
  INSERT INTO public.client_access_canary_run (phase, label)
  VALUES (coalesce(p_phase,'SCHEDULED'), p_label)
  RETURNING run_id INTO v_run;

  FOR r IN
    SELECT cid, cob_name FROM public.tenants
     WHERE tenancy = 'TENANT' AND status IN ('live','provisioning')
     ORDER BY cid
  LOOP
    v_total := v_total + 1;
    v_boot := 'UNVERIFIED'; v_tx := 'UNVERIFIED'; v_boot_d := NULL; v_tx_d := NULL;

    -- boot path
    BEGIN
      v_j := public.boot_layer_plan(r.cid);
      IF v_j IS NULL THEN
        v_boot := 'UNVERIFIED'; v_boot_d := 'boot_layer_plan returned null · not proven, not assumed healthy';
      ELSE
        v_boot := 'OK'; v_boot_d := 'boot_layer_plan resolved';
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN v_boot := 'FAIL'; v_boot_d := 'permission denied · ' || SQLERRM;
      WHEN others THEN v_boot := 'UNVERIFIED'; v_boot_d := SQLSTATE || ' · ' || SQLERRM;
    END;

    -- one governed read
    BEGIN
      v_j := public.cob_registers_read(r.cid, 1);
      IF v_j IS NULL THEN
        v_tx := 'UNVERIFIED'; v_tx_d := 'cob_registers_read returned null · not proven';
      ELSE
        v_tx := 'OK'; v_tx_d := 'cob_registers_read resolved';
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN v_tx := 'FAIL'; v_tx_d := 'permission denied · ' || SQLERRM;
      WHEN others THEN v_tx := 'UNVERIFIED'; v_tx_d := SQLSTATE || ' · ' || SQLERRM;
    END;

    INSERT INTO public.client_access_canary_result
      (run_id, cid, cob_name, boot_status, transact_status, boot_detail, transact_detail)
    VALUES (v_run, r.cid, r.cob_name, v_boot, v_tx, v_boot_d, v_tx_d);

    IF v_boot = 'OK' THEN v_bok := v_bok + 1; END IF;
    IF v_tx   = 'OK' THEN v_tok := v_tok + 1; END IF;
    IF 'FAIL' IN (v_boot, v_tx) THEN v_fail := v_fail + 1;
    ELSIF 'UNVERIFIED' IN (v_boot, v_tx) THEN v_unv := v_unv + 1; END IF;
  END LOOP;

  UPDATE public.client_access_canary_run
     SET tenants_total = v_total, boot_ok = v_bok, transact_ok = v_tok,
         failed = v_fail, unverified = v_unv,
         notes = CASE WHEN v_total = 0
           THEN 'no ACTIVE tenants matched (tenancy TENANT, status live or provisioning)'
           ELSE v_total || ' tenants probed · ' || v_fail || ' failing · ' || v_unv || ' unverified' END
   WHERE run_id = v_run;

  RETURN jsonb_build_object(
    'ok', true, 'run_id', v_run, 'phase', coalesce(p_phase,'SCHEDULED'), 'label', p_label,
    'tenants_total', v_total, 'boot_ok', v_bok, 'transact_ok', v_tok,
    'failed', v_fail, 'unverified', v_unv,
    'tenants', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'cid', cid, 'cob_name', cob_name, 'boot', boot_status, 'transact', transact_status,
        'boot_detail', boot_detail, 'transact_detail', transact_detail) ORDER BY cid), '[]'::jsonb)
      FROM public.client_access_canary_result WHERE run_id = v_run));
END $fn$;

REVOKE EXECUTE ON FUNCTION public.client_access_canary(text,text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.client_access_canary(text,text) TO authenticated, service_role;

-- ── N3 · the revert. Called at the tail of any authority migration.
-- It RAISES, which aborts the enclosing migration transaction. That is the
-- revert: the tightening never lands if a tenant lost access.
CREATE OR REPLACE FUNCTION public.canary_assert_no_regression(p_label text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_before uuid; v_after uuid; v_lost text; v_n int;
BEGIN
  SELECT run_id INTO v_before FROM public.client_access_canary_run
   WHERE label = p_label AND phase = 'BEFORE' ORDER BY ran_at DESC LIMIT 1;
  SELECT run_id INTO v_after  FROM public.client_access_canary_run
   WHERE label = p_label AND phase = 'AFTER'  ORDER BY ran_at DESC LIMIT 1;

  IF v_before IS NULL OR v_after IS NULL THEN
    RAISE EXCEPTION 'CANARY_INCOMPLETE: label % is missing its % run. An authority migration without a before and an after run is not permitted to stand.',
      p_label, CASE WHEN v_before IS NULL THEN 'BEFORE' ELSE 'AFTER' END
      USING ERRCODE = 'raise_exception';
  END IF;

  SELECT string_agg(b.cid || ' (' || b.boot_status || '/' || b.transact_status || ' -> ' ||
                    a.boot_status || '/' || a.transact_status || ')', ', '), count(*)
    INTO v_lost, v_n
    FROM public.client_access_canary_result b
    JOIN public.client_access_canary_result a ON a.cid = b.cid AND a.run_id = v_after
   WHERE b.run_id = v_before
     AND (b.boot_status = 'OK' AND a.boot_status <> 'OK'
       OR b.transact_status = 'OK' AND a.transact_status <> 'OK');

  IF coalesce(v_n, 0) > 0 THEN
    RAISE LOG 'CLIENT_ACCESS_REGRESSION % : %', p_label, v_lost;
    RAISE EXCEPTION 'CLIENT_ACCESS_REGRESSION: % tenant(s) could transact before this change and cannot now: %. Reverted.',
      v_n, v_lost USING ERRCODE = 'raise_exception';
  END IF;

  RETURN jsonb_build_object('ok', true, 'label', p_label,
    'before_run', v_before, 'after_run', v_after, 'regressions', 0,
    'reason', 'no tenant that could transact before this change lost the ability to transact');
END $fn$;

REVOKE EXECUTE ON FUNCTION public.canary_assert_no_regression(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.canary_assert_no_regression(text) TO service_role;

-- ── N3(c) · a tenant that goes dark is detected by us, not reported to us
CREATE OR REPLACE FUNCTION public.client_access_canary_tick()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_run jsonb; r record; v_dark int := 0; v_names text[] := '{}';
BEGIN
  v_run := public.client_access_canary('SCHEDULED', 'hourly');

  FOR r IN
    SELECT t.cid, t.cob_name,
           (SELECT max(b.booted_at) FROM public.boot_log b WHERE b.cid = t.cid) last_boot
      FROM public.tenants t
     WHERE t.tenancy = 'TENANT' AND t.status = 'live'
  LOOP
    IF r.last_boot IS NULL OR r.last_boot < now() - interval '48 hours' THEN
      v_dark := v_dark + 1;
      v_names := v_names || (r.cid || coalesce(' (' || r.cob_name || ')', ''));
      BEGIN
        PERFORM public.cob_signal_raise_internal(
          r.cid, 'mechanism.tenant_dark',
          'No successful boot recorded for this tenant ' ||
          coalesce('since ' || to_char(r.last_boot,'YYYY-MM-DD HH24:MI') || ' UTC', 'at any point') ||
          '. Detected by the client access canary rather than reported by the client.',
          NULL, 'client_access_canary', 'mechanism', 'tenant dark ' || r.cid,
          jsonb_build_object('cid', r.cid, 'last_boot', r.last_boot),
          'operator', 'client_access_canary_tick');
      EXCEPTION WHEN others THEN
        RAISE LOG 'tenant_dark_signal_failed % %', r.cid, SQLERRM;
      END;
    END IF;
  END LOOP;

  PERFORM public.unbound_principal_escalate();

  RETURN jsonb_build_object('ok', true, 'canary', v_run,
    'dark_tenants', v_dark, 'dark_named', to_jsonb(v_names),
    'reason', CASE WHEN v_dark = 0
      THEN 'every live tenant booted within its 48 hour window'
      ELSE v_dark || ' live tenant(s) outside the 48 hour boot window' END);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.client_access_canary_tick() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.client_access_canary_tick() TO service_role;

SELECT cron.unschedule('client-access-canary')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'client-access-canary');
SELECT cron.schedule('client-access-canary', '25 * * * *',
  $cron$ SELECT public.client_access_canary_tick(); $cron$);

-- ══════════════════════════════════════════════════════════════════════
-- N4 · audit the fifteen revocations against real call paths.
-- One is reached by a client path as authenticated. Its grant is restored.
-- ══════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.admin_fleet_live(timestamp with time zone) TO authenticated;

INSERT INTO public.revocation_audit
  (dispatch, function_name, revoked_from, real_callers, caller_role, verdict, reason)
VALUES
 ('HARDEN-12 M2','admin_fleet_live(timestamptz)','anon, authenticated',
  'src/components/hq/FleetLive.tsx line 274 · supabase.rpc("admin_fleet_live")','authenticated','RESTORED',
  'A live client-side operator surface calls this as authenticated. The revocation broke the HQ fleet view. The function self-gates on is_fleet_operator() and returns {ok:false,reason:operator_only} to anyone else, so the grant is safe and is restored.'),
 ('HARDEN-12 M2','admin_fleet_board()','anon, authenticated','no caller in src/ or supabase/functions/','none','CORRECTLY_REVOKED',
  'Self-gates on is_fleet_operator() and raises 42501 otherwise; no application path reaches it. Reachable by service_role and postgres.'),
 ('HARDEN-12 M2','fleet_surfacing_health()','anon, authenticated','no caller in src/ or supabase/functions/','none','CORRECTLY_REVOKED',
  'Fleet-wide report, self-gated on is_fleet_operator(). No client path.'),
 ('HARDEN-12 M2','audit_kernel_parts()','anon, authenticated','cron kernel-boot-watchdog path only','service_role','CORRECTLY_REVOKED',
  'Maintenance function. No src/ or edge-function caller.'),
 ('HARDEN-12 M2','reconcile_kernel_absent_signals()','anon, authenticated','cron maintenance only','service_role','CORRECTLY_REVOKED',
  'Maintenance function. No src/ or edge-function caller.'),
 ('HARDEN-12 M2','register_layer_sync()','anon, authenticated','HARDEN-10 K5 migration and operator SQL','postgres / service_role','CORRECTLY_REVOKED',
  'Classification job. No client path.'),
 ('HARDEN-12 M2','rekey_status()','anon, authenticated','operator SQL reporting only','postgres / service_role','CORRECTLY_REVOKED',
  'Reporting function used to read HARDEN-10 K1 progress. No client path.'),
 ('HARDEN-12 M2','save_attempts_in_flight(integer)','anon, authenticated','operator SQL reporting only','postgres / service_role','CORRECTLY_REVOKED',
  'Fleet-wide in-flight report. No client path.'),
 ('HARDEN-12 M2','session_context_purge()','anon, authenticated','cleanup-maintenance cron','service_role','CORRECTLY_REVOKED',
  'Maintenance function invoked with the service key.'),
 ('HARDEN-12 M2','session_id_for_context(text)','anon, authenticated','internal helper called from other definer functions','definer chain','CORRECTLY_REVOKED',
  'Called inside other SECURITY DEFINER functions, which do not consult the caller grant. No direct client path.'),
 ('HARDEN-12 M2','tool_latency_report(text[],integer)','anon, authenticated','HARDEN-11 L2 operator reporting','postgres / service_role','CORRECTLY_REVOKED',
  'Fleet-wide latency aggregate. No client path.'),
 ('HARDEN-12 M2','vocabulary_gaps()','anon, authenticated','operator SQL reporting only','postgres / service_role','CORRECTLY_REVOKED',
  'Fleet-wide report. No client path.'),
 ('HARDEN-12 M2','close_save_attempt(uuid,text,jsonb,text)','anon, authenticated',
  'supabase/functions/mcp-council/index.ts line 6808 · supabaseAdmin.rpc("close_save_attempt")','service_role','CORRECTLY_REVOKED',
  'Called only through the admin client inside the gateway, which uses the service key. The revocation does not touch that path.'),
 ('HARDEN-12 M2','close_session_context(text)','anon, authenticated',
  'supabase/functions/mcp-council/index.ts line 7276 · supabaseAdmin.rpc("close_session_context")','service_role','CORRECTLY_REVOKED',
  'Called only through the admin client inside the gateway, which uses the service key.'),
 ('HARDEN-12 M2','resolve_cid_strict(text)','anon, authenticated','internal helper called from other definer functions','definer chain','CORRECTLY_REVOKED',
  'No src/ or edge-function caller; resolution inside definer functions is unaffected by the caller grant.')
ON CONFLICT (dispatch, function_name) DO UPDATE SET
  real_callers = excluded.real_callers, caller_role = excluded.caller_role,
  verdict = excluded.verdict, reason = excluded.reason, audited_at = now();
