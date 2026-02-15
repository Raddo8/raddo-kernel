

# Add Operator to Mint Allowlist, Fix Config, and Validate End-to-End

## Summary

Two code changes, one config fix, then a comprehensive validation sequence covering the mint endpoint and all three auth paths on `execute-action-server`.

## Issue Found During Review

`supabase/config.toml` line 34 has `verify_jwt = false` for `mint-load-test-headers`, but the approved plan requires `verify_jwt = true`. The code comment on line 40 of the function even says "verify_jwt = true in config.toml ensures platform-level JWT enforcement." This mismatch must be fixed.

## Step 1: Code Changes

### 1a. `supabase/functions/mint-load-test-headers/index.ts` -- Add operator UUID

```
const ALLOWED_USER_IDS: string[] = [
  "760b2da9-f507-47f1-9dd3-e205446bd3da",  // jdb1203@gmail.com - load-test operator
];
```

### 1b. `supabase/config.toml` -- Fix verify_jwt

```toml
[functions.mint-load-test-headers]
verify_jwt = true
```

This aligns the config with the approved plan and the code's own comment.

## Step 2: Deploy

Deploy `mint-load-test-headers` only.

## Step 3: Validate Mint Endpoint

Call `POST /functions/v1/mint-load-test-headers` with the user's JWT, apikey, and `X-LoadTest-Secret` header.

**Expected**: 200 with `X-LoadTest-Timestamp`, `X-LoadTest-Token`, and `expiresAt` in response body.

**If 403**: Check `LOAD_TEST_AUTH_ENABLED` secret value, confirm redeployment completed, confirm header name match.

## Step 4: Verify Existing Auth Paths on execute-action-server

### 4a. Load-test path -- happy path

Use the minted `X-LoadTest-Timestamp` and `X-LoadTest-Token` headers to call `execute-action-server` with:
- `mode: "create"`
- `params.workspaceId: "a1b2c3d4-0000-0000-0000-000000000001"` (load-test workspace)
- `params.itemId: "a1b2c3d4-0000-0000-0000-000000000003"` (load-test item)
- `params.idempotencyKey: "lt-validation-001"`
- `params.type: "send_notice"`, `params.channel: "email"`

**Expected**: 200, `success: true`

### 4b. Load-test path -- constraint enforcement

| Test | Body mutation | Expected |
|------|--------------|----------|
| mode=execute rejected | `mode: "execute"` | 403 |
| Missing idempotency prefix | `idempotencyKey: "no-prefix"` | 400 |
| Missing workspaceId | omit `workspaceId` | 400 |
| Workspace mismatch | `workspaceId: "00000000-0000-0000-0000-000000000000"` | 400 |

### 4c. UI JWT path (existing behavior preserved)

Call `execute-action-server` with `Authorization: Bearer <JWT>` (no load-test headers), `mode: "create"`, using a real item from the user's own workspace (`f3ebf868-ba4b-48cc-a36c-079452d04c78`).

**Expected**: 200, `success: true` (confirms UI path still works and membership check passes).

### 4d. Cron path (existing behavior preserved)

Not directly testable via curl tool (requires minting cron HMAC headers from DB), but the code path is unchanged and tested by the scheduler. We can verify indirectly by confirming the cron auth branch code has not been modified in this change.

## Step 5: Report Results

Document pass/fail for each validation step. If all pass, the infrastructure is ready for k6 smoke testing by the operator.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/mint-load-test-headers/index.ts` | Add user UUID to `ALLOWED_USER_IDS` |
| `supabase/config.toml` | Change `verify_jwt = false` to `verify_jwt = true` for mint-load-test-headers |

