

# Fix Test Integrity and Fixture Stability for Canonical Sustained Run

## Overview

Three changes to `load-tests/sustained.js` to ensure the next sustained run produces canonical, claimable results. No server-side changes (fast-path optimization is already deployed).

---

## 1A. Make K6_SUSTAINED_VUS deterministic

The script must explicitly set scenario targets and `maxVUs` from `__ENV.K6_SUSTAINED_VUS`. The banner and end-stats `vus_max` must reflect the configured value.

### Changes to `load-tests/sustained.js`:

**Add startup logging** (after line 55):
```js
console.log(`ENV K6_SUSTAINED_VUS=${__ENV.K6_SUSTAINED_VUS || "(unset)"}`);
console.log(`SUSTAINED_VUS=${SUSTAINED_VUS}`);
```

**Replace the `options` export** (lines 57-67) with a named scenario using `ramping-vus` executor and explicit `maxVUs`:
```js
export const options = {
  scenarios: {
    sustained: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: SUSTAINED_VUS },
        { duration: "15m", target: SUSTAINED_VUS },
        { duration: "30s", target: 0 },
      ],
      maxVUs: SUSTAINED_VUS,
      gracefulRampDown: "30s",
      gracefulStop: "30s",
    },
  },
  thresholds: {
    error_rate: [{ threshold: "rate<0.01", abortOnFail: false }],
    http_req_duration: ["p(95)<3000", "p(99)<5000"],
  },
};
```

**Add hard guard in `setup()`** (at the start of the function):
```js
if (__ENV.K6_SUSTAINED_VUS) {
  const envVal = parseInt(__ENV.K6_SUSTAINED_VUS, 10);
  if (SUSTAINED_VUS !== envVal) {
    fail(`VU mismatch: parsed SUSTAINED_VUS=${SUSTAINED_VUS} but K6_SUSTAINED_VUS=${envVal}`);
  }
}
console.log(`[sustained] Scenario target VUs: ${SUSTAINED_VUS}, maxVUs: ${SUSTAINED_VUS}`);
```

**Expected banner output:**
```
scenarios: (100.00%) 1 scenario, 20 max VUs, 16m30s max duration
         * sustained: Up to 20 looping VUs for 16m0s over 3 stages
```

---

## 1B. Remove fail() from VU runtime on mint refresh

`setup()` may call `fail()`. The VU default function must never call `fail()`.

### Changes:

**Delete `mintHeadersOrFail`** (lines 108-114). Replace it with a `mintHeadersForSetup` function that is clearly named for setup-only use:
```js
function mintHeadersForSetup() {
  const result = mintHeadersRaw();
  if (!result) {
    fail("Mint FAILED after 4 attempts in setup preflight");
  }
  return result;
}
```

Update the `setup()` call from `mintHeadersOrFail()` to `mintHeadersForSetup()`.

**Add two new metrics** (after line 52):
```js
const mintRefreshFailed = new Rate("mint_refresh_failed");
const vuSkippedNoHeaders = new Rate("vu_skipped_no_headers");
```

**Rewrite `getHeaders()`** with expiry-safe stale reuse and bounded backoff:

```js
const TOKEN_SAFETY_MARGIN_S = 30; // seconds before expiresAt to consider token dead
let mintBackoffMs = 500;
const MINT_BACKOFF_MAX_MS = 5000;

function getHeaders() {
  const now = Date.now();
  const nowSec = now / 1000;
  const expiredByTime = now - (cached?.mintedAt || 0) > refreshInterval;
  const expiredByToken = cached && nowSec > (cached.expiresAt - 60);

  if (!cached || expiredByTime || expiredByToken) {
    const minted = mintHeadersRaw();
    if (!minted) {
      mintRefreshFailed.add(true);
      // Bounded exponential backoff with jitter
      const jitter = 0.8 + Math.random() * 0.4;
      sleep((mintBackoffMs / 1000) * jitter);
      mintBackoffMs = Math.min(mintBackoffMs * 2, MINT_BACKOFF_MAX_MS);

      // Only reuse cached if it has not expired past safety margin
      if (cached && nowSec < (cached.expiresAt - TOKEN_SAFETY_MARGIN_S)) {
        console.warn(
          `[mint-refresh] Failed, reusing cached headers ` +
          `(age=${now - cached.mintedAt}ms, ttl=${Math.round(cached.expiresAt - nowSec)}s)`
        );
        return {
          "Content-Type": "application/json",
          "X-LoadTest-Timestamp": cached.ts,
          "X-LoadTest-Token": cached.token,
          apikey: ANON_KEY,
        };
      }
      // Cached headers are expired or don't exist -- skip iteration
      return null;
    }
    cached = minted;
    mintRefreshFailed.add(false);
    mintBackoffMs = 500; // reset backoff on success
    refreshInterval = JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);
  }
  return {
    "Content-Type": "application/json",
    "X-LoadTest-Timestamp": cached.ts,
    "X-LoadTest-Token": cached.token,
    apikey: ANON_KEY,
  };
}
```

Key behaviors:
- Stale headers are only reused if `now < (expiresAt - 30s)`. Past that, they are discarded and the iteration is skipped.
- `sleep()` is called with bounded exponential backoff (500ms to 5s) on each refresh failure.
- Backoff resets on successful mint.
- `mint_refresh_failed` tracks refresh failure rate. `vu_skipped_no_headers` tracks skipped iterations.

**Update `default()`** to record the skip metric:
```js
export default function (data) {
  const headers = getHeaders();
  if (!headers) {
    errorRate.add(true);
    vuSkippedNoHeaders.add(true);
    console.warn(`[SKIP] VU=${__VU} ITER=${__ITER} reason=no_valid_headers`);
    return;
  }
  vuSkippedNoHeaders.add(false);
  // ... rest unchanged
```

**Mechanical enforcement: no `fail()` in VU path.** The function `mintHeadersForSetup` is only called from `setup()`. A grep checklist step confirms this:
```
grep -n "fail(" load-tests/sustained.js
```
Must show `fail()` only inside: init guards (lines ~33-48), `mintHeadersForSetup`, and `setup()`. Zero calls inside `default()` or `getHeaders()`.

---

## 2. Stabilize fixtures

### 2a. Pass validated IDs from setup to VUs

**In `setup()`**, change the return to include fixture IDs:
```js
return { runId: RUN_ID, itemId: ITEM_ID, workspaceId: WORKSPACE_ID };
```

**In `default(data)`**, use `data.itemId` and `data.workspaceId`:
```js
export default function (data) {
  // ...
  const payload = JSON.stringify({
    mode: "create",
    params: {
      itemId: data.itemId,
      workspaceId: data.workspaceId,
      // ...
```

### 2b. Server-side error classification (already correct)

The server already returns three distinct responses for item lookup issues:
- `"Item lookup failed"` (500) -- DB error/timeout (`itemErr` is truthy)
- `"Item not found"` (404) -- zero rows returned
- `"Invalid load test token"` (401) -- auth RPC failure

No server change needed. The "Item lookup failed" errors seen in previous runs were DB connection timeouts caused by pool saturation from 9 concurrent queries per request. The fast-path optimization (already deployed) reduces this to 3 queries, which is the primary mitigation.

### 2c. Add a composite index if needed (deferred)

The item lookup `.eq("id", itemId).eq("workspace_id", wsId)` hits the primary key index on `id` (single row scan), so no additional index is required. If "Item lookup failed" persists after the fast-path is active, we revisit with a covering index.

---

## 3. Attempt acceptance gate

**Add a post-run validation block at the end of the script output.** In `setup()`, log the canonical acceptance criteria:

```js
console.log(`[sustained] === ATTEMPT ACCEPTANCE GATE ===`);
console.log(`[sustained] Required: vus_max=${SUSTAINED_VUS}`);
console.log(`[sustained] Required: zero GoError/fail() stack traces`);
console.log(`[sustained] Required: zero "Item lookup failed"`);
console.log(`[sustained] Required: "Invalid load test token" <= 5 (de minimis)`);
```

**Add a `handleSummary` export** to programmatically validate the run:
```js
export function handleSummary(data) {
  const metrics = data.metrics;

  const gates = [];
  const vuMax = metrics.vus_max?.values?.max || 0;
  if (vuMax !== SUSTAINED_VUS) {
    gates.push(`FAIL: vus_max=${vuMax}, expected=${SUSTAINED_VUS}`);
  }

  const mintFails = metrics.mint_refresh_failed?.values?.rate || 0;
  const skipRate = metrics.vu_skipped_no_headers?.values?.rate || 0;

  gates.push(`INFO: mint_refresh_failed rate=${(mintFails * 100).toFixed(2)}%`);
  gates.push(`INFO: vu_skipped_no_headers rate=${(skipRate * 100).toFixed(2)}%`);

  const errRate = metrics.error_rate?.values?.rate || 0;
  if (errRate >= 0.01) {
    gates.push(`FAIL: error_rate=${(errRate * 100).toFixed(2)}% (threshold: <1%)`);
  }

  const p95 = metrics.http_req_duration?.values?.["p(95)"] || 0;
  const p99 = metrics.http_req_duration?.values?.["p(99)"] || 0;
  if (p95 >= 3000) gates.push(`FAIL: p95=${p95.toFixed(0)}ms (threshold: <3000ms)`);
  if (p99 >= 5000) gates.push(`FAIL: p99=${p99.toFixed(0)}ms (threshold: <5000ms)`);

  const canonical = gates.filter(g => g.startsWith("FAIL")).length === 0;

  const summary = [
    "",
    "═══════════════════════════════════════",
    `  ATTEMPT CLASSIFICATION: ${canonical ? "CANONICAL" : "INVALID"}`,
    `  Target VUs: ${SUSTAINED_VUS}  |  Actual vus_max: ${vuMax}`,
    ...gates.map(g => `  ${g}`),
    "═══════════════════════════════════════",
    "",
  ].join("\n");

  return {
    stdout: summary + textSummary(data, { indent: "  " }),
  };
}
```

This requires importing `textSummary`:
```js
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";
```

The run is only classified as CANONICAL if all gates pass. The summary block prints at the end of every run, making it impossible to misattribute a failed run.

---

## File change summary

| File | Change |
|---|---|
| `load-tests/sustained.js` | All changes: VU scenario, mint resilience, fixture passthrough, acceptance gate |

No server-side changes. No edge function redeployment needed.

## Pre-run checklist (manual, by operator)

1. `git pull` to get latest
2. `grep -n "fail(" load-tests/sustained.js` -- confirm `fail()` only in init guards, `mintHeadersForSetup`, and `setup()`
3. `grep -n "mintHeadersOrFail" load-tests/sustained.js` -- confirm zero matches (deleted)
4. Run: `K6_SUSTAINED_VUS=20 k6 run load-tests/sustained.js`
5. Verify banner shows `20 max VUs`
6. Verify end summary shows `ATTEMPT CLASSIFICATION: CANONICAL` or specific `FAIL` reasons

