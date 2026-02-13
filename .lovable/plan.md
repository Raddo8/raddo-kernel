

# Fix rate_limits RLS and Enable Leaked Password Protection

## Step 1: Enable RLS on rate_limits table

Add a database migration that:
- Enables Row Level Security on `public.rate_limits`
- Creates a single `service_role_only` policy for ALL operations
- Uses `auth.role() = 'service_role'` as both USING and WITH CHECK conditions
- Idempotent creation via `pg_policies` existence check

This preserves the current access model (only edge functions using the service-role key can read/write rate limits) while resolving the linter finding.

```sql
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rate_limits'
      AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only
    ON public.rate_limits
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
```

No code changes required -- the `check_rate_limit` RPC is called via service-role clients in edge functions, which bypass RLS by default. The policy is a safety net for direct PostgREST access.

## Step 2: Enable leaked password protection

Use the configure-auth tool to enable HIBP-style leaked password checking. This only affects new signups and password changes going forward; existing users are unaffected.

## Impact

- Zero application behavior change
- Resolves two remaining security linter findings
- No edge function redeployment needed

