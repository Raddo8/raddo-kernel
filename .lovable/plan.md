

# Plan: Fix sustained.js Script + Record Phase 2 Attempt #1 in HANDOFF

## Overview

Two focused changes: fix the k6 script for compatibility and failure visibility, then record the empirical FAIL result in the handoff document as institutional evidence.

---

## Step 1: Fix `load-tests/sustained.js`

Three changes to the script:

### 1a. Remove `maxDuration` (fixes the warning)

Remove the `maxDuration: "30m"` line from the options object (line 50). The scenario stages already define the total duration. The `maxVUs` field is valid and stays.

### 1b. Add failure logging

After the `check()` block, add a conditional that logs `res.status` and first 200 chars of `res.body` when the request fails. This surfaces whether failures are 429s, 401s, 5xx, or timeouts without adding noise on success.

### 1c. Disable `abortOnFail` for data collection run

Change `abortOnFail: true` to `abortOnFail: false` on the `error_rate` threshold. This allows a full 15-minute run to collect complete data. The thresholds still evaluate PASS/FAIL at the end -- the test just won't stop early. After a successful full-duration run is recorded, `abortOnFail` can be re-enabled.

---

## Step 2: Update `docs/HANDOFF.md`

### 2a. Record Phase 2 Attempt #1 results

Add a new section after the existing "Phase 1 Ramp Results" section (after line 583) titled "Phase 2 Sustained Results". Content:

```text
## CAPACITY QUANTIFICATION -- Phase 2 Sustained Results

### Attempt #1 (30 VUs) -- FAIL

| Metric               | Value                                          |
|-----------------------|------------------------------------------------|
| Run date (UTC)        | 2026-02-14                                     |
| Duration before abort | 01m52s (aborted by threshold breach)           |
| Error rate            | 1.04% (20/1909) -- FAIL (threshold: < 1%)     |
| p50 latency           | 1.02s                                          |
| p95 latency           | 1.42s -- PASS (threshold: < 3s)                |
| p99 latency           | 10.68s -- FAIL (threshold: < 5s)               |
| Max latency           | 24.61s                                         |
| RPS achieved          | ~17 req/s                                      |
| Total requests        | 1,909                                          |
| Pass/Fail             | FAIL                                           |

Failure classification: 20 requests failed; root cause not yet classified
(status codes pending jq extraction from results/sustained-phase2.json).
Long p99 tail suggests connection pool saturation or cold-start queuing
under 30 concurrent VUs.

Next action: Fix maxDuration warning, add failure logging, rerun full
15-minute duration with abortOnFail disabled for complete dataset.
```

### 2b. Update Key Caveat (line 589)

Append to the existing caveat text that Phase 2 sustained attempt #1 is recorded as FAIL, and a full-duration rerun is required before capacity can be quantified.

### 2c. Version timestamp

Source from `SELECT now() AT TIME ZONE 'UTC'` per documentation standards.

---

## Files Modified

1. `load-tests/sustained.js` -- remove `maxDuration`, add failure logging, disable `abortOnFail`
2. `docs/HANDOFF.md` -- add Phase 2 Attempt #1 results section, update caveat

## What This Does NOT Do

- Does not change thresholds (they remain the same PASS/FAIL criteria)
- Does not upgrade maturity percentages
- Does not mark capacity as proven
- Does not re-run the test (that's your next terminal step after these changes)

