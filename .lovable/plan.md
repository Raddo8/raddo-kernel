

# Load Test Hardening -- Final Revised Plan

## Overview

Five changes to eliminate false signals, then validate at 20 VUs. All prior review feedback is incorporated with the specific corrections below.

---

## Change 1: Workspace-scoped item lookup in execute-action-server (Option A)

**File:** `supabase/functions/execute-action-server/index.ts`

**Current behavior (lines 150-169):** Queries `items` by `id` only, then has an LT-mode mismatch branch at line 165 that compares `params.workspaceId !== workspaceId`.

**Problem identified in review:** If the query is workspace-scoped, the mismatch branch is unreachable in LT mode. Keeping both is internally inconsistent. Option A: require `requestWorkspaceId` in LT mode, always scope the query, and delete the LT-MISMATCH branch.

**Implementation:**

1. **Add LT-GUARD log at lines 316-320** (inside the existing `if (authResult.mode === "load-test")` block, which only fires for LT mode, before any DB calls):

```typescript
if (authResult.mode === "load-test") {
  if (!params.workspaceId) {
    console.error(
      `[execute-action-server] LT-GUARD: idempotencyKey=${params.idempotencyKey || "none"} reason=missing_workspaceId`
    );
    return jsonError("workspaceId is required for load-test auth", 400);
  }
  // ... existing idempotency and rate limit guards unchanged
}
```

2. **Replace lines 150-169** in `handleCreate` with:

```typescript
const requestWorkspaceId = params.workspaceId as string | undefined;

let itemQuery = supabase
  .from("items")
  .select("account_id, workspace_id")
  .eq("id", itemId as string);

// LT mode: scope query by workspace so 404 = definitive "wrong ID or wrong workspace"
if (authResult.mode === "load-test") {
  // requestWorkspaceId is guaranteed non-null here (LT-GUARD fires earlier)
  itemQuery = itemQuery.eq("workspace_id", requestWorkspaceId!);
}

const { data: item, error: itemErr } = await itemQuery.maybeSingle();

// Branch 1: DB-level error (timeout, connection drop)
if (itemErr) {
  if (authResult.mode === "load-test") {
    console.error(
      `[execute-action-server] LT-DB-ERROR: itemId=${itemId} workspaceId=${requestWorkspaceId} ` +
      `idempotencyKey=${params.idempotencyKey || "none"} reason=db_error err=${itemErr.message}`
    );
  }
  return jsonError("Item lookup failed", 500);
}

// Branch 2: 0 rows returned
if (!item) {
  if (authResult.mode === "load-test") {
    console.error(
      `[execute-action-server] LT-404: itemId=${itemId} workspaceId=${requestWorkspaceId} ` +
      `idempotencyKey=${params.idempotencyKey || "none"} reason=item_not_found`
    );
  }
  return jsonError("Item not found", 404);
}

const workspaceId = item.workspace_id;
const accountId = item.account_id;
```

**No LT-MISMATCH branch.** In LT mode the query is workspace-scoped, so a mismatch produces a 404 with reason `item_not_found`. The existing non-LT mismatch path (for UI/scheduler) is not needed either since UI uses RLS and scheduler uses service role with server-derived workspace.

**Select fields:** Only `account_id` and `workspace_id` are used downstream in `handleCreate`:
- `workspace_id` -- for billing check, rate limit, action insert, and timeline
- `account_id` -- for `writeTimeline` call at line 272

The previous select included `id` which was unused (itemId comes from params). Removing it.

---

## Change 2: Placeholder ID guard in all k6 scripts

**Files:** `load-tests/ramp.js` (after line 40), `load-tests/sustained.js` (after line 40), `load-tests/burst.js` (after line 40)

```javascript
function looksLikePlaceholder(v) {
  return !v || v.includes("<") || v.includes(">") || v.startsWith("your-");
}
if (looksLikePlaceholder(WORKSPACE_ID) || looksLikePlaceholder(ITEM_ID)) {
  fail(
    "K6_TEST_WORKSPACE_ID or K6_TEST_ITEM_ID contains a placeholder value. " +
    "Set real UUIDs. See load-tests/README.md."
  );
}
```

---

## Change 3: Token freshness -- 60s expiry margin, 20-40s jitter

**Files:** All three k6 scripts -- replace `getHeaders()` and jitter constants.

```javascript
let cached = null;
const JITTER_MIN = 20000;
const JITTER_MAX = 40000;
let refreshInterval = JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);

function getHeaders() {
  const now = Date.now();
  const expiredByTime = now - (cached?.mintedAt || 0) > refreshInterval;
  const expiredByToken = cached && (now / 1000) > (cached.expiresAt - 60);

  if (!cached || expiredByTime || expiredByToken) {
    cached = mintHeaders();
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

---

## Change 4: Mint resilience -- jittered retries, graceful degradation

### k6 side: `mintHeaders()` with retries (all three scripts)

Add `import { sleep } from "k6";` to each script.

**In `setup()` (preflight):** mint failures call `fail()` -- this is correct since preflight must hard-abort.

**In the VU loop (`default function`):** `mintHeaders()` failures must NOT call `fail()`. Instead, `getHeaders()` must catch the failure, record an error metric, and skip the iteration.

Implementation: split mint into two behaviors:

```javascript
import { sleep } from "k6";

function mintHeadersRaw() {
  const backoffs = [0.25, 0.75, 1.5];
  let lastRes;

  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    if (attempt > 0) {
      const jitter = 0.8 + Math.random() * 0.4;
      sleep(backoffs[attempt - 1] * jitter);
    }
    lastRes = http.post(
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
    if (lastRes.status === 200) {
      const body = JSON.parse(lastRes.body);
      return {
        ts: body["X-LoadTest-Timestamp"],
        token: body["X-LoadTest-Token"],
        expiresAt: body.expiresAt,
        mintedAt: Date.now(),
      };
    }
    console.warn(
      `[mint] Attempt ${attempt + 1} failed: status=${lastRes.status} body=${(lastRes.body || "").substring(0, 200)}`
    );
  }
  return null; // all retries exhausted
}

// Used in setup() -- hard abort on failure
function mintHeadersOrFail() {
  const result = mintHeadersRaw();
  if (!result) {
    fail("Mint FAILED after 4 attempts in preflight");
  }
  return result;
}
```

Update `getHeaders()` to handle null gracefully:

```javascript
function getHeaders() {
  const now = Date.now();
  const expiredByTime = now - (cached?.mintedAt || 0) > refreshInterval;
  const expiredByToken = cached && (now / 1000) > (cached.expiresAt - 60);

  if (!cached || expiredByTime || expiredByToken) {
    const minted = mintHeadersRaw();
    if (!minted) {
      // Return null to signal caller to skip iteration
      return null;
    }
    cached = minted;
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

Update `default function()` in all scripts:

```javascript
export default function () {
  const headers = getHeaders();
  if (!headers) {
    errorRate.add(true);
    console.warn(`[SKIP] VU=${__VU} ITER=${__ITER} reason=mint_exhausted`);
    return; // skip this iteration gracefully
  }
  // ... rest of iteration unchanged
}
```

Update `setup()` to use `mintHeadersOrFail()` instead of `mintHeaders()`.

### Server side: mint-load-test-headers 503 distinction

**File:** `supabase/functions/mint-load-test-headers/index.ts` (lines 71-94)

Replace the rate-limit RPC handling:

```typescript
const { data: rateResult, error: rateErr } = await serviceClient.rpc("check_rate_limit", {
  p_key: `mint-lt:${user.id}`,
  p_max_requests: 200,
  p_window_ms: 60000,
});

if (rateErr || rateResult === null || rateResult === undefined) {
  console.error("[mint-load-test-headers] Rate limit RPC unavailable:", rateErr?.message || "null result");
  return new Response(
    JSON.stringify({ success: false, error: "rate_limit_unavailable" }),
    {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "5" },
    }
  );
}

if (!rateResult.allowed) {
  return new Response(
    JSON.stringify({ success: false, error: "Rate limit exceeded" }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(rateResult.retry_after || 10),
      },
    }
  );
}
```

---

## Change 5: Configurable sustained VU count

**File:** `load-tests/sustained.js` (lines 44-54)

```javascript
const SUSTAINED_VUS = parseInt(__ENV.K6_SUSTAINED_VUS || "30", 10);

export const options = {
  stages: [
    { duration: "30s", target: SUSTAINED_VUS },
    { duration: "15m", target: SUSTAINED_VUS },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    error_rate: [{ threshold: "rate<0.01", abortOnFail: false }],
    http_req_duration: ["p(95)<3000", "p(99)<5000"],
  },
};
```

---

## maxDuration verification

Searched all three k6 scripts for `maxDuration` -- no matches found. The warning observed earlier was from the CLI override (`-u 1 -i 1`) conflicting with the `stages` executor, which is a k6 runtime behavior, not an exported field issue. No code change needed.

---

## Not included (deferred)

**Database index:** Deferred until clean sustained run + edge function log analysis identifies the actual slow query shape.

---

## Summary of file changes

| File | Change |
|------|--------|
| `supabase/functions/execute-action-server/index.ts` | LT-GUARD log at line 318; workspace-scoped item query in LT mode (Option A); split `itemErr` vs `!item` with structured logs; delete LT-MISMATCH branch; select only `account_id, workspace_id` |
| `supabase/functions/mint-load-test-headers/index.ts` | 503 with `rate_limit_unavailable` on RPC failure/null |
| `load-tests/ramp.js` | Placeholder guard; 60s expiry margin; 20-40s jitter; jittered mint retries; graceful degradation (no `fail()` in VU loop) |
| `load-tests/sustained.js` | Same k6 changes + configurable VU count via `K6_SUSTAINED_VUS` |
| `load-tests/burst.js` | Same k6 changes |

## After implementation

```bash
K6_SUSTAINED_VUS=20 k6 run load-tests/sustained.js
```

Then review edge function logs for `LT-404`, `LT-DB-ERROR`, or `LT-GUARD` entries.

