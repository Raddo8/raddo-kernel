
-- 1. Confirm RLS is enabled (idempotent)
ALTER TABLE public.action_responses ENABLE ROW LEVEL SECURITY;

-- 2. Add formal UNIQUE constraint (index already exists, constraint does not)
ALTER TABLE public.action_responses
ADD CONSTRAINT action_responses_action_id_unique UNIQUE USING INDEX idx_action_responses_action;

-- 3. Create hardened RPC
CREATE OR REPLACE FUNCTION public.get_action_response_status(p_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_workspace_id uuid;
  v_result record;
BEGIN
  -- Validate action exists
  SELECT a.workspace_id INTO v_workspace_id
  FROM public.actions a WHERE a.id = p_action_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'action_not_found'
      USING HINT = 'The specified action does not exist';
  END IF;

  -- Enforce workspace membership (explicit deny, auditable)
  IF NOT public.is_workspace_member(auth.uid(), v_workspace_id) THEN
    RAISE EXCEPTION 'access_denied'
      USING HINT = 'You are not a member of this workspace';
  END IF;

  -- Return only safe columns (never token_hash)
  SELECT ar.selected_option, ar.submitted_at, ar.expires_at, ar.options
  INTO v_result
  FROM public.action_responses ar
  WHERE ar.action_id = p_action_id;

  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'selected_option', v_result.selected_option,
    'submitted_at', v_result.submitted_at,
    'expires_at', v_result.expires_at,
    'options', v_result.options
  );
END;
$$;

-- 4. Pin owner to postgres (prevent ownership drift)
ALTER FUNCTION public.get_action_response_status(uuid) OWNER TO postgres;

-- 5. Deterministic privilege lockdown: revoke all, then grant only authenticated
REVOKE ALL ON FUNCTION public.get_action_response_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_action_response_status(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_action_response_status(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_action_response_status(uuid) TO authenticated;

-- 6. Drop the overly broad SELECT policy (RLS is confirmed enabled above)
DROP POLICY IF EXISTS "Members can view action_responses" ON action_responses;
