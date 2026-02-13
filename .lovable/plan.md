

# Remove CRON_SECRET and Finalize Security Cleanup

## Verification Summary (Completed)

All three cron-fired edge functions are returning HTTP 200 consistently with HMAC auth. The `internal_keys` table is confirmed inaccessible via PostgREST (RLS enabled, zero policies). No security regressions detected.

## Remaining Work

### 1. Remove CRON_SECRET environment variable

The `CRON_SECRET` secret is still configured but no longer referenced by any edge function. It should be removed to eliminate the orphaned credential.

- Use the secrets management tool to delete the `CRON_SECRET` secret

### 2. Confirm no code references remain

Verify that no edge function or shared code still imports or references `CRON_SECRET` or `X-CRON-SECRET`. Based on the changes already deployed, all four functions now use the HMAC path exclusively.

### 3. Linter findings (context, not action items)

- **RLS Enabled No Policy on `internal_keys`**: This is intentional -- zero policies means zero PostgREST access. No fix needed.
- **RLS Disabled on `rate_limits`**: Pre-existing, not related to this change. Only accessed by service-role clients.
- **Leaked Password Protection Disabled**: Auth configuration setting, unrelated to cron security.

## Technical Details

No code changes required. The only action is deleting the `CRON_SECRET` environment variable via the secrets tool.

