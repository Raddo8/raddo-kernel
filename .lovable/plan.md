

# Corrected Plan: Cleanup Function + Sustained k6 + HANDOFF Documentation

## Overview

Three steps executed in strict order. The key correction from the rejected plan: k6 remains the sole authority for capacity measurement. Edge function calls are never used as a substitute for sustained load testing.

---

## Step 1: Create `cleanup-load-test` Edge Function (with guardrails)

Create `supabase/functions/cleanup-load-test/index.ts` with the following safety mechanisms:

- **HMAC cron auth only** (same pattern as stress-test) -- no user JWT path
- **Explicit confirm flag**: Refuses execution unless `{ "confirm": true }` is in the request body
- **Workspace scoping**: Requires `workspaceId` in the request body; only deletes rows matching that workspace
- **Prefix scoping**: Only deletes rows where `idempotency_key` matches known test prefixes (`burst-`, `direct-test`, `lt-`, `st-`)
- **Audit response**: Returns JSON with per-table deleted row counts
- **Deletion order** (FK-safe): usage_events, timeline_events, actions, items, contacts, accounts, workspace_members, workspaces
- **Name-based scoping for fixtures**: Only deletes workspaces/accounts/items where name contains `[LOAD-TEST]` or `[STRESS-TEST]`

Add to `supabase/config.toml`:
```text
[functions.cleanup-load-test]
verify_jwt = false
```

After deployment, execute it once to clean the 9 orphaned burst/direct-test actions and associated usage_events/timeline_events. Verify zero remaining artifacts via database query.

---

## Step 2: Sustained k6 Test (Phase 2) -- k6 remains authoritative

k6 is the only tool used for capacity measurement. This step provides the terminal commands with pre-filled environment variables so you can run it locally.

**What I will provide (not execute):**

1. Fresh auth token extraction instructions (the previous token has expired)
2. Pre-filled export commands for all 6 environment variables
3. The exact command: `k6 run load-tests/sustained.js`
4. Instructions to paste results back here

**What k6 sustained.js measures:**
- 30 VUs held for 15 minutes
- p50/p95/p99 client-observed latency
- Error rate (threshold: < 1%, auto-abort)
- Total RPS achieved under sustained pressure

**What you must monitor separately during the run:**
- DB CPU/memory via Cloud dashboard
- Active connections: `SELECT count(*) FROM pg_stat_activity`
- Lock contention: `SELECT count(*) FROM pg_locks WHERE NOT granted`
- Edge function logs for cold starts and errors

**Required output artifacts:**
- JSON results file: `k6 run --out json=results/sustained-phase2.json load-tests/sustained.js`
- Terminal summary pasted back here for documentation
- UTC timestamp from database: `SELECT now() AT TIME ZONE 'UTC'`
- k6 version: `k6 version`

---

## Step 3: Document Results into HANDOFF

Only after k6 sustained results exist, update `docs/HANDOFF.md`:

- Lines 561-583: Replace "PENDING" values with actual k6 metrics
- Add a new section for Phase 2 sustained results (separate from Phase 1 ramp)
- Document cleanup function existence and usage
- Record stress-test 7/7 pass and burst test results as correctness evidence (not capacity evidence)
- Do NOT upgrade maturity percentage until sustained metrics are documented
- Version timestamp sourced from `SELECT now() AT TIME ZONE 'UTC'`

The "PENDING" language and current key caveat (line 589) remain unchanged until real sustained k6 metrics exist.

---

## Technical Details

### cleanup-load-test function structure

```text
supabase/functions/cleanup-load-test/index.ts
```

Auth: HMAC cron token via verify_cron_token RPC (same as stress-test, process-scheduled-actions)

Request body schema:
- `confirm: boolean` (required, must be `true`)
- `workspaceId: string` (required UUID)
- `prefixes: string[]` (optional, defaults to `["burst-", "direct-test", "lt-", "st-"]`)
- `includeFixtures: boolean` (optional, defaults to `false` -- when true, also deletes `[LOAD-TEST]`/`[STRESS-TEST]` named fixtures)

Response: `{ success: true, deleted: { usage_events: N, timeline_events: N, actions: N, ... } }`

Rejection cases:
- Missing/invalid HMAC token: 401
- `confirm !== true`: 400 with message "Explicit confirm:true required"
- Missing workspaceId: 400

### Files created/modified

1. NEW: `supabase/functions/cleanup-load-test/index.ts`
2. MODIFIED: `docs/HANDOFF.md` (lines 561-589, only after Step 2 completes)
3. MODIFIED: `load-tests/README.md` (add cleanup function reference to Cleanup section)

### What this plan does NOT do

- Does not use edge function calls to simulate sustained load
- Does not replace k6 as the capacity measurement authority
- Does not upgrade HANDOFF maturity until k6 sustained metrics are documented
- Does not conflate stress-test correctness results with capacity quantification

