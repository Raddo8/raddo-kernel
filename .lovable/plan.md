

# Test 7: Idempotency-Key Dedup Under Concurrent Insert

## Summary

Add a 7th stress test to `supabase/functions/stress-test/index.ts` that proves two simultaneous action-creation attempts with the same `idempotency_key` result in exactly one row, with the loser receiving a deterministic dedup indication and no duplicate side effects.

## What It Proves

The partial unique index `actions_idempotency_uq ON (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL` correctly prevents duplicate action rows. The `execute-action-server` create handler catches the `23505` (PG_UNIQUE_VIOLATION) and returns `{ skipped: true, reason: "duplicate" }` instead of leaking an error.

## Test Steps

1. Create test workspace, account, item (same helpers as existing tests)
2. Generate a deterministic idempotency key: `stress-dedup:{workspaceId}:{itemId}:{timestamp}`
3. Fire two parallel `fetch()` calls to `execute-action-server` with `mode: "create"` and identical params including the same `idempotency_key` -- using HMAC cron auth headers (same pattern as Test 2)
4. Assert:
   - Exactly one of the two responses has `skipped: false` and returns an `actionId`
   - Exactly one has `skipped: true, reason: "duplicate"`
   - Query `actions` table: exactly 1 row with that `idempotency_key`
   - Query `timeline_events` for the item: exactly 1 "Action queued" timeline entry (no duplicate side effects)
5. Clean up all test data

## Implementation Details

- Uses the real `execute-action-server` endpoint (not raw SQL), exercising the full production path including rate-limit check, insert, conflict handling, and timeline write
- HMAC cron headers obtained via `get_cron_headers()` RPC (same as burst scheduler test)
- `Promise.all()` for tightest race window
- Added as `testIdempotencyDedup()` function, wired into the main handler as Test 7
- Suite log updated from "6-test suite" to "7-test suite"
- Cleanup includes the created action and timeline events

## Changes

**File: `supabase/functions/stress-test/index.ts`**

1. Add new `testIdempotencyDedup` function (~80 lines) after `testStuckRecovery` (after line 617)
2. Update main handler (lines 655-691):
   - Change log message from "6-test suite" to "7-test suite"
   - Add `results.push(await testIdempotencyDedup(supabase))` with corresponding log line
   - Update result index references for the new 7th test

## Success Criteria

- 2 concurrent creates with same idempotency_key produces exactly 1 action row
- Loser returns `{ skipped: true, reason: "duplicate" }` -- no error leak
- Exactly 1 timeline event for the queued action (no duplicate side effects)
- Full suite: 7/7 PASS

