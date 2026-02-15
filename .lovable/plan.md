

# Fix Init-Context Log Spam in sustained.js

## Problem

Lines 71-72 contain `console.log` calls at module scope (init context). In k6, the init context runs once **per VU**, so at 60 VUs these two lines produce 120 log lines of noise before the test even starts.

## Change

### File: `load-tests/sustained.js` (lines 70-72)

Remove the two `console.log` lines from module scope. They are already redundant because `setup()` (line 215) already logs the same information:

```javascript
console.log(`[sustained] Scenario target VUs: ${SUSTAINED_VUS}`);
```

**Before (lines 70-72):**
```javascript
// -- Startup logging --
console.log(`ENV K6_SUSTAINED_VUS=${__ENV.K6_SUSTAINED_VUS || "(unset)"}`);
console.log(`SUSTAINED_VUS=${SUSTAINED_VUS}`);
```

**After:**
```javascript
// Startup logging moved to setup() to avoid per-VU init-context spam.
```

The existing `setup()` function already logs the target VUs. If the raw env value is also desired, add one line to `setup()`:

```javascript
console.log(`[sustained] ENV K6_SUSTAINED_VUS=${__ENV.K6_SUSTAINED_VUS || "(unset)"}`);
console.log(`[sustained] Scenario target VUs: ${SUSTAINED_VUS}`);
```

This reduces 120 lines of init noise to 2 lines in setup, with zero behavioral change.

