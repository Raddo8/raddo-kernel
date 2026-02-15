

# Add Failure Diagnostics to sustained.js (Counter Metrics + Safe Logging)

## Goal

Determine **which HTTP status codes** cause the 56% error rate at 60 VUs, using globally aggregated k6 Counter metrics and bounded fail-log sampling.

## Changes (single file: `load-tests/sustained.js`)

### 1. Add Counter imports and metrics (line 25, line 54-57 area)

Add `Counter` to the import from `k6/metrics`, then declare four Counter metrics:

```javascript
import { Counter, Rate, Trend } from "k6/metrics";

// ... existing metrics ...
const failStatus401 = new Counter("fail_status_401");
const failStatus429 = new Counter("fail_status_429");
const failStatus5xx = new Counter("fail_status_5xx");
const failStatusOther = new Counter("fail_status_other");
```

These aggregate across all VUs automatically -- no per-VU state issues.

### 2. Add fail-log sampling variable (module scope)

```javascript
const FAIL_LOG_LIMIT = parseInt(__ENV.K6_FAIL_LOG_LIMIT || "3", 10);
let failLogCount = 0;
```

Default is **3 per VU**. At 60 VUs worst case = 180 lines. This is acceptable and documented as per-VU. Low default keeps output readable.

### 3. Replace fail block in `default()` (lines 331-335)

Replace the current unconditional `console.warn` with status-code counting and capped logging:

```javascript
if (!success) {
  // Increment globally-aggregated status counters
  const s = res.status;
  if (s === 401) failStatus401.add(1);
  else if (s === 429) failStatus429.add(1);
  else if (s >= 500 && s <= 599) failStatus5xx.add(1);
  else failStatusOther.add(1);

  // Per-VU capped sampling (default: 3 per VU)
  if (failLogCount < FAIL_LOG_LIMIT) {
    failLogCount++;
    console.warn(
      `[FAIL] VU=${__VU} #${failLogCount} status=${res.status} body=${(res.body || "").substring(0, 200)}`
    );
  }
}
```

### 4. Add status breakdown to `handleSummary()` (after line 363, before the `canonical` check)

Read counts from `data.metrics` only -- no local JS state:

```javascript
// Status code breakdown (globally aggregated Counters)
const s401 = metrics.fail_status_401?.values?.count || 0;
const s429 = metrics.fail_status_429?.values?.count || 0;
const s5xx = metrics.fail_status_5xx?.values?.count || 0;
const sOther = metrics.fail_status_other?.values?.count || 0;
const totalFails = s401 + s429 + s5xx + sOther;

if (totalFails > 0) {
  gates.push(`INFO: Failure breakdown (total=${totalFails}):`);
  if (s401 > 0) gates.push(`  401: ${s401} (${(s401/totalFails*100).toFixed(1)}%)`);
  if (s429 > 0) gates.push(`  429: ${s429} (${(s429/totalFails*100).toFixed(1)}%)`);
  if (s5xx > 0) gates.push(`  5xx: ${s5xx} (${(s5xx/totalFails*100).toFixed(1)}%)`);
  if (sOther > 0) gates.push(`  other: ${sOther} (${(sOther/totalFails*100).toFixed(1)}%)`);
}
```

## What is NOT included

- No per-VU `statusTally` object -- removed entirely per your feedback
- No attempt to read module-scope variables in `handleSummary()` -- all reads are from `data.metrics`
- No changes to mint, setup, or any other functions

## Expected output at 60 VUs

```
ATTEMPT CLASSIFICATION: INVALID
  Target VUs: 60  |  Actual vus_max: 60
  FAIL: error_rate=55.96% (threshold: <1%)
  INFO: Failure breakdown (total=59939):
    429: 58200 (97.1%)
    5xx: 1739 (2.9%)
```

Plus ~180 sampled `[FAIL]` lines showing actual response bodies, which will confirm the dominant failure mode.

## Run command

```bash
K6_FAIL_LOG_LIMIT=3 K6_SUSTAINED_VUS=60 k6 run "$(pwd)/load-tests/sustained.js"
```

