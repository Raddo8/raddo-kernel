

# Public Endpoint Rate Limiting -- Perimeter Protection (Revised)

## Why This Is Priority #1

Three edge functions accept anonymous requests with no authentication beyond token entropy:
- `get-response` -- token lookup (read-only, but enables enumeration)
- `submit-response` -- token submission (writes to DB, triggers timeline)
- `resend-webhook` -- already HMAC-signed, but still publicly reachable

Without rate limiting, an attacker can brute-force tokens, flood writes, or burn compute.

## Approach: In-Memory Sliding Window per Endpoint+IP

Edge Functions on Deno Deploy are stateless across cold starts, but within a warm instance, an in-memory `Map` provides effective burst protection.

### Design

- **Shared module**: `supabase/functions/_shared/rate-limit.ts`
- **Algorithm**: Sliding window counter keyed by `${endpoint}:${ip}`
- **Limits**:
  - `get-response`: 10 requests per minute per IP
  - `submit-response`: 5 requests per minute per IP
  - `resend-webhook`: 60 requests per minute per IP
- **Response on exceed**: HTTP 429 with `Retry-After` header, CORS headers, structured JSON
- **Eviction**: Stale entries pruned on each check to prevent memory leak

### Limitations (Documented)

- Resets on cold start (acceptable -- infrequent under load)
- Per-instance only (no cross-instance coordination)
- IP-based (raises the bar, not a WAF replacement)

## Fixes Applied (from review)

### Fix 1: Namespace rate-limit key by endpoint

`checkRateLimit` accepts an `endpoint` parameter. Internal map key becomes `${endpoint}:${ip}`. Each function's counter is fully independent.

### Fix 2: Real Retry-After header on 429

All 429 responses include `Retry-After: <seconds>` alongside CORS and Content-Type headers. A dedicated `rateLimitResponse` helper ensures consistency.

### Fix 3: IP extraction precedence (spoofing reduction)

Order: `cf-connecting-ip` (platform-trusted) first, then `x-forwarded-for` first segment, then `"unknown"`. The `"unknown"` fallback is safe because the key is `${endpoint}:unknown`, not a global shared bucket.

### Fix 4: Structured logging -- no persistence claims

Rate limit log emits only: `event`, `endpoint`, `ip`, `retry_after_seconds`, `timestamp`. No language implying DB writes occurred.

## Implementation

### Step 1: Create `supabase/functions/_shared/rate-limit.ts`

```typescript
interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();

export function checkRateLimit(
  endpoint: string,
  ip: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  const key = `${endpoint}:${ip}`;

  // Prune stale entries when map grows large
  if (windows.size > 10000) {
    for (const [k, entry] of windows) {
      entry.timestamps = entry.timestamps.filter(t => t > cutoff);
      if (entry.timestamps.length === 0) windows.delete(k);
    }
  }

  let entry = windows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter(t => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

export function getClientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip")
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}
```

### Step 2: Rate limit response helper (used in each function)

Each endpoint includes this inline helper (or inlined directly):

```typescript
function rateLimitedResponse(endpoint: string, ip: string, retryAfter: number) {
  console.log(JSON.stringify({
    event: "rate_limited",
    endpoint,
    ip,
    retry_after_seconds: retryAfter,
    timestamp: new Date().toISOString(),
  }));
  return new Response(
    JSON.stringify({ valid: false, reason_code: "RATE_LIMITED" }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    }
  );
}
```

### Step 3: Integrate into `get-response/index.ts`

After the OPTIONS check, before any logic:

```typescript
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";

const clientIp = getClientIp(req.headers);
const rateCheck = checkRateLimit("get-response", clientIp, 10, 60_000);
if (!rateCheck.allowed) {
  return rateLimitedResponse("get-response", clientIp, rateCheck.retryAfter!);
}
```

### Step 4: Integrate into `submit-response/index.ts`

Same pattern, stricter limit:

```typescript
const rateCheck = checkRateLimit("submit-response", clientIp, 5, 60_000);
```

### Step 5: Integrate into `resend-webhook/index.ts`

Higher limit for provider bursts (placed after method check, before signature verification):

```typescript
const rateCheck = checkRateLimit("resend-webhook", clientIp, 60, 60_000);
if (!rateCheck.allowed) {
  // Returns 429 with Retry-After (no CORS needed -- server-to-server)
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(rateCheck.retryAfter),
    },
  });
}
```

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/_shared/rate-limit.ts` | New -- shared sliding window module with endpoint-namespaced keys and trusted IP extraction |
| `supabase/functions/get-response/index.ts` | Add rate limit check (10/min/IP), 429 with Retry-After |
| `supabase/functions/submit-response/index.ts` | Add rate limit check (5/min/IP), 429 with Retry-After |
| `supabase/functions/resend-webhook/index.ts` | Add rate limit check (60/min/IP), 429 with Retry-After |

No database migrations. No frontend changes.

## Impact

- **Operational Infrastructure**: ~25% to ~33-35%
- **Kernel Integrity**: Unchanged at 90%
- **Open risks unchanged**: Bounce validation, orphan webhooks, concurrency load testing remain open

