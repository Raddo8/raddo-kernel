

# Fix maxVUs Warning and Prepare Full Sustained Run

## What passed
The smoke test confirmed the endpoint, auth, and headers are all correct. 5/5 requests returned 200 with 0% error rate. Average latency ~1.2s at 1 VU.

## Changes

### 1. Remove `maxVUs` from `load-tests/sustained.js` (line 49)

Remove the `maxVUs: 40` line from the exported `options` object. This field is not recognized by your k6 version at the top level (it only applies inside explicit scenario definitions). The `stages` executor already handles VU scaling to 30, so this line is unnecessary and causes the warning on every run.

### 2. Update `docs/HANDOFF.md` -- Record Attempt #2 results

Add a new entry under the Phase 2 Sustained Results section:

- **Attempt #2 (Smoke -- 1 VU, 5 iterations): PASS**
- Error rate: 0%
- p95 latency: 1.4s (threshold < 3s -- PASS)
- p99 latency: 1.45s (threshold < 5s -- PASS)
- Avg latency: 1.2s
- Root cause of Attempt #1 failure: expired JWT token (401 Invalid token)
- Next action: Run full 15-minute sustained test at 30 VUs

## After these changes deploy

1. Pull the latest code locally: `git pull`
2. Verify the fix: `grep -n "maxVUs" load-tests/sustained.js` (should return nothing)
3. Run the full sustained test:
   ```
   k6 run load-tests/sustained.js
   ```
   This runs: 30s ramp to 30 VUs, 15 min sustained, 30s ramp down.

Note: Your token expires in ~1 hour. The full test takes ~16 minutes, so you have time, but regenerate the token right before starting the full run to be safe.

