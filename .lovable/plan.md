

# Revised Saturation Load Testing Strategy

## DO NOT APPROVE Remediation Applied

All six remediation requirements from the DO NOT APPROVE are addressed below.

## Summary

Replace the "edge function as primary saturation harness" approach with:
1. **External k6 scripts** as the canonical saturation measurement tool (runs outside the platform)
2. **Internal micro-benchmark edge function** (`health-probe`) constrained to low-RPS health checks only, explicitly not used for throughput ceiling determination

---

## Remediation 1: External Harness Is Primary

The saturation measurement tool is a **k6 script** stored in `load-tests/` at the project root. It runs from a developer workstation or CI runner -- never from inside the platform.

**Files created:**

- `load-tests/README.md` -- instructions, prerequisites, metric interpretation guide
- `load-tests/ramp.js` -- Phase 1: controlled ramp from 5 to N VUs, finds safe RPS ceiling
- `load-tests/sustained.js` -- Phase 2: 80% of ceiling for 15-30 minutes
- `load-tests/burst.js` -- Phase 3: 5x spike for 60 seconds

Each script targets `execute-action-server` create mode via HTTPS from outside the platform, measuring true client-observed latency.

**k6 was chosen because:**
- Runs externally (no shared platform resource contention)
- Native percentile calculation (p50/p95/p99)
- Threshold-based pass/fail (error rate > 1% = fail)
- Structured JSON output for dashboards
- Open source, no account required

---

## Remediation 2: Internal Function Is Micro-Benchmark Only

A small `health-probe` edge function replaces the proposed `load-test` function. Its role is strictly:

- Single-digit RPS (max 5 requests per invocation)
- Completes within 10 seconds
- Validates that the create path is responsive (not measuring capacity)
- Explicitly documented: "This function does NOT measure throughput ceilings"

**File:** `supabase/functions/health-probe/index.ts` (~80 lines)

---

## Remediation 3: Timeout Compliance

The `health-probe` function issues at most 5 sequential requests. Total expected runtime is under 10 seconds. No ramp schedule, no multi-step intervals. Each invocation is self-contained.

The external k6 scripts handle duration natively -- k6 manages its own process lifetime with no edge function timeout constraints.

---

## Remediation 4: Correct Duplicate Prevention Measurement

The k6 `ramp.js` script includes a **dedicated dedup subtest**:

- 10% of requests intentionally reuse idempotency keys in pairs (two requests share the same key, fired concurrently)
- Post-run verification query confirms exactly one action row per shared key
- Metric: `duplicate_prevention_rate` = (shared keys with exactly 1 row) / (total shared keys)
- This must equal 1.0 for a passing run

This is distinct from "unique key per request" (which measures throughput, not dedup).

---

## Remediation 5: Self-DoS and Production Contamination Guardrails

### k6 Scripts
- Target a **dedicated test workspace ID** passed as environment variable (`K6_TEST_WORKSPACE_ID`). Scripts refuse to run without it.
- Hard cap: `maxVUs` set per script (ramp: 50, sustained: 40, burst: 100)
- Hard cap: `maxDuration` set per script (ramp: 5m, sustained: 30m, burst: 2m)
- All test data uses `[LOAD-TEST]` prefix for identification and cleanup
- README includes explicit warning about production load generation

### health-probe Function
- Requires `"confirm_load": true` in request body or returns 400
- Hard cap: 5 requests per invocation
- Creates its own isolated test workspace with `[HEALTH-PROBE]` prefix
- Cleans up all data after each run
- Cannot be scheduled via cron (not in any cron job)

---

## Remediation 6: Metrics Scope Correction

### What k6 Measures (External)
- **Client-observed latency**: HTTP round-trip from k6 runner to edge function and back (includes DNS, TLS, network)
- **p50/p95/p99 of client latency**: true end-user-representative percentiles
- **Error rate**: HTTP 4xx/5xx as percentage of total requests
- **Throughput**: actual requests per second achieved

### What k6 Does NOT Measure
- DB CPU, memory, lock contention, connection pool usage
- Edge function cold start isolation
- Internal service-to-service latency

### Infrastructure Metrics (Collected Separately)
The README documents that during any k6 run, operators must simultaneously monitor:
- DB CPU and memory via Cloud dashboard
- Active connections via `pg_stat_activity`
- Lock contention via `pg_locks`
- Edge function invocation logs (latency, cold starts) via function logs

These are observed externally from the database/platform dashboards, not from inside the k6 script.

### What health-probe Measures
- **Internal request latency only** (edge-function-to-edge-function). Explicitly labeled as "not representative of end-user latency."
- Binary health: "create path responds within acceptable time" (yes/no)

---

## Files Summary

| File | Type | Purpose |
|---|---|---|
| `load-tests/README.md` | New | Setup, prerequisites, guardrails, metric interpretation |
| `load-tests/ramp.js` | New | Phase 1: controlled ramp, finds RPS ceiling |
| `load-tests/sustained.js` | New | Phase 2: 80% load for 15-30 min |
| `load-tests/burst.js` | New | Phase 3: 5x spike for 60s |
| `supabase/functions/health-probe/index.ts` | New | Micro-benchmark, max 5 requests, health check only |
| `supabase/config.toml` | Update | Add `[functions.health-probe]` with `verify_jwt = false` |

## Technical Notes

- k6 scripts authenticate via a pre-generated HMAC token passed as environment variable, or via a user JWT (configurable per script)
- Test workspace, account, and item are created in a setup phase and torn down in teardown
- No database migrations required
- No changes to existing edge functions
- HANDOFF and SECURITY_POSTURE_REPORT updates deferred until first k6 run produces quantified results

