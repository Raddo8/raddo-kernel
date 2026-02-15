
# Add Interrupt Detection to Acceptance Gate

## Goal

Prevent aborted/interrupted k6 runs from being classified as CANONICAL. Currently, a Ctrl+C'd run with good metrics falsely passes.

## Change

### File: `load-tests/sustained.js`

**In `handleSummary()`, insert two interrupt gates after `const gates = [];` (line 362) and before the existing `vuMax` check (line 363):**

```javascript
const gates = [];

// Gate: interrupted run (Ctrl+C / SIGINT / SIGTERM)
if (data.state?.isInterrupted) {
  gates.push("FAIL: run was interrupted (signal/abort)");
}
const iterInterrupted = metrics.iterations_interrupted?.values?.count || 0;
if (iterInterrupted > 0) {
  gates.push(`FAIL: iterations_interrupted=${iterInterrupted}`);
}

const vuMax = metrics.vus_max?.values?.max || 0;
// ... rest unchanged
```

Key details:
- Uses `data.state?.isInterrupted` (safe if field is missing)
- Uses `metrics.iterations_interrupted?.values?.count` (the real k6 summary metric name, not `metrics.iterations?.values?.interrupted`)
- Both gates produce `FAIL:` lines, so the existing `canonical = gates.filter(g => g.startsWith("FAIL")).length === 0` automatically classifies as INVALID
- No other files or functions change
