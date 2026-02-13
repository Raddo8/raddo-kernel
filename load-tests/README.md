# RADDO Saturation Load Testing

> **WARNING**: These scripts generate real HTTP load against your edge functions and database.
> Running them against a production workspace **will affect real users**.
> Always use a dedicated test workspace.

## Prerequisites

1. [k6](https://k6.io/docs/getting-started/installation/) installed locally or in CI
2. A dedicated test workspace ID (never use production)
3. HMAC cron auth credentials OR a valid user JWT

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `K6_BASE_URL` | Yes | Supabase project URL (e.g., `https://vacpgxxgdfhgvkduljgs.supabase.co`) |
| `K6_ANON_KEY` | Yes | Supabase anon key |
| `K6_TEST_WORKSPACE_ID` | Yes | Dedicated test workspace UUID. Scripts refuse to run without this. |
| `K6_TEST_ACCOUNT_ID` | Yes | Test account UUID within the workspace |
| `K6_TEST_ITEM_ID` | Yes | Test item UUID within the account |
| `K6_AUTH_TOKEN` | Yes | Bearer token (user JWT) for authentication |

## Setup

Before running any script, create test fixtures in your test workspace:

1. Create a workspace with `[LOAD-TEST]` prefix in name
2. Create an account within it
3. Create an item within the account
4. Set the environment variables above

## Scripts

### Phase 1: Controlled Ramp (`ramp.js`)

Determines the safe RPS ceiling by ramping virtual users from 1 to 50.

```bash
k6 run load-tests/ramp.js
```

**Pass criteria**: error rate < 1%, p99 < 3× baseline p99 from first stage.

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
- Hard caps on VUs and duration per script (see source)
- All test data uses `[LOAD-TEST]` prefix
- No script modifies production data outside the test workspace
- Idempotency keys are prefixed with `lt-{runId}-` for easy cleanup

## Cleanup

After runs, clean up test actions:

```sql
DELETE FROM actions
WHERE workspace_id = '<test-workspace-id>'
  AND idempotency_key LIKE 'lt-%';

DELETE FROM timeline_events
WHERE account_id = '<test-account-id>'
  AND summary LIKE '%[LOAD-TEST]%';
```
