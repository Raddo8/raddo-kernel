

# Remove JWT Dependency from Load-Test Minting

## Problem

The `AUTH_TOKEN` (a short-lived Supabase JWT) expires mid-run (~11 minutes), causing `mint-load-test-headers` to return 401 for the remainder of the sustained test. This collapses header rotation and invalidates the run.

The existing security gates on the mint endpoint are already sufficient without JWT:
- Gate 1: Environment guard (`LOAD_TEST_ENABLED`)
- Gate 2: `X-LoadTest-Secret` (high-entropy shared secret)
- Gate 4: Hardcoded user-ID allowlist
- Gate 5: Rate limit (200/60s per key)

The JWT (Gate 3) adds no meaningful security given the other gates, but introduces a time-bomb that kills long runs.

## Changes

### 1. Edge Function: `supabase/functions/mint-load-test-headers/index.ts`

Replace Gate 3 (JWT validation + user extraction) with a new `X-LoadTest-Operator` header that the k6 script provides. This header carries the operator's user ID, which is then validated against the existing allowlist (Gate 4).

**Before (lines 40-61):** Validates JWT via `getUser()`, extracts `user.id`
**After:** Reads `X-LoadTest-Operator` header, validates it's in `ALLOWED_USER_IDS`

- Remove the `userClient` creation and `getUser()` call entirely
- Read operator ID from `req.headers.get("X-LoadTest-Operator")`
- Reject if missing or not in allowlist
- Rate-limit key becomes `mint-lt:${operatorId}` (same as before, just sourced differently)
- Update CORS `Access-Control-Allow-Headers` to include `x-loadtest-operator`

### 2. k6 Scripts: Remove `Authorization` from mint requests

**Files:** `load-tests/sustained.js`, `load-tests/burst.js`, `load-tests/ramp.js`

In each script's `mintHeadersRaw()` function, replace:
```
Authorization: `Bearer ${AUTH_TOKEN}`,
```
with:
```
"X-LoadTest-Operator": OPERATOR_ID,
```

Add a new env var `K6_OPERATOR_ID` (the operator's user UUID) and remove `AUTH_TOKEN` from the mint request headers.

**Keep `AUTH_TOKEN` for preflight only:** The `setup()` function still uses JWT to validate workspace/item via PostgREST REST API (RLS-gated reads). This is fine because `setup()` runs once at the start before the JWT expires.

### 3. k6 Scripts: Update env var validation

- Add `OPERATOR_ID = __ENV.K6_OPERATOR_ID` 
- Keep `AUTH_TOKEN` as required (still used in `setup()` for preflight RLS queries)
- Update the `fail()` guard to check for `OPERATOR_ID`
- Add placeholder guard for `OPERATOR_ID`

### 4. Documentation: `load-tests/README.md`

Update the env var table:
- Add `K6_OPERATOR_ID`: Operator user UUID (from allowlist in mint-load-test-headers)
- Update `K6_AUTH_TOKEN` description: Used only for preflight fixture validation, not for minting

## Security Analysis

| Gate | Before | After |
|------|--------|-------|
| Environment guard | Same | Same |
| `X-LoadTest-Secret` | Same | Same |
| Operator identity | JWT `getUser()` -> allowlist | `X-LoadTest-Operator` header -> allowlist |
| Rate limit | Per user ID | Per operator ID (same) |

The allowlist is hardcoded in source code. An attacker would need both the `LOAD_TEST_SECRET` AND a valid operator UUID from the allowlist to mint. The JWT added no practical security beyond what the secret + allowlist already provide.

## Files Changed

1. `supabase/functions/mint-load-test-headers/index.ts` -- remove JWT auth, add operator header
2. `load-tests/sustained.js` -- use `X-LoadTest-Operator` instead of `Authorization` in mint
3. `load-tests/burst.js` -- same
4. `load-tests/ramp.js` -- same
5. `load-tests/README.md` -- update env var docs

