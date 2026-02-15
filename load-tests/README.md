# RADDO Saturation Load Testing

> **WARNING**: These scripts generate real HTTP load against your edge functions and database.
> Running them against a production workspace **will affect real users**.
> Always use a dedicated test workspace.

## Prerequisites

1. [k6](https://k6.io/docs/getting-started/installation/) installed locally or in CI
2. A dedicated test workspace ID (never use production)
3. `LOAD_TEST_AUTH_ENABLED` must be set to `"true"` in backend secrets
4. `LOAD_TEST_SECRET` must be set in backend secrets

## Authentication Architecture

Load tests use a **dedicated HMAC auth path** that is cryptographically isolated from the production cron system:

1. **Minting**: k6 calls `mint-load-test-headers` with `X-LoadTest-Operator` (operator UUID) + `X-LoadTest-Secret` header
2. **The mint endpoint** validates the operator against the hardcoded allowlist, rate-limits, then returns short-lived HMAC headers (`X-LoadTest-Timestamp`, `X-LoadTest-Token`) with a 120-second validity window
3. **Load requests** use these HMAC headers (not JWT) to authenticate against `execute-action-server`
4. **Header rotation**: Each VU refreshes headers every 45-75 seconds (jittered to prevent thundering herd)

The signing key (`load_test_auth`) is separate from the cron signing key. A compromised load-test path cannot forge production scheduler auth.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `K6_BASE_URL` | Yes | Supabase project URL (e.g., `https://vacpgxxgdfhgvkduljgs.supabase.co`) |
| `K6_ANON_KEY` | Yes | Supabase anon key |
| `K6_TEST_WORKSPACE_ID` | Yes | Dedicated test workspace UUID. Scripts refuse to run without this. |
| `K6_TEST_ITEM_ID` | Yes | Test item UUID within the workspace |
| `K6_AUTH_TOKEN` | Yes | User JWT — used **only in preflight** for RLS-gated fixture validation, not for minting |
| `K6_LOADTEST_SECRET` | Yes | Gate secret for mint-load-test-headers endpoint |
| `K6_OPERATOR_ID` | Yes | Operator user UUID (must be in `ALLOWED_USER_IDS` in mint-load-test-headers) |

## Setup

Before running any script:

1. Set `LOAD_TEST_AUTH_ENABLED` to `"true"` in backend secrets
2. Set `LOAD_TEST_SECRET` in backend secrets
3. Add your user ID to the `ALLOWED_USER_IDS` array in `mint-load-test-headers/index.ts`
4. Create test fixtures in your test workspace:
   - Create a workspace with `[LOAD-TEST]` prefix in name
   - Create an account within it
   - Create an item within the account
5. Set the environment variables above
6. Get a fresh JWT from your browser (Local Storage → `sb-*-auth-token`)

## Preflight

All scripts run a `setup()` preflight that:

1. Mints HMAC headers (validates JWT → mint → HMAC chain)
2. Validates workspace exists (via REST with JWT)
3. Validates item exists and belongs to workspace (via REST with JWT)
4. Sends one create request with minted HMAC headers (validates load-test auth path end-to-end)

If any step fails, `fail()` is called and the entire run aborts before VUs start.

## Scripts

### Phase 1: Controlled Ramp (`ramp.js`)

Determines the safe RPS ceiling by ramping virtual users from 1 to 50.

```bash
k6 run load-tests/ramp.js
```

**Pass criteria**: error rate < 1%, p99 < 5s.

**Dedup subtest**: 10% of requests intentionally reuse idempotency keys in pairs.
Post-run, query the database to verify exactly one action row per shared key.

### Phase 2: Sustained Load (`sustained.js`)

Holds at a target VU count (default: 30) for 15 minutes to detect latency drift,
connection pool saturation, and memory growth.

```bash
k6 run load-tests/sustained.js
```

### Phase 3: Burst Spike (`burst.js`)

Applies a 5× spike for 60 seconds after a warm-up period.

```bash
k6 run load-tests/burst.js
```

## Rate Limits

Two separate rate limiters protect the load-test path:

| Limiter | Scope | Limit | Key |
|---|---|---|---|
| Mint rate limit | Per user | 200 mints / 60s | `mint-lt:{userId}` |
| Edge rate limit | Per workspace | 500 req / 10s | `lt-edge:{workspaceId}` |

These are separate from public endpoint rate limits and sized for the test profiles (30 VUs sustained, 100 VUs burst).

## Metric Interpretation

### What k6 Measures (Client-Observed)

| Metric | Meaning |
|---|---|
| `http_req_duration` | Full HTTP round-trip (DNS + TLS + server + transfer) |
| `http_req_duration{p(50)}` | Median client-observed latency |
| `http_req_duration{p(95)}` | 95th percentile client-observed latency |
| `http_req_duration{p(99)}` | 99th percentile client-observed latency |
| `http_req_failed` | Percentage of non-2xx responses |
| `http_reqs` | Total requests per second achieved |

### What k6 Does NOT Measure

- Database CPU, memory, or lock contention
- Edge function cold start isolation
- Internal service-to-service latency
- Connection pool utilization

### Infrastructure Metrics (Collect Separately)

During any k6 run, operators **must** simultaneously monitor:

1. **DB CPU and memory** — via Cloud dashboard
2. **Active connections** — `SELECT count(*) FROM pg_stat_activity;`
3. **Lock contention** — `SELECT * FROM pg_locks WHERE NOT granted;`
4. **Edge function logs** — invocation latency, cold starts, errors

These are observed from database/platform dashboards, not from inside k6.

## Output

For structured JSON output (for dashboards):

```bash
k6 run --out json=results.json load-tests/ramp.js
```

## Safety Guardrails

- All scripts refuse to start without `K6_TEST_WORKSPACE_ID`
- `setup()` preflight validates fixtures before VUs start
- All idempotency keys are prefixed with `lt-` (enforced server-side for load-test auth)
- All test data uses `[LOAD-TEST]` prefix
- No script modifies production data outside the test workspace
- Mint failure = hard abort (no stale headers ever used)
- Header rotation uses random jitter (45-75s) to prevent mint stampedes

## Cleanup

### Automated: `cleanup-load-test` Edge Function (Recommended)

A dedicated edge function provides deterministic, FK-safe cleanup with guardrails:

- **HMAC cron auth only** (no user JWT path)
- **Explicit `confirm: true`** required in request body
- **Workspace-scoped** via `workspaceId` parameter
- **Prefix-scoped** to known test prefixes (`burst-`, `direct-test`, `lt-`, `st-`)
- Returns per-table deleted row counts for audit

```bash
# Get HMAC headers from database, then call:
curl -X POST "$SUPABASE_URL/functions/v1/cleanup-load-test" \
  -H "Content-Type: application/json" \
  -H "X-Cron-Timestamp: $TIMESTAMP" \
  -H "X-Cron-Token: $TOKEN" \
  -d '{"confirm": true, "workspaceId": "<test-workspace-uuid>"}'

# To also remove fixture workspaces/accounts/items:
# Add "includeFixtures": true to the body
```

### Manual SQL

```sql
DELETE FROM usage_events
WHERE action_id IN (
  SELECT id FROM actions
  WHERE workspace_id = '<test-workspace-id>'
    AND (idempotency_key LIKE 'lt-%' OR idempotency_key LIKE 'burst-%')
);

DELETE FROM actions
WHERE workspace_id = '<test-workspace-id>'
  AND (idempotency_key LIKE 'lt-%' OR idempotency_key LIKE 'burst-%');

DELETE FROM timeline_events
WHERE account_id = '<test-account-id>'
  AND summary LIKE '%[LOAD-TEST]%';
```
