
-- Table for DB-backed rate limiting (no RLS -- service-role only)
CREATE TABLE public.rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count int NOT NULL DEFAULT 1
);

-- Explicitly disable RLS
ALTER TABLE public.rate_limits DISABLE ROW LEVEL SECURITY;

-- Atomic check-and-increment function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_window_ms int,
  p_max_requests int
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
  v_window_start timestamptz;
  v_interval interval;
  v_retry_after int;
BEGIN
  v_interval := (p_window_ms || ' milliseconds')::interval;

  INSERT INTO rate_limits (key, window_start, request_count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    request_count = CASE
      WHEN rate_limits.window_start + v_interval < now()
      THEN 1
      ELSE rate_limits.request_count + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start + v_interval < now()
      THEN now()
      ELSE rate_limits.window_start
    END
  RETURNING request_count, window_start INTO v_count, v_window_start;

  IF v_count > p_max_requests THEN
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_window_start + v_interval - now()))));
    RETURN jsonb_build_object('allowed', false, 'retry_after', v_retry_after);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'retry_after', 0);
END;
$$;

-- Cleanup function for old entries
CREATE OR REPLACE FUNCTION public.clean_expired_rate_limits()
RETURNS int
LANGUAGE sql
SET search_path TO 'public'
AS $$
  WITH deleted AS (
    DELETE FROM rate_limits
    WHERE window_start < now() - interval '5 minutes'
    RETURNING 1
  )
  SELECT count(*)::int FROM deleted;
$$;
