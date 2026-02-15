

# Diagnose and Fix `maxVUs` k6 Parse Error

## Confirmed Ground Truth

The repository version of `load-tests/sustained.js` (lines 65-83) contains **no `maxVUs:` property** in the options object. The only `maxVUs` references are:
- Line 64: a comment (`// Scenario-driven options with explicit maxVUs`)
- Line 198: a log string inside `setup()`

Neither of these can cause `json: unknown field "maxVUs"`. **No code change is needed in the repository.**

## Problem

The user's local k6 is still erroring with `json: unknown field "maxVUs"`, which means k6 is either:
1. Executing a stale local copy that was never synced, or
2. Executing a different file entirely

## Required Diagnostic Sequence (user must run locally)

### Step 1: Capture ground truth of the local file

```bash
sed -n '55,95p' load-tests/sustained.js
```

This prints the options block. If `maxVUs:` appears as an actual key (not in a comment or string), the local file is stale.

### Step 2: Verify file identity and location

```bash
ls -l load-tests/sustained.js && pwd
```

Confirms timestamp, size, and working directory.

### Step 3: Run k6 against an absolute path

```bash
K6_SUSTAINED_VUS=20 k6 run "$(pwd)/load-tests/sustained.js"
```

Eliminates any possibility of k6 resolving a different file.

### Step 4: If error persists, force-replace (last resort)

Only after Steps 1-3 confirm we are editing and executing the same file, and the options block still contains a `maxVUs:` key:

```bash
git fetch origin main
git checkout origin/main -- load-tests/sustained.js
```

Then re-verify:

```bash
sed -n '55,95p' load-tests/sustained.js
/usr/bin/grep -n "maxVUs" load-tests/sustained.js
K6_SUSTAINED_VUS=20 k6 run "$(pwd)/load-tests/sustained.js"
```

## Optional Cleanup (after successful run)

Update the stale comment on line 64 from:
```
// -- Scenario-driven options with explicit maxVUs --
```
to:
```
// -- Scenario-driven options --
```

And update the log string on line 198 that references `maxVUs` to remove the now-irrelevant field name.

These are cosmetic and can be done after the canonical run is confirmed.

## Expected Outcome

- k6 banner shows the `sustained` scenario with `20 max VUs`
- End stats show `vus_max: 20`
- `handleSummary` prints `ATTEMPT CLASSIFICATION: CANONICAL` or `INVALID`

