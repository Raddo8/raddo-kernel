import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

  if (error) {
    // Fail open: if DB is down, allow the request but log the error
    console.error("[rate-limit] DB check failed, allowing request:", error.message);
    return { allowed: true };
  }

  const result = data as { allowed: boolean; retry_after: number };
  return {
    allowed: result.allowed,
    retryAfter: result.allowed ? undefined : result.retry_after,
  };
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
