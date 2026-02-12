

# DB-Backed Rate Limiting -- Real Perimeter Protection

## Problem

The in-memory sliding window rate limiter was validated and confirmed ineffective in production: each request lands on a different Deno isolate, so the counter resets every time. This means public endpoints (`get-response`, `submit-response`, `resend-webhook`) have no meaningful abuse protection.

## Solution

Replace the in-memory `Map` with a Postgres-backed atomic counter. No Redis required -- at current volumes, a single row upsert per request is negligible load.

## Database Design

New table: `public.rate_limits`

| Column | Type | Purpose |
|--------|------|---------|
| `key` | `text` PRIMARY KEY | `${endpoint}:${ip}` |
| `window_start` | `timestamptz` NOT NULL | Start of current window |
| `request_count` | `int` NOT NULL DEFAULT 1 | Requests in current window |

**No RLS** -- this table is only accessed by service-role clients in edge functions. No user-facing reads. RLS disabled explicitly to avoid accidental lockout.

**Auto-cleanup**: A database function `clean_expired_rate_limits()` deletes rows older than 5 minutes, callable periodically or lazily.

## Algorithm (single atomic query per request)

```sql
INSERT INTO rate_limits (key, window_start, request_count)
VALUES ($1, now(), 1)
ON CONFLICT (key) DO UPDATE SET
  request_count = CASE
    WHEN rate_limits.window_start + ($2 || ' milliseconds')::interval < now()
    THEN 1                                    -- window expired, reset
    ELSE rate_limits.request_count + 1        -- still in window, increment
  END,
  window_start = CASE
    WHEN rate_limits.window_start + ($2 || ' milliseconds')::interval < now()
    THEN now()                                -- reset window
    ELSE rate_limits.window_start             -- keep current window
  END
RETURNING request_count, window_start;
```

If `request_count > maxRequests`, reject with 429 + `Retry-After`.

This is wrapped in a Postgres function `check_rate_limit(p_key text, p_window_ms int, p_max_requests int)` returning `(allowed boolean, retry_after int)` for clean edge function calls.

## Implementation Steps

### Step 1: Migration -- Create table + DB function

- Create `rate_limits` table with `key` as primary key
- Create `check_rate_limit()` Postgres function that does the atomic upsert + check in one call
- Create `clean_expired_rate_limits()` function for periodic cleanup
- RLS disabled (service-role only access)

### Step 2: Update `_shared/rate-limit.ts`

Replace the in-memory `Map` logic with a Supabase RPC call:

```typescript
export async function checkRateLimitDb(
  supabase: SupabaseClient,
  endpoint: string,
  ip: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `${endpoint}:${ip}`;
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_window_ms: windowMs,
    p_max_requests: maxRequests,
  });
  // Returns { allowed, retry_after }
}
```

Keep `getClientIp()` unchanged -- it's already correct.

### Step 3: Update `get-response/index.ts`

- The supabase client is already created (service-role) -- move it above the rate limit check
- Replace `checkRateLimit(...)` with `await checkRateLimitDb(supabase, ...)`
- Keep the `rateLimitedResponse` helper unchanged

### Step 4: Update `submit-response/index.ts`

- Same pattern: move supabase client creation above rate limit, swap to `checkRateLimitDb`

### Step 5: Update `resend-webhook/index.ts`

- Same pattern, 60 req/min limit preserved

### Step 6: Cleanup -- remove in-memory code

- Remove the `Map`, `WindowEntry`, and old `checkRateLimit` from `rate-limit.ts`
- Keep only `checkRateLimitDb` and `getClientIp`

## Limits (unchanged)

| Endpoint | Limit |
|----------|-------|
| `get-response` | 10/min/IP |
| `submit-response` | 5/min/IP |
| `resend-webhook` | 60/min/IP |

## What This Fixes

- Cross-isolate consistency (all isolates share Postgres)
- Deterministic enforcement (atomic upsert, no race conditions)
- Auditable (rows visible in DB for forensics)
- No external infrastructure (no Redis/Upstash dependency)

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | New `rate_limits` table + `check_rate_limit()` + `clean_expired_rate_limits()` functions |
| `supabase/functions/_shared/rate-limit.ts` | Replace in-memory Map with `checkRateLimitDb()` RPC call |
| `supabase/functions/get-response/index.ts` | Swap to async DB-backed rate check |
| `supabase/functions/submit-response/index.ts` | Swap to async DB-backed rate check |
| `supabase/functions/resend-webhook/index.ts` | Swap to async DB-backed rate check |

No frontend changes.

## Impact

- **Operational Infrastructure**: ~33% to ~40-42% (real perimeter protection, not just code-present)
- **Kernel Integrity**: Unchanged at 90%
- **Open risks unchanged**: Bounce validation, orphan webhooks, concurrency load testing remain open

