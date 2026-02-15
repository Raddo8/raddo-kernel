

# Bypass Edge Rate Limiter for Load-Test Mode

## What and Why

The `execute-action-server` edge function has a rate limiter block (lines 355-368) that caps load-test requests to 500 per 10 seconds per workspace. At 60 VUs producing ~118 RPS (~1,180 per 10s), this rejects ~58% of requests -- matching the observed 57.97% error rate exactly.

This limiter only fires for `authResult.mode === "load-test"`. Production traffic is unaffected. The fix is to remove (or gate) this check so load tests can measure actual system capacity (DB pool, function concurrency, etc.) rather than hitting a synthetic ceiling.

## Change

### File: `supabase/functions/execute-action-server/index.ts`

**Lines 353-369:** Comment out (or remove) the entire edge rate limiter block inside the load-test guard section.

Before:
```
// Guard: edge rate limiter (500 req / 10s per workspace)
const { data: edgeRate } = await supabase.rpc("check_rate_limit", {
  p_key: `lt-edge:${params.workspaceId}`,
  p_max_requests: 500,
  p_window_ms: 10000,
});
if (edgeRate && !edgeRate.allowed) {
  return new Response(
    JSON.stringify({ success: false, error: "Load test rate limit exceeded" }),
    {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(edgeRate.retry_after || 5) },
    }
  );
}
```

After:
```
// Edge rate limiter bypassed for load-test mode to allow
// capacity testing to measure real system ceilings (DB pool,
// function concurrency) rather than a synthetic gate.
// Production traffic never enters this code path.
// To re-enable: uncomment the check_rate_limit RPC block below.
//
// const { data: edgeRate } = await supabase.rpc("check_rate_limit", {
//   p_key: `lt-edge:${params.workspaceId}`,
//   p_max_requests: 500,
//   p_window_ms: 10000,
// });
// if (edgeRate && !edgeRate.allowed) { ... }
```

## Risk Assessment

- **Production safety:** Zero impact. This code block is inside an `if (authResult.mode === "load-test")` branch that production requests never enter.
- **Runaway load tests:** Load-test auth is already gated by HMAC secret + operator allowlist + `lt-` idempotency prefix. The `cleanup-load-test` function can purge artifacts.
- **Reversibility:** The commented-out code can be restored in seconds, or replaced with a higher limit (e.g., 5000/10s) after we find the real ceiling.

## Validation

After deploying, run a short triage (2-3 minutes, not full 16 minutes):

```
K6_FAIL_LOG_LIMIT=1 K6_SUSTAINED_VUS=60 k6 run "$(pwd)/load-tests/sustained.js"
```

Abort after 2-3 minutes and check:
- ATTEMPT CLASSIFICATION block
- Failure breakdown (401/429/5xx/other)
- First sampled [FAIL] lines

If 429s drop to near zero, the next dominant failure mode (if any) reveals the real system ceiling.

