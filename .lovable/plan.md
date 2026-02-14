

# First Quantified k6 Ramp Test — Execution Plan

## Objective

Convert "infrastructure built" into "capacity quantified" by running the Phase 1 ramp test (`load-tests/ramp.js`) and documenting empirical results in the HANDOFF.

## Pre-Run Setup (Manual — Operator Steps)

### 1. Install k6

```text
brew install k6          # macOS
# or: https://k6.io/docs/getting-started/installation/
```

### 2. Create Test Fixtures

Create a dedicated `[LOAD-TEST]` workspace, account, and item in the database. This requires being logged in and using the UI, or running SQL via the backend admin panel.

### 3. Obtain Auth Token

Log in to the application and extract the JWT from the browser (Dev Tools > Application > Local Storage > `sb-*-auth-token` > `access_token`).

### 4. Set Environment Variables

```text
export K6_BASE_URL="https://vacpgxxgdfhgvkduljgs.supabase.co"
export K6_ANON_KEY="eyJhbGciOiJIUzI1NiIs..."
export K6_TEST_WORKSPACE_ID="<load-test-workspace-uuid>"
export K6_TEST_ACCOUNT_ID="<load-test-account-uuid>"
export K6_TEST_ITEM_ID="<load-test-item-uuid>"
export K6_AUTH_TOKEN="<your-jwt>"
```

## Execution

```text
k6 run --out json=results/ramp-001.json load-tests/ramp.js
```

The script ramps from 1 to 50 VUs over 3 minutes across 6 stages (5, 10, 20, 30, 40, 50 VUs). It auto-aborts if error rate exceeds 1%.

## During the Run — Monitor Separately

These cannot be measured by k6 and must be observed in the backend dashboard:

- DB CPU and memory utilization
- Active connections (`SELECT count(*) FROM pg_stat_activity`)
- Lock contention (`SELECT * FROM pg_locks WHERE NOT granted`)
- Edge function invocation logs (cold starts, errors)

## Post-Run Validation Checklist

### A. k6 Output Metrics (from terminal / JSON)

| Metric | Acceptance Threshold |
|---|---|
| Error rate | Less than 1% |
| p50 latency | Record as baseline |
| p95 latency | Record (no hard threshold on Phase 1) |
| p99 latency | Less than 5000ms (script threshold) |
| Peak RPS achieved | Record as safe ceiling |
| Total requests | Record |

### B. Idempotency Dedup Verification (Post-Run SQL)

```text
-- Count actions with duplicate idempotency keys (should be 0 duplicates)
SELECT idempotency_key, count(*)
FROM actions
WHERE idempotency_key LIKE 'lt-%'
  AND workspace_id = '<test-workspace-id>'
GROUP BY idempotency_key
HAVING count(*) > 1;
```

Expected: zero rows. Every dedup key produced exactly one action.

### C. Usage Event 1:1 Verification

```text
-- Every completed action should have exactly one usage_event
SELECT a.id, count(u.id) as usage_count
FROM actions a
LEFT JOIN usage_events u ON u.action_id = a.id
WHERE a.idempotency_key LIKE 'lt-%'
  AND a.workspace_id = '<test-workspace-id>'
  AND a.status = 'completed'
GROUP BY a.id
HAVING count(u.id) != 1;
```

Expected: zero rows.

### D. No Stuck Actions

```text
SELECT count(*)
FROM actions
WHERE idempotency_key LIKE 'lt-%'
  AND workspace_id = '<test-workspace-id>'
  AND status = 'running'
  AND claimed_at < now() - interval '5 minutes';
```

Expected: zero.

## Post-Run Documentation

After collecting results, I will update `docs/HANDOFF.md` to add a new section:

**"Capacity Quantification — Phase 1 Ramp Results"** containing:

- Run date (UTC, DB-sourced)
- k6 version used
- RPS ceiling achieved
- p50 / p95 / p99 latencies
- Error rate
- Dedup verification result
- Infrastructure observations (DB CPU, connections, locks)
- Pass/fail determination
- Updated maturity percentage (target: 85%+ if pass)

## Cleanup (Post-Documentation)

```text
DELETE FROM actions
WHERE workspace_id = '<test-workspace-id>'
  AND idempotency_key LIKE 'lt-%';

DELETE FROM timeline_events
WHERE account_id = '<test-account-id>'
  AND summary LIKE '%[LOAD-TEST]%';

DELETE FROM usage_events
WHERE workspace_id = '<test-workspace-id>'
  AND action_id IN (
    SELECT id FROM actions
    WHERE idempotency_key LIKE 'lt-%'
      AND workspace_id = '<test-workspace-id>'
  );
```

## What I Will Build

1. Create the `results/` directory placeholder with a `.gitkeep`
2. Add a `load-tests/POST_RUN_CHECKLIST.md` containing the validation queries and acceptance thresholds above, so operators have a single reference during and after runs
3. Update `docs/HANDOFF.md` with a placeholder section for capacity results (to be filled after the run)

## Summary

The harness is ready. The scripts are written. The safety guardrails are in place. This plan provides the exact execution sequence, monitoring requirements, validation queries, and documentation target so the first run produces institutionally recordable empirical proof of capacity.

