
# Fix Interrupt Detection Using Wall-Clock Duration

## Problem
`data.state.isInterrupted` does not exist in k6's runtime. The DEBUG dump confirms:
```
data.state={"isStdOutTTY":true,"isStdErrTTY":true,"testRunDurationMs":19924.966}
```
No `isInterrupted` field. The interrupt gate is dead code.

## Solution
Replace the `data.state?.isInterrupted` check with a wall-clock duration check using `testRunDurationMs`, which k6 reliably provides.

The sustained scenario has a known duration: 30s ramp-up + 15m hold + 30s ramp-down = 960s total. If `testRunDurationMs` is significantly less than the expected duration, the run was interrupted.

## Changes (all in `load-tests/sustained.js`)

### 1. Replace the interrupt gate (inside `handleSummary`)

Remove:
```js
if (data.state?.isInterrupted) {
  isCanonical = false;
  gates.push("FAIL: run was interrupted (signal/abort)");
}
```

Replace with:
```js
const expectedDurationMs = (30 + 900 + 30) * 1000; // 960s from scenario stages
const actualDurationMs = data.state?.testRunDurationMs || 0;
if (actualDurationMs < expectedDurationMs * 0.90) {
  isCanonical = false;
  gates.push(
    `FAIL: run duration ${(actualDurationMs / 1000).toFixed(1)}s < 90% of expected ${expectedDurationMs / 1000}s (likely interrupted)`
  );
}
```

This uses a 90% threshold (864s) to allow for minor timing variance while catching any interrupt or early abort.

### 2. Remove the two DEBUG diagnostic lines

Now that we've confirmed the shapes:
- `data.state` has `testRunDurationMs` (number), no `isInterrupted`
- `fail_item_lookup.values` is `null` when counter is 0, has `.count`/`.value` when incremented

Remove these two lines:
```js
gates.push(`DEBUG: data.state=${JSON.stringify(data.state || null)}`);
gates.push(`DEBUG: fail_item_lookup.values=${JSON.stringify(metrics.fail_item_lookup?.values || null)}`);
```

### 3. No other changes needed

The `counterVal` helper, `isCanonical` flag, failure breakdown, and item lookup gate are all confirmed working.

## Verification

After applying:
```bash
K6_FAIL_LOG_LIMIT=1 K6_SUSTAINED_VUS=10 k6 run "$(pwd)/load-tests/sustained.js"
```
Ctrl+C after ~15s. Expected:
- `ATTEMPT CLASSIFICATION: INVALID`
- `FAIL: run duration 15.2s < 90% of expected 960s (likely interrupted)`
- No DEBUG lines
