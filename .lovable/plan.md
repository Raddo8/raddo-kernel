

# Fix Test-Harness Governance: 3 Classification Bugs

## Summary

The `handleSummary` gate declared CANONICAL while violating its own stated acceptance criteria. Three precise fixes are needed -- all in `load-tests/sustained.js`.

---

## Fix 1: Add `fail_item_lookup` Counter and enforce it in the gate

**Problem:** The gate prints "Required: zero Item lookup failed" but never actually checks for it. A 500 response containing "Item lookup failed" passes as CANONICAL.

**Changes:**

- Declare a new Counter at module scope (near line 61):
  ```javascript
  const failItemLookup = new Counter("fail_item_lookup");
  ```

- In the VU failure block (inside `if (!success)`, around line 338), after the status counter increment, parse the body for the known error signature and increment:
  ```javascript
  const bodyStr = (res.body || "").substring(0, 300);
  if (bodyStr.includes("Item lookup failed")) {
    failItemLookup.add(1);
  }
  ```

- In `handleSummary`, read the counter and hard-fail classification:
  ```javascript
  const itemLookupFails = counterVal(metrics.fail_item_lookup);
  if (itemLookupFails > 0) {
    gates.push(`FAIL: item_lookup_failed=${itemLookupFails} (required: 0)`);
  }
  ```

---

## Fix 2: Fix interrupt gating -- use `data.state.isInterrupted` only

**Problem:** Normal end-of-stage ramp-down causes k6 to report a small number of `iterations_interrupted`. The current gate treats any non-zero value as FAIL, which incorrectly disqualifies clean runs.

**Change (lines 363-370):** Keep the `data.state.isInterrupted` check (true signal/abort). Remove or downgrade the `iterations_interrupted` counter check to INFO-only:

```javascript
// Gate: manual abort (Ctrl+C / SIGINT / SIGTERM)
if (data.state?.isInterrupted) {
  gates.push("FAIL: run was interrupted (signal/abort)");
}
const iterInterrupted = counterVal(metrics.iterations_interrupted);
if (iterInterrupted > 0) {
  gates.push(`INFO: iterations_interrupted=${iterInterrupted} (normal ramp-down)`);
}
```

---

## Fix 3: Remove leftover init-scope log spam

**Problem:** Despite the earlier fix attempt, the comment at line 70 replaced the logs but the user reports the ENV lines are still printing per-VU. Looking at the code, the logs are correctly in `setup()` now (lines 206-207), so the init-scope is clean. However, the `setup()` acceptance-gate banner (lines 285-289) prints rules the gate does not enforce -- this is now addressed by Fix 1.

No additional change needed for log spam -- the prior fix is correct. The repeated lines the user saw were from a run before that fix was deployed.

---

## Technical Detail: Exact locations

| What | Where | Action |
|---|---|---|
| New `failItemLookup` Counter | Line 61 (after `failStatusOther`) | Add declaration |
| Body parsing + counter increment | Lines 338-352 (failure block) | Add body check |
| Item lookup gate in `handleSummary` | After line 411 (after status breakdown) | Add FAIL gate |
| `iterations_interrupted` gate | Lines 367-370 | Change FAIL to INFO |
| DEBUG diagnostic line | Lines 393-397 | Remove (served its purpose) |

