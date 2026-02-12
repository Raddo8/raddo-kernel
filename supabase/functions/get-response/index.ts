import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkRateLimitDb, getClientIp } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const clientIp = getClientIp(req.headers);
  const rateCheck = await checkRateLimitDb(supabase, "get-response", clientIp, 10, 60_000);
  if (!rateCheck.allowed) {
    return rateLimitedResponse("get-response", clientIp, rateCheck.retryAfter!);
  }

  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return json({ valid: false, reason_code: "INVALID_TOKEN" }, 400);
    }

    const tokenHash = await hashToken(token);
    const prefix = tokenHash.substring(0, 8);

    const { data: row, error } = await supabase
      .from("action_responses")
      .select("options, item_ref, submitted_at, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error || !row) {
      console.log(JSON.stringify({ event: "response_validated", token_hash_prefix: prefix, valid: false, reason_code: "INVALID_TOKEN", timestamp: new Date().toISOString() }));
      return json({ valid: false, reason_code: "INVALID_TOKEN" });
    }

    if (row.submitted_at) {
      console.log(JSON.stringify({ event: "response_validated", token_hash_prefix: prefix, valid: false, reason_code: "ALREADY_RESPONDED", timestamp: new Date().toISOString() }));
      return json({ valid: false, reason_code: "ALREADY_RESPONDED" });
    }

    if (new Date(row.expires_at) <= new Date()) {
      console.log(JSON.stringify({ event: "response_validated", token_hash_prefix: prefix, valid: false, reason_code: "TOKEN_EXPIRED", timestamp: new Date().toISOString() }));
      return json({ valid: false, reason_code: "TOKEN_EXPIRED" });
    }

    console.log(JSON.stringify({ event: "response_validated", token_hash_prefix: prefix, valid: true, timestamp: new Date().toISOString() }));
    return json({ valid: true, options: row.options, item_ref: row.item_ref });
  } catch (err) {
    console.error("[get-response] Error:", err);
    return json({ valid: false, reason_code: "INVALID_TOKEN" }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
