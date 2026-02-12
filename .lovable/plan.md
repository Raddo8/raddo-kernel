

# Verify Cleanup RPC + Add Rate Limits Cleanup Cron

Two small infra hygiene tasks to complete the rate limiting hardening.

## Task 1: Verify `clean_expired_rate_limits()` Works

The function exists but hasn't been tested in production. There is currently 1 expired row in `rate_limits` ready to be cleaned.

**Approach**: Call the RPC directly from the client or via a quick service-role invocation. Since the function uses `LANGUAGE sql` (not security definer), it needs to be called with appropriate permissions. The simplest verification is to invoke it via the Supabase client using `.rpc('clean_expired_rate_limits')`.

However, since `rate_limits` has no RLS policies for DELETE and the function runs as the caller, we need to either:
- Call it with service role (from an edge function), or
- Add it to the cleanup cron (which uses service role anyway)

**Decision**: Fold the verification into Task 2 — the cron edge function will call it with service role, and we verify via logs.

## Task 2: Add Cleanup Cron for Rate Limits

Create a lightweight edge function `cleanup-maintenance` that calls `clean_expired_rate_limits()` and returns the count of deleted rows. Then schedule it via `pg_cron` + `pg_net`.

### New file: `supabase/functions/cleanup-maintenance/index.ts`

Follows the exact pattern from `process-scheduled-actions`:
- Authenticates via `X-CRON-SECRET` header (no JWT)
- Creates a service-role Supabase client
- Calls `clean_expired_rate_limits()` RPC
- Returns `{ success: true, deleted: N }`

### Config update: `supabase/config.toml`

Add:
```toml
[functions.cleanup-maintenance]
verify_jwt = false
```

### Cron job (via SQL insert, not migration)

Schedule every 5 minutes using `pg_cron` + `pg_net`:
```sql
SELECT cron.schedule(
  'cleanup-maintenance-5min',
  '*/5 * * * *',
  $$ SELECT net.http_post(
    url := '<FUNCTION_URL>/cleanup-maintenance',
    headers := '{"Content-Type":"application/json","X-CRON-SECRET":"<secret>"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id; $$
);
```

### Verification

After deployment:
1. Call the edge function directly to confirm it returns `{ success: true, deleted: N }`
2. Check logs to confirm the RPC executed
3. Query `rate_limits` to confirm expired rows were removed
4. Wait for cron to fire and verify via edge function logs

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/cleanup-maintenance/index.ts` | New -- lightweight cron target |
| `supabase/config.toml` | Add `verify_jwt = false` for cleanup-maintenance |
| SQL (via insert tool) | `cron.schedule` for 5-minute cleanup cycle |

## Technical Notes

- The edge function is intentionally minimal -- it does one thing and logs the result
- Using the same `X-CRON-SECRET` pattern as all other scheduled functions
- The `clean_expired_rate_limits()` function already handles the 5-minute expiry window
- No frontend changes needed
