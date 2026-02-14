
-- 1. Insert a separate signing key for load-test auth (isolated from cron_auth)
INSERT INTO internal_keys (name, key_value)
VALUES ('load_test_auth', extensions.gen_random_bytes(32))
ON CONFLICT DO NOTHING;

-- 2. RPC: get_load_test_headers() — returns short-lived HMAC headers
CREATE OR REPLACE FUNCTION public.get_load_test_headers()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ts text;
  signing_key bytea;
  token text;
  expires_at bigint;
BEGIN
  ts := extract(epoch from now())::bigint::text;
  expires_at := extract(epoch from now())::bigint + 120;

  SELECT key_value INTO signing_key
    FROM internal_keys WHERE name = 'load_test_auth';

  IF signing_key IS NULL THEN
    RAISE EXCEPTION 'load_test_auth key not found';
  END IF;

  token := encode(
    extensions.hmac(ts::bytea, signing_key, 'sha256'),
    'hex'
  );

  RETURN jsonb_build_object(
    'X-LoadTest-Timestamp', ts,
    'X-LoadTest-Token', token,
    'expiresAt', expires_at
  );
END;
$$;

ALTER FUNCTION public.get_load_test_headers() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_load_test_headers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_load_test_headers() FROM anon;
REVOKE ALL ON FUNCTION public.get_load_test_headers() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_load_test_headers() TO service_role;

-- 3. RPC: verify_load_test_token() — validates HMAC with 120s replay window
CREATE OR REPLACE FUNCTION public.verify_load_test_token(p_timestamp text, p_token text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  signing_key bytea;
  expected text;
BEGIN
  -- Enforce 120-second replay window
  IF abs(extract(epoch from now()) - p_timestamp::bigint) > 120 THEN
    RETURN false;
  END IF;

  SELECT key_value INTO signing_key
    FROM internal_keys WHERE name = 'load_test_auth';

  IF signing_key IS NULL THEN RETURN false; END IF;

  expected := encode(
    extensions.hmac(p_timestamp::bytea, signing_key, 'sha256'),
    'hex'
  );

  RETURN expected = p_token;
END;
$$;

ALTER FUNCTION public.verify_load_test_token(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_load_test_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_load_test_token(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.verify_load_test_token(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_load_test_token(text, text) TO service_role;
