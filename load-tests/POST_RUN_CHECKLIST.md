# k6 Ramp Test — Post-Run Validation Checklist

> Run this checklist after every `k6 run load-tests/ramp.js` execution.
> Replace `<test-workspace-id>` and `<test-account-id>` with actual UUIDs.

---

## A. k6 Output Metrics (from terminal / JSON)

| Metric | Acceptance Threshold | Actual |
|---|---|---|
| Error rate | < 1% | |
| p50 latency | Record as baseline | |
| p95 latency | Record (no hard threshold) | |
| p99 latency | < 5000ms | |
| Peak RPS achieved | Record as safe ceiling | |
| Total requests | Record | |

---

## B. Idempotency Dedup Verification

```sql
-- Should return zero rows (no duplicate idempotency keys)
SELECT idempotency_key, count(*)
FROM actions
WHERE idempotency_key LIKE 'lt-%'
  AND workspace_id = '<test-workspace-id>'
GROUP BY idempotency_key
HAVING count(*) > 1;
```

**Expected:** Zero rows.

---

## C. Usage Event 1:1 Verification

```sql
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

**Expected:** Zero rows.

---

## D. No Stuck Actions

```sql
SELECT count(*)
FROM actions
WHERE idempotency_key LIKE 'lt-%'
  AND workspace_id = '<test-workspace-id>'
  AND status = 'running'
  AND claimed_at < now() - interval '5 minutes';
```

**Expected:** Zero.

---

## E. Infrastructure Observations (Record During Run)

| Metric | Source | Value |
|---|---|---|
| DB CPU % | Cloud dashboard | |
| DB Memory % | Cloud dashboard | |
| Active connections | `SELECT count(*) FROM pg_stat_activity` | |
| Ungranted locks | `SELECT count(*) FROM pg_locks WHERE NOT granted` | |
| Cold starts observed | Edge function logs | |
| Edge function errors | Edge function logs | |

---

## F. Pass/Fail Determination

- [ ] Error rate < 1%
- [ ] p99 < 5000ms
- [ ] Zero duplicate idempotency keys
- [ ] Zero usage event mismatches
- [ ] Zero stuck actions
- [ ] No ungranted locks during run

**Overall:** PASS / FAIL

---

## G. Cleanup (After Documenting Results)

```sql
-- Delete test actions
DELETE FROM actions
WHERE workspace_id = '<test-workspace-id>'
  AND idempotency_key LIKE 'lt-%';

-- Delete test timeline events
DELETE FROM timeline_events
WHERE account_id = '<test-account-id>'
  AND summary LIKE '%[LOAD-TEST]%';

-- Delete test usage events (run BEFORE deleting actions if needed)
DELETE FROM usage_events
WHERE workspace_id = '<test-workspace-id>'
  AND action_id IN (
    SELECT id FROM actions
    WHERE idempotency_key LIKE 'lt-%'
      AND workspace_id = '<test-workspace-id>'
  );
```
