

# Harden suppression-admin Edge Function + UI Auth Guard

## Overview

Apply three security controls to the `suppression-admin` edge function and one UI fix, then run three verification tests. The function uses `verify_jwt = false` (consistent with all other project functions) but enforces a strict security boundary in code.

## Changes

### 1. Edge Function: `supabase/functions/suppression-admin/index.ts`

**Control 1 -- Strict Bearer token format (replace lines 15-21):**
- Header must start with `"Bearer "` and token must be 20+ characters
- Reject with 401 otherwise

**Control 2 -- Hard user-resolution gate (lines 30-36, already present but now stated as the explicit security boundary):**
- `supabase.auth.getUser()` must resolve a valid user
- If `userErr` or `!user`: return 401 immediately
- No membership query, no service-role client creation, no deletes happen past this point unless user resolves

**Control 3 -- UUID validation (add after line 38, before membership query):**
- Validate `workspace_id` matches UUID regex
- Validate `suppression_id` matches UUID regex when provided
- Reject with 400 if invalid

**Execution order is strictly gated:**

```text
Bearer format check (401)
  |
  v
auth.getUser() must resolve (401)
  |
  v
Parse + validate inputs (400)
  |
  v
Membership role check (403)
  |
  v
Service-role client + delete (only here)
```

No step executes unless the previous one passes.

### 2. UI Auth Guard: `src/pages/SuppressionList.tsx`

In `handleRemove` (line 127), after getting session:
- If `!session?.access_token`, show toast "Not authenticated" and return early
- Prevents sending `Bearer undefined` to the endpoint

### 3. Config: `supabase/config.toml`

Add entry (consistent with project convention):
```
[functions.suppression-admin]
verify_jwt = false
```

### 4. Deploy + Run Three Security Tests

**Test A -- No token -> 401:**
POST to `/suppression-admin` with no Authorization header.

**Test B -- Member token -> 403:**
POST with a valid user token for a non-admin member.

**Test C -- Admin + wrong workspace -> 403:**
POST with a valid admin token but a `workspace_id` the admin does not belong to.

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/suppression-admin/index.ts` | Strict Bearer check, UUID validation, unchanged user gate |
| `src/pages/SuppressionList.tsx` | Early return if no access_token |

## Acceptance Criteria

1. 401 on missing or malformed Bearer token (code-enforced)
2. 401 if `auth.getUser()` fails to resolve -- no downstream operations execute
3. 400 on non-UUID `workspace_id` or `suppression_id`
4. 403 on non-admin user
5. 403 on admin with non-member `workspace_id`
6. UI shows "Not authenticated" toast if session is missing
7. Tests A, B, C all pass

