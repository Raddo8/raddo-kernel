-- A3.1 · ADDITIVE AUTHORITY SHADOW. Idempotent. No authority cutover.

-- CHANGE SET 1 -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_hq_authority_v1(
  p_auth_user_id uuid,
  p_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_memberships jsonb := '[]'::jsonb;
  v_active_cid text;
  v_tenant_role text;
  v_fleet_role text;
  v_workspace_roles jsonb := '[]'::jsonb;
  v_status text;
  v_reason text;
  v_count int := 0;
  v_session_cid text;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'memberships', '[]'::jsonb,
      'active_cid', NULL,
      'tenant_role', NULL,
      'fleet_role', NULL,
      'workspace_roles', '[]'::jsonb,
      'v2_shadow', jsonb_build_object('match_state', 'UNMAPPED'),
      'resolution', jsonb_build_object('status', 'REFUSED', 'reason', 'NO_VERIFIED_SUBJECT')
    );
  END IF;

  -- Legacy HQ authority: tenant_members ACTIVE only. No identity join.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('cid', t.cid, 'role', t.role, 'status', t.status)
                            ORDER BY t.cid), '[]'::jsonb),
         COUNT(*)
    INTO v_memberships, v_count
  FROM public.tenant_members t
  WHERE t.auth_user_id = p_auth_user_id
    AND t.status = 'ACTIVE'
    AND t.revoked_at IS NULL;

  -- Fleet authority (separate dimension).
  SELECT f.fleet_role INTO v_fleet_role
  FROM public.fleet_operators f
  WHERE f.auth_user_id = p_auth_user_id
    AND f.status = 'ACTIVE'
    AND f.revoked_at IS NULL
  LIMIT 1;

  -- CRM workspace roles. NEVER convertible into tenant or fleet authority.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('workspace_id', w.workspace_id, 'role', w.role)
                            ORDER BY w.workspace_id), '[]'::jsonb)
    INTO v_workspace_roles
  FROM public.workspace_members w
  WHERE w.user_id = p_auth_user_id;

  IF p_session_id IS NOT NULL THEN
    -- Supplied session must be bound to THIS user, unexpired, unrevoked,
    -- and backed by an ACTIVE membership for the same user and CID.
    SELECT s.cid INTO v_session_cid
    FROM public.tenant_session_context s
    WHERE s.session_id = p_session_id
      AND s.auth_user_id = p_auth_user_id
      AND s.revoked_at IS NULL
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND EXISTS (
        SELECT 1 FROM public.tenant_members m
        WHERE m.auth_user_id = p_auth_user_id
          AND m.cid = s.cid
          AND m.status = 'ACTIVE'
          AND m.revoked_at IS NULL
      )
    LIMIT 1;

    IF v_session_cid IS NULL THEN
      -- NEVER fall back to single-membership selection after an invalid session.
      v_status := 'REFUSED';
      v_reason := 'INVALID_SESSION';
      v_active_cid := NULL;
    ELSE
      v_active_cid := v_session_cid;
      v_status := 'OK';
      v_reason := 'SESSION_BOUND';
    END IF;
  ELSIF v_count = 1 THEN
    v_active_cid := (v_memberships -> 0 ->> 'cid');
    v_status := 'OK';
    v_reason := 'SINGLE_MEMBERSHIP';
  ELSIF v_count > 1 THEN
    v_active_cid := NULL;
    v_status := 'SELECTION_REQUIRED';
    v_reason := 'MULTIPLE_MEMBERSHIPS';
  ELSIF v_fleet_role IS NOT NULL THEN
    v_active_cid := NULL;
    v_status := 'OK';
    v_reason := 'FLEET_ONLY';
  ELSE
    v_active_cid := NULL;
    v_status := 'REFUSED';
    v_reason := 'NO_TENANT_AUTHORITY';
  END IF;

  IF v_active_cid IS NOT NULL THEN
    SELECT m.role INTO v_tenant_role
    FROM public.tenant_members m
    WHERE m.auth_user_id = p_auth_user_id
      AND m.cid = v_active_cid
      AND m.status = 'ACTIVE'
      AND m.revoked_at IS NULL
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'memberships', v_memberships,
    'active_cid', v_active_cid,
    'tenant_role', v_tenant_role,
    'fleet_role', v_fleet_role,
    'workspace_roles', v_workspace_roles,
    -- SHADOW ONLY. No proven immutable auth-user -> canonical-principal bridge
    -- exists (principal_binding empty; 0 external-identity matches).
    -- Vocabulary reserved: MATCH | LEGACY_ONLY | V2_ONLY | BOTH_NULL |
    -- AUTHORITY_CONFLICT | UNMAPPED.
    'v2_shadow', jsonb_build_object('match_state', 'UNMAPPED'),
    'resolution', jsonb_build_object('status', v_status, 'reason', v_reason)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_hq_authority_v1(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_hq_authority_v1(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_hq_authority_v1(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_hq_authority_v1(uuid, text) TO service_role;

-- CHANGE SET 2 · quarantine (zero callers proven) ---------------------------
COMMENT ON FUNCTION public.resolve_identity_v2(text, text) IS
  'QUARANTINED 2026-08-02 · empty principal_binding substrate; HUMAN membership test not tied to resolved principal · do not call · see A3.1';
REVOKE EXECUTE ON FUNCTION public.resolve_identity_v2(text, text) FROM service_role;

-- CHANGE SET 3 · connector identity shadow report ---------------------------
DROP VIEW IF EXISTS public.connector_identity_shadow_report_v1;
CREATE VIEW public.connector_identity_shadow_report_v1
WITH (security_invoker = true) AS
SELECT
  (date_trunc('day', l.at))::date AS observation_day,
  l.surface                       AS surface,
  l.match_state                   AS match_state,
  COUNT(*)                        AS count,
  MAX(l.at)                       AS latest_observation_at,
  'CONNECTOR_IDENTITY'::text      AS evidence_scope
FROM public.identity_resolution_log l
GROUP BY 1, 2, 3;

REVOKE ALL ON public.connector_identity_shadow_report_v1 FROM PUBLIC;
REVOKE ALL ON public.connector_identity_shadow_report_v1 FROM anon;
REVOKE ALL ON public.connector_identity_shadow_report_v1 FROM authenticated;
GRANT SELECT ON public.connector_identity_shadow_report_v1 TO service_role;