-- Helper function: returns headers JSONB by reading CRON_SECRET from Vault
-- SECURITY DEFINER so it can access vault.decrypted_secrets from cron context
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