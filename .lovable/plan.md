

# Isolated Load-Test Auth: Corrected Rate Limits, CORS, Workspace Enforcement, Environment Guard

## Summary

Create a fully compartmentalized load-test authentication system with a mint endpoint that returns short-lived HMAC headers. All five issues from the rejection are addressed: rate limit keying, edge rate limiter sizing, CORS header consistency, explicit workspace enforcement, and environment-guard flag.

## 1. Database Migration

### New signing key (separate from production cron)

```sql
INSERT INTO internal_keys (name, key_value)
VALUES ('load_test_auth', extensions.gen_random_bytes(32))
ON CONFLICT DO NOTHING;
```

### New RPC: `get_load_test_headers()`

SECURITY DEFINER, owner postgres, `SET search_path = 'public'`. REVOKE ALL then GRANT to service_role only. Reads `load_test_auth` key, computes HMAC-SHA256 of current epoch timestamp, returns:

```json
{
  "X-LoadTest-Timestamp": "<epoch>",
  "X-LoadTest-Token": "<hmac-hex>",
  "expiresAt": <epoch + 120>
}
```

### New RPC: `verify_load_test_token(p_timestamp, p_token)`

Same hardening. Reads `load_test_auth` key, enforces 120-second replay window, recomputes HMAC, returns boolean. GRANT to service_role only.

## 2. New Secrets

| Secret | Purpose |
|--------|---------|
| `LOAD_TEST_SECRET` | Authorization gate for mint endpoint (not the signing key) |
| `LOAD_TEST_AUTH_ENABLED` | Must be `"true"` to enable the entire load-test auth path. Defaults to disabled. |

## 3. New Edge Function: `mint-load-test-headers/index.ts`

**Config: `verify_jwt = true`** -- platform enforces JWT before code runs.

Authorization gates (all must pass):
1. Platform-verified JWT (automatic via `verify_jwt = true`)
2. `LOAD_TEST_AUTH_ENABLED` env var must equal `"true"` -- hard 403 otherwise
3. `X-LoadTest-Secret` header must match `LOAD_TEST_SECRET` env var
4. Caller's user ID (from JWT via `getUser()`) must be in a hardcoded allowlist constant
5. Rate limit: **max 200 mints per 60 seconds per user** (keyed by `mint-lt:{userId}`)
   - With 100 VUs (burst) each minting every 45s worst-case, that is ~133 mints/minute from one user -- 200 gives headroom without being unlimited
   - Uses existing `check_rate_limit` RPC

Behavior:
- Creates service-role client to call `get_load_test_headers()` RPC
- Returns `{ "X-LoadTest-Timestamp": "...", "X-LoadTest-Token": "...", "expiresAt": <epoch> }`
- Returns 429 with `Retry-After` if rate limit exceeded

## 4. Modified: `execute-action-server/index.ts`

### New auth path (third branch in `authenticate()`)

```text
1. X-Cron-Timestamp + X-Cron-Token          --> verify_cron_token()      --> scheduler mode
2. X-LoadTest-Timestamp + X-LoadTest-Token   --> verify_load_test_token() --> load-test mode
3. Authorization: Bearer <jwt>               --> getUser()                --> ui mode
```

### Load-test auth path enforcements

All five guards:

| Guard | Rule |
|-------|------|
| Environment gate | `LOAD_TEST_AUTH_ENABLED` must equal `"true"`, else 403 |
| Mode restriction | Only `mode: "create"` allowed, else 403 |
| Explicit workspace | `params.workspaceId` REQUIRED in request body; must match workspace resolved from `params.itemId`; reject with 400 if missing or mismatched |
| Idempotency prefix | `params.idempotencyKey` must start with `lt-`, else 400 |
| Edge rate limiter | **500 requests per 10 seconds per workspace** via `check_rate_limit` keyed by `lt-edge:{workspace_id}` -- accommodates burst profile (100 VUs) while preventing runaway; separate from public endpoint rate limits |

Sets `source: "load-test"`, `userId: null`, uses service-role client.

### Rate limiter sizing rationale

- **Mint**: 200/min per user. Worst case = 100 burst VUs, each minting every 45s = ~133/min. 200 gives 50% headroom.
- **Edge**: 500/10s per workspace. Worst case = 100 burst VUs hitting ~10 req/s each = ~100/s = ~1000/10s. 500/10s is a hard ceiling that allows sustained (30 VUs at ~15 rps = ~150/10s) and most of burst, while preventing a truly misconfigured run from overwhelming the database. If burst needs more, operator increases the constant.

### CORS headers update

Add to the existing `Access-Control-Allow-Headers` string:

```
x-loadtest-timestamp, x-loadtest-token, x-loadtest-secret
```

HTTP headers are case-insensitive per RFC 7230. The allowlist uses lowercase (matching the convention already used for `x-cron-timestamp`). The actual headers sent by k6 can use any casing.

## 5. k6 Script Changes (all three: sustained.js, ramp.js, burst.js)

### Environment variables

| Variable | Purpose |
|----------|---------|
| `K6_BASE_URL` | Backend URL |
| `K6_ANON_KEY` | apikey header |
| `K6_AUTH_TOKEN` | User JWT -- used ONLY for minting |
| `K6_LOADTEST_SECRET` | Gate secret for mint endpoint |
| `K6_TEST_WORKSPACE_ID` | Safety guard + explicit workspace param |
| `K6_TEST_ITEM_ID` | Test fixture item |

### Mint function

```text
function mintHeaders() {
  const res = http.post(
    `${BASE_URL}/functions/v1/mint-load-test-headers`,
    JSON.stringify({}),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
        apikey: ANON_KEY,
        "X-LoadTest-Secret": LOADTEST_SECRET,
      },
    }
  );
  if (res.status !== 200) {
    fail(`Mint FAILED: status=${res.status} body=${res.body}`);
  }
  const body = JSON.parse(res.body);
  return {
    ts: body["X-LoadTest-Timestamp"],
    token: body["X-LoadTest-Token"],
    expiresAt: body.expiresAt,
    mintedAt: Date.now(),
  };
}
```

### Header rotation with jitter

```text
let cached = null;
const JITTER_MIN = 45000;
const JITTER_MAX = 75000;
let refreshInterval = JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);

function getHeaders() {
  const now = Date.now();
  if (!cached || now - cached.mintedAt > refreshInterval) {
    cached = mintHeaders();  // hard aborts on failure via fail()
    refreshInterval = JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);
  }
  return {
    "Content-Type": "application/json",
    "X-LoadTest-Timestamp": cached.ts,
    "X-LoadTest-Token": cached.token,
    apikey: ANON_KEY,
  };
}
```

### Request body includes explicit workspaceId

```text
params: {
  itemId: ITEM_ID,
  workspaceId: WORKSPACE_ID,   // <-- required, verified server-side
  type: "send_notice",
  channel: "email",
  idempotencyKey: `lt-${RUN_ID}-${__VU}-${__ITER}`,
  ...
}
```

### Preflight in `setup()`

Uses load-test HMAC (same auth mode as the test):

1. Mint headers (validates JWT -> mint -> HMAC chain)
2. Validate workspace exists: `GET /rest/v1/workspaces?id=eq.{id}&select=id` with user JWT -- verify 1 row
3. Validate item exists and belongs to workspace: `GET /rest/v1/items?id=eq.{id}&select=id,workspace_id` with user JWT -- verify `workspace_id` matches `K6_TEST_WORKSPACE_ID`
4. Send one `mode: "create"` request to `execute-action-server` with minted HMAC headers and explicit `workspaceId` -- verify status 200, `success: true`
5. If any step fails: `fail()` with descriptive message, entire run aborts

Steps 2-3 use JWT because they read fixture data via REST (RLS-gated). Step 4 uses load-test HMAC because it validates the actual auth path. This separation is intentional: fixture validation reads data (needs RLS context), load requests create actions (needs load-test auth).

### Remove unsupported k6 options

- `ramp.js`: remove `maxVUs: 50` (line 59) and `maxDuration: "5m"` (line 60)
- `burst.js`: remove `maxVUs: 100` (line 47) and `maxDuration: "2m"` (line 48)
- `sustained.js`: already clean

## 6. Documentation Updates

### `load-tests/README.md`

- Replace `K6_AUTH_TOKEN` description: "User JWT -- used only for minting, never sent with load requests"
- Add `K6_LOADTEST_SECRET`
- Document mint-headers flow, jitter rotation, preflight behavior
- Document that `LOAD_TEST_AUTH_ENABLED` must be set to `"true"` in backend secrets

### `docs/HANDOFF.md`

Record Attempt #3:

| Metric | Value |
|--------|-------|
| Duration | 16m00.4s |
| Total requests | 15,012 |
| RPS | ~15.63 req/s |
| Error rate | 4.94% (742/15012) -- FAIL |
| p50 latency | 1.25s |
| p95 latency | 4.83s -- FAIL |
| p99 latency | 7.75s -- FAIL |
| Max latency | 29.48s |

Failure classification: 404 (fixture), 403 (membership), 401 (JWT expired mid-run), some 500/502. Not an authoritative capacity signal. Cannot be used as capacity evidence. Only a clean run with stable auth and valid fixtures counts.

Update Key Caveat to reflect isolated load-test HMAC auth strategy.

## Files Changed

| File | Action |
|------|--------|
| SQL migration | Create `load_test_auth` key + 2 RPCs |
| `LOAD_TEST_SECRET` | New secret |
| `LOAD_TEST_AUTH_ENABLED` | New secret (set to `"true"`) |
| `supabase/functions/mint-load-test-headers/index.ts` | Create (verify_jwt = true) |
| `supabase/config.toml` | Add `[functions.mint-load-test-headers]` with `verify_jwt = true` |
| `supabase/functions/execute-action-server/index.ts` | Add load-test auth path with all 5 guards |
| `load-tests/sustained.js` | Mint + preflight + jitter + explicit workspaceId |
| `load-tests/ramp.js` | Same + remove maxVUs/maxDuration |
| `load-tests/burst.js` | Same + remove maxVUs/maxDuration |
| `load-tests/README.md` | Update env vars + document mint flow |
| `docs/HANDOFF.md` | Record Attempt #3 + update Key Caveat |

