

# Fix Classification Wiring: Make the Gate Impossible to Lie

## Problem

The `handleSummary` gate prints `CANONICAL` even when:
- The run was Ctrl+C interrupted
- "Item lookup failed" errors occurred

Two root causes:
1. `data.state?.isInterrupted` may not exist in k6's goja runtime -- the interrupt signal may need to be detected differently
2. `counterVal()` is called at line 373 (for `iterations_interrupted`) before its definition at line 401 -- k6's goja engine may not hoist inner function declarations like V8 does, causing it to silently return `undefined` and skip gates

## Changes (all in `load-tests/sustained.js`)

### 1. Move `counterVal` to the top of `handleSummary` (before any usage)

Move the function definition from line 401 to immediately after `const gates = [];` (line 367). This eliminates any hoisting ambiguity in goja.

### 2. Replace the filter-based classification with an explicit boolean

Replace:
```javascript
const canonical = gates.filter(g => g.startsWith("FAIL")).length === 0;
```

With a pattern that cannot lie:
```javascript
let isCanonical = true;
// ... each gate sets isCanonical = false when pushing FAIL
```

Every `gates.push("FAIL: ...")` line will be preceded by `isCanonical = false;`. This makes classification an explicit state machine rather than a string-parsing heuristic.

### 3. Add diagnostic dumps (one-time, remove after confirmation)

Add two diagnostic lines to the summary output:
```javascript
gates.push(`DEBUG: data.state=${JSON.stringify(data.state || null)}`);
gates.push(`DEBUG: fail_item_lookup.values=${JSON.stringify(metrics.fail_item_lookup?.values || null)}`);
```

These reveal:
- Whether `data.state.isInterrupted` exists at all in k6's runtime
- Whether the `fail_item_lookup` counter has `count`, `value`, or something else

### 4. Remove init-scope log spam

Move the two environment variable log lines from module scope to inside `setup()` (if not already there -- verify current placement).

## Resulting `handleSummary` structure

```text
export function handleSummary(data) {
  const metrics = data.metrics;
  const gates = [];
  let isCanonical = true;

  // Helper (defined first, no hoisting risk)
  function counterVal(m) { ... }

  // DEBUG dumps (remove after one run)
  gates.push(`DEBUG: data.state=...`);
  gates.push(`DEBUG: fail_item_lookup.values=...`);

  // Gate: manual abort
  if (data.state?.isInterrupted) {
    isCanonical = false;
    gates.push("FAIL: run was interrupted");
  }

  // Gate: vus_max
  if (vuMax !== SUSTAINED_VUS) {
    isCanonical = false;
    gates.push("FAIL: ...");
  }

  // Gate: error_rate
  // Gate: p95, p99
  // Gate: item_lookup_failed
  // ... each sets isCanonical = false on FAIL

  // Final: impossible to misclassify
  const label = isCanonical ? "CANONICAL" : "INVALID";
```

## Verification sequence

1. Run short test, Ctrl+C it -- must print `INVALID` + the DEBUG lines
2. Run short test provoking one lookup failure -- must print `INVALID`
3. Remove DEBUG lines once metric shapes are confirmed
4. Clean 16-minute run for true CANONICAL

