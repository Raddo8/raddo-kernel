

# Secure Cron Secret Remediation + Rotation

## Current State

- **2 jobs** (`process-scheduled-actions`, `process-policy-rules`) have the CRON_SECRET **hardcoded** in `cron.job.command` -- treat as compromised
- **1 job** (`cleanup-maintenance-5min`) uses the secure `current_setting()` pattern but it resolves to NULL (401 failures)
- Supabase Vault extension is available

## Approach: Vault + SECURITY DEFINER Helper

Store the secret in Supabase Vault (encrypted at rest), then create a tiny `SECURITY DEFINER` function that reads it and builds the headers JSONB. Cron commands call this function -- no secret ever appears in SQL text.

## Steps

### Step 1: Create Vault secret + helper function (migration)

```sql
-- Store secret in Vault (encrypted at rest via pgsodium)
SELECT vault.create_secret(
  '<new_rotated_secret>',
  'cron_secret',
  'CRON_SECRET for edge function authentication'
);

-- Helper: returns headers JSONB by reading from Vault
CREATE OR REPLACE FUNCTION public.get_cron_headers()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'X-CRON-SECRET', decrypted_secret
  )
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret'
  LIMIT 1;
$$;
```

The `SECURITY DEFINER` allows the function to access `vault.decrypted_secrets` (which requires elevated privileges) while being callable from cron context.

### Step 2: Rotate the CRON_SECRET

Since the old secret is compromised (visible in `cron.job`), generate a new one:

1. Generate a new high-entropy secret (no commas or special chars that could break header parsing)
2. Store it in Vault (Step 1 above)
3. Update the Edge Function environment variable `CRON_SECRET` to the new value using the secrets tool
4. All three edge functions (`process-scheduled-actions`, `process-policy-rules`, `cleanup-maintenance`) already read `CRON_SECRET` from `Deno.env` -- no code changes needed

### Step 3: Reschedule all three cron jobs (via change-data tool, not migration)

Unschedule all three and recreate using the Vault-backed helper:

```sql
-- Remove all existing jobs
SELECT cron.unschedule('process-scheduled-actions');
SELECT cron.unschedule('process-policy-rules');
SELECT cron.unschedule('cleanup-maintenance-5min');

-- Reschedule with secure headers from Vault
SELECT cron.schedule(
  'process-scheduled-actions',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/process-scheduled-actions',
    headers := public.get_cron_headers(),
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'process-policy-rules',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/process-policy-rules',
    headers := public.get_cron_headers(),
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'cleanup-maintenance-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/cleanup-maintenance',
    headers := public.get_cron_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Step 4: Verify

1. Query `cron.job` -- confirm no command contains a literal secret
2. Call `SELECT public.get_cron_headers()` -- confirm it returns valid JSONB with the secret
3. Wait one cron cycle and check edge function logs for all three functions -- expect HTTP 200
4. Confirm `rate_limits` expired rows are cleaned

## Execution Order

1. Generate new secret value
2. Use secrets tool to update `CRON_SECRET` edge function env var
3. Run migration: create Vault secret + `get_cron_headers()` function
4. Run change-data: unschedule + reschedule all three jobs
5. Verify via `cron.job` audit + edge function logs

## Files Changed

| Target | Change |
|--------|--------|
| Migration (SQL) | `vault.create_secret()` + `get_cron_headers()` function |
| Change-data (SQL) | Unschedule 3 jobs, reschedule with `get_cron_headers()` |
| Edge Function secret | Rotate `CRON_SECRET` to new value |
| No code files | Edge functions already read from `Deno.env.get("CRON_SECRET")` |

## Security Properties

- Secret encrypted at rest in Vault (pgsodium)
- Never appears in `cron.job.command`, query logs, or SQL history
- `get_cron_headers()` is `SECURITY DEFINER` so it can read `vault.decrypted_secrets`
- Old compromised secret is fully rotated out
- New secret avoids commas/special characters

