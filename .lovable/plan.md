

# Fix Missing Failure Breakdown in handleSummary

## Root Cause

The counter increment logic in the VU function is correct: non-200 responses fail `check()`, and status codes are categorized into `failStatus401/429/5xx/other` Counters. The bug is in `handleSummary` -- we are reading `metrics.fail_status_5xx?.values?.count` but have no confirmation this is the correct property path for k6 Counter metrics in the summary data object. If k6 uses a different key (e.g., `value` instead of `count`), all four counters silently return `0` via the `|| 0` fallback, and `totalFails` evaluates to `0`, hiding the entire breakdown block.

## Changes

### File: `load-tests/sustained.js`

**1. Add a one-time diagnostic dump (lines ~393-398)**

Before reading the counter values, dump the raw metric shape so we can see the actual structure:

```javascript
// Diagnostic: dump raw counter shape (remove after one run)
const rawCounter = metrics.fail_status_5xx;
if (rawCounter) {
  gates.push(`DEBUG: fail_status_5xx raw keys=${JSON.stringify(Object.keys(rawCounter.values || {}))}`);
}
```

**2. Read both possible property names (lines 394-397)**

Defensively read `count` OR `value` (the two known k6 Counter summary shapes):

```javascript
function counterVal(m) {
  if (!m?.values) return 0;
  return m.values.count ?? m.values.value ?? 0;
}

const s401 = counterVal(metrics.fail_status_401);
const s429 = counterVal(metrics.fail_status_429);
const s5xx = counterVal(metrics.fail_status_5xx);
const sOther = counterVal(metrics.fail_status_other);
```

**3. Always print the breakdown line (line 400)**

Change `if (totalFails > 0)` to unconditional so we always see the output, even when counts are zero (confirms the metrics are being read):

```javascript
gates.push(`INFO: Failure breakdown (total=${totalFails}): 401=${s401} 429=${s429} 5xx=${s5xx} other=${sOther}`);
```

This replaces the multi-line conditional block with a single always-visible line.

## Outcome

- After one run, the `DEBUG` line reveals the actual Counter values structure
- The breakdown line always appears, confirming counts are read (even if zero)
- Once confirmed, the `DEBUG` line can be removed in a follow-up

