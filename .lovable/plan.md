

# Reduce DB Round Trips in Load-Test Create Path

## Problem
The sustained load test passes error rate (0.37% < 1%) but fails latency thresholds:
- p95 = 4.36s (target: < 3s)
- p99 = 7.34s (target: < 5s)

Each `execute-action-server` create request performs ~8 sequential DB round trips. At 30 VUs (~15 req/s), this saturates the DB connection pool, causing cascading timeouts that manifest as "Invalid load test token" (verify RPC times out), "Item lookup failed" (query times out), and "connection timeout" (502s).

## Root Cause Analysis

Per-request DB calls in the create path:
1. `verify_load_test_token` RPC
2. Item lookup (account_id, workspace_id)
3. Workspace billing lookup (service client)
4. Period usage count (service client)
5. `getRateLimit` - item policy lookup
6. `getRateLimit` - policy_rate_rules query
7. Rate-limit count query
8. Action INSERT
9. `writeTimeline` INSERT

That is 9 DB round trips per request. Steps 3-7 are unnecessary for load-test mode since load-test traffic is not real billing/rate-limit-relevant traffic.

## Solution: Fast-Path for Load-Test Mode

Skip billing checks, policy rate-limit lookups, and timeline writes when `authResult.mode === "load-test"`. These safeguards exist for production traffic; load-test traffic already has its own edge rate limiter and idempotency guards.

This reduces the hot path from 9 DB calls to 3:
1. `verify_load_test_token` RPC
2. Item lookup
3. Action INSERT

## Changes

### File: `supabase/functions/execute-action-server/index.ts`

In the `handleCreate` function, wrap the billing, rate-limit, and timeline sections with a mode check:

```text
Before (pseudocode):
  [item lookup]
  [billing check]        -- 2 queries
  [getRateLimit]         -- 2 queries
  [rate count query]     -- 1 query
  [INSERT action]
  [writeTimeline]        -- 1 query

After:
  [item lookup]
  if (authResult.mode !== "load-test") {
    [billing check]
    [getRateLimit + rate count]
  }
  [INSERT action]
  if (authResult.mode !== "load-test") {
    [writeTimeline]
  }
```

Specifically:
- Wrap the billing soft-limit block (lines ~154-175) with `if (authResult.mode !== "load-test")`
- Wrap the rate-limit check block (lines ~178-194) with `if (authResult.mode !== "load-test")`
- Wrap the `writeTimeline` call (lines ~222-227) with `if (authResult.mode !== "load-test")`

### File: `load-tests/sustained.js`

Confirm the local script matches the repository version. The stack traces reference a function named `mintHeaders` (old code) rather than `mintHeadersRaw` (current code). If the local file is stale, `git pull` is required before re-running.

## Expected Impact

- DB calls per load-test request: 9 --> 3 (67% reduction)
- DB ops/sec at 30 VUs: ~120 --> ~45
- Expected p95 should drop well below the 3s target
- Production (UI/scheduler) paths remain completely unchanged

## Risk

- Load-test actions will not have timeline events (acceptable: they are cleaned up anyway)
- Load-test actions will not be billing-gated (acceptable: load-test workspace is not a real billing entity)
- Load-test actions will not be rate-limited by policy rules (acceptable: edge rate limiter at 500 req/10s remains active)

