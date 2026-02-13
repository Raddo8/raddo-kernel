

# Fix action_responses Sensitive Data Exposure -- Hardened Plan

## Summary

Replace the broad SELECT policy on `action_responses` with a hardened RPC function, preventing `token_hash` exposure to workspace members. All four required hardening elements are addressed.

## Pre-Condition Verification (Confirmed via DB Queries)

| Check | Status |
|---|---|
| RLS enabled on `action_responses` | Confirmed (`relrowsecurity = true`) |
| Unique enforcement on `action_id` | Unique INDEX exists (`idx_action_responses_action`), but no formal CONSTRAINT -- migration will add one |
| Only one user-facing read path | Confirmed: only `ActionInspectorDrawer.tsx` |
| Edge functions use service-role | Confirmed: `get-response`, `submit-response`, `execute-action-core` all bypass RLS |

## Complete Access Audit

| Location | Client | Affected by DROP? |
|---|---|---|
| `ActionInspectorDrawer.tsx` | User (anon key) | Yes -- migrate to RPC |
| `get-response/index.ts` | Service-role | No |
| `submit-response/index.ts` | Service-role | No |
| `execute-action-core.ts` | Service-role | No |
| `execute-action-server/index.ts` | Service-role | No |

## Deploy Order (4 steps, no regression window)

### Step 1: Database Migration

Single migration with all hardening elements:

```sql
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
```

All function calls are fully qualified (`public.actions`, `public.action_responses`, `public.is_workspace_member`, `auth.uid`).

### Step 2: Update Frontend -- ActionInspectorDrawer.tsx

Replace the `fetchResponseStatus` method's direct table query with the RPC call:

**Before:**
```typescript
const { data } = await supabase
  .from("action_responses")
  .select("selected_option, submitted_at, expires_at, options")
  .eq("action_id", action.id)
  .maybeSingle();
```

**After:**
```typescript
const { data, error } = await supabase
  .rpc("get_action_response_status", { p_action_id: action.id });

if (error) {
  setResponseStatus({ state: "none" });
  return;
}
```

The rest of the response-status logic (checking `submitted_at`, `selected_option`, `expires_at`) stays identical since the returned fields match.

### Step 3: Update Security Findings

- **Delete** the `action_responses` finding (vulnerability resolved)
- **Ignore** the `contacts` finding (already workspace-scoped via accounts-join RLS)
- **Ignore** the `profiles` finding (already self-scoped RLS)

### Step 4: Verify

- Test Action Inspector drawer for a `present_options` action to confirm response status renders
- Confirm edge functions still work (they use service-role, unaffected)
- Run security scan to confirm no new findings

## Hardening Checklist

- [x] RLS explicitly enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [x] Unique constraint formalized (`ADD CONSTRAINT ... UNIQUE USING INDEX`)
- [x] Full revoke then explicit grant (`REVOKE ALL FROM PUBLIC, anon, authenticated` then `GRANT TO authenticated`)
- [x] Owner pinned (`ALTER FUNCTION ... OWNER TO postgres`)
- [x] All function calls fully qualified (no unqualified names)
- [x] Explicit exception on access denied (not silent empty return)
- [x] `search_path` set to `'public'`
- [x] Complete code path audit (only 1 user-facing read, all others service-role)

## What Does NOT Change

- Edge functions continue using service-role (bypass RLS)
- `contacts` and `profiles` tables (already properly secured)
- No changes to `RespondPage.tsx` or public-facing response flows
- No changes to `get-response` or `submit-response` edge functions
