

# Stress Testing: Concurrent Execution, Retry, and Bounce Validation

## Summary

Build a comprehensive edge function test suite that empirically validates six open obligations before any architecture freeze or posture documentation is finalized. Each test targets a specific revenue-integrity risk.

## Open Obligations Being Validated

| Obligation | Risk Level | Test Approach |
|---|---|---|
| Concurrent execution race conditions | High | Double-submit atomic claim test |
| Burst scheduler load | High | Parallel process-scheduled-actions invocations |
| Hard bounce suppression | Medium | Simulated webhook with bounce payload |
| Soft bounce handling | Medium | Simulated webhook with soft bounce payload |
| Orphan webhook handling | Low | Webhook with unknown provider_message_id |
| Forced DB failure retry | Medium | Action execution with invalid data to trigger failure paths |

## Implementation: Single Test Edge Function

Create `supabase/functions/stress-test/index.ts` -- a HMAC-authenticated edge function that runs all six test scenarios in sequence and returns structured results. This keeps tests server-side where they have service_role access and can exercise the real code paths.

### Test 1: Double-Submit Race Condition

**What it proves**: The atomic claim (`UPDATE ... WHERE status IN ('scheduled','approved')` returning affected rows) prevents two concurrent executions of the same action.

**Steps**:
1. Create a test item + account in a test workspace
2. Insert a test action with status `scheduled`
3. Fire two parallel `executeActionCore()` calls for the same action ID
4. Assert: exactly one succeeds, exactly one gets "already claimed"
5. Clean up test data

### Test 2: Burst Scheduler Load

**What it proves**: Multiple scheduler invocations processing overlapping action sets do not produce duplicate executions due to the atomic claim gate.

**Steps**:
1. Insert 5 test actions with status `scheduled`, `scheduled_for` in the past
2. Fire 3 parallel calls to `process-scheduled-actions` (via internal fetch with HMAC headers)
3. Collect results: total `succeeded` + `failed` across all 3 invocations must equal exactly 5 (no duplicates, no misses)
4. Verify each action has status `completed` or `failed` (not `running`)
5. Clean up test data

### Test 3: Hard Bounce Suppression

**What it proves**: A webhook with `email.bounced` and `bounce.type = "hard"` correctly inserts into `suppression_list`.

**Steps**:
1. Insert a test action with `provider = 'resend'` and a known `provider_message_id`
2. Call `resend-webhook` with a crafted hard bounce payload (bypass signature verification by using the real HMAC with the configured `RESEND_WEBHOOK_SECRET`, or invoke the DB write path directly)
3. Assert: `message_events` row exists with `event_type = 'bounced'`
4. Assert: `suppression_list` row exists for the recipient email
5. Clean up test data

**Caveat**: Signature verification requires the `RESEND_WEBHOOK_SECRET`. The test will construct a valid HMAC signature using that secret, or alternatively exercise the DB write path directly via service_role to isolate the suppression logic from webhook auth.

### Test 4: Soft Bounce Handling

**What it proves**: A webhook with `email.bounced` and `bounce.type = "soft"` does NOT insert into `suppression_list` (only hard bounces suppress).

**Steps**:
1. Insert a test action with a known `provider_message_id`
2. Exercise the bounce handling logic with `bounce.type = "soft"`
3. Assert: `message_events` row exists (event was recorded)
4. Assert: NO `suppression_list` row exists for the recipient email
5. Clean up test data

### Test 5: Orphan Webhook

**What it proves**: A webhook referencing a `provider_message_id` that matches no action is logged but does not insert into `message_events` or `suppression_list`.

**Steps**:
1. Exercise the webhook path with a non-existent `provider_message_id`
2. Assert: no `message_events` row created
3. Assert: no `suppression_list` row created
4. Verify structured log contains `webhook_orphan` event

### Test 6: Forced Failure Retry Behavior

**What it proves**: An action that fails during execution transitions to `failed` status with error details in `result_json`, and a stuck-running action (claimed > 10 minutes ago) is recovered to `failed` status.

**Steps**:
1. Insert a test action, then set it to `running` with `claimed_at` 15 minutes in the past
2. Call `executeActionCore()` for this action
3. Assert: action status becomes `failed` (stuck recovery)
4. Assert: `result_json` contains timeout error
5. Assert: timeline event records the failure
6. Clean up test data

## Architecture

```
supabase/functions/stress-test/index.ts
```

- HMAC cron authentication (same pattern as other cron functions)
- Each test is an independent function returning `{ name, passed, details }`
- Tests run sequentially to avoid cross-contamination
- All test data uses a dedicated prefix (e.g., `stress-test-*`) and is cleaned up after each test
- Function returns aggregate results: total passed/failed with per-test details

## Authentication

Same HMAC cron token pattern used by `process-scheduled-actions` and `cleanup-maintenance`. No JWT needed -- this is an infrastructure function.

## Test Data Isolation

All test entities (accounts, items, actions) will:
- Use the first workspace found (or fail if none exists)
- Use names prefixed with `[STRESS-TEST]`
- Be deleted in a `finally` block regardless of test outcome
- Never touch production data

## What This Does NOT Test

- Actual Resend API delivery (requires live email infrastructure)
- Real cron scheduling (tests invoke functions directly)
- Frontend rendering (irrelevant to infrastructure integrity)

## Success Criteria

All 6 tests must pass before:
1. The institutional security posture report is regenerated
2. Horizon 1 infrastructure hardening is declared complete

## Execution Plan

1. Create `supabase/functions/stress-test/index.ts`
2. Deploy the function
3. Invoke it via `curl_edge_functions` with HMAC cron headers
4. Report results
5. If any test fails: diagnose and fix before proceeding

## Technical Details

**Concurrency test timing**: The double-submit test uses `Promise.all()` to fire two `executeActionCore()` calls in the same event loop tick. This is the tightest race window achievable in a single-process environment.

**Burst test parallelism**: Uses `Promise.all()` with 3 concurrent `fetch()` calls to `process-scheduled-actions`, each with valid HMAC headers. The atomic claim gate should prevent any action from being executed twice.

**Cleanup strategy**: Each test wraps its logic in try/finally with explicit DELETE statements using service_role. Test data is identified by convention (`[STRESS-TEST]` prefix in names) so any orphaned test data can be manually cleaned.

