
# Enforce 401 De Minimis Gate + Port Duration Gate

## 1. Add 401 enforcement gate to `sustained.js` (3 lines)

After the failure breakdown INFO line (line 427) and before the item_lookup gate (line 429), add:

```js
// Gate: 401s (de minimis threshold)
if (s401 > 5) {
  isCanonical = false;
  gates.push(`FAIL: fail_status_401=${s401} (threshold: <= 5)`);
}
```

This enforces the "Invalid load test token <= 5" requirement that is currently printed but not gated.

## 2. No changes to ramp.js or burst.js

Neither script has a `handleSummary` function, so there is no summary gating to port. The duration-based interrupt gate and `isCanonical` wiring are exclusive to sustained.js.

## Technical detail

The `s401` variable is already computed on line 422 via `counterVal(metrics.fail_status_401)`. The new gate simply checks `s401 > 5` and flips `isCanonical = false` if exceeded. No new imports, metrics, or helpers needed.
