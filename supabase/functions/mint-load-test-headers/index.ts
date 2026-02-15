import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-loadtest-secret, x-loadtest-operator, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Hardcoded allowlist of user IDs permitted to mint load-test headers ──
// Add operator user IDs here. Empty array = nobody can mint.
const ALLOWED_USER_IDS: string[] = [
  "760b2da9-f507-47f1-9dd3-e205446bd3da",  // jdb1203@gmail.com - load-test operator
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Gate 1: Environment guard ──
    // Set to false to disable load-test minting entirely
    const LOAD_TEST_ENABLED = true;
    if (!LOAD_TEST_ENABLED) {
      return jsonError("Load test auth is not enabled", 403);
    }

    // ── Gate 2: X-LoadTest-Secret must match ──
    const secret = Deno.env.get("LOAD_TEST_SECRET");
    if (!secret) {
      return jsonError("Load test secret not configured", 403);
    }
    const providedSecret =
      req.headers.get("X-LoadTest-Secret") ||
      req.headers.get("x-loadtest-secret");
    if (providedSecret !== secret) {
      return jsonError("Invalid load test secret", 403);
    }

    // ── Gate 3: Operator ID via header + allowlist ──
    // JWT removed: short-lived tokens expire mid-run (~11 min), collapsing
    // header rotation during sustained tests. The X-LoadTest-Secret (Gate 2)
    // + allowlist provide equivalent security without a time-bomb.
    const operatorId =
      req.headers.get("X-LoadTest-Operator") ||
      req.headers.get("x-loadtest-operator");
    if (!operatorId) {
      return jsonError("Missing X-LoadTest-Operator header", 400);
    }

    if (ALLOWED_USER_IDS.length > 0 && !ALLOWED_USER_IDS.includes(operatorId)) {
      console.warn(
        `[mint-load-test-headers] Rejected operator ${operatorId} — not in allowlist`
      );
      return jsonError("Operator not authorized for load testing", 403);
    }

    // ── Gate 4: Rate limit (200 mints per 60 seconds per operator) ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: rateResult, error: rateErr } = await serviceClient.rpc("check_rate_limit", {
      p_key: `mint-lt:${operatorId}`,
      p_max_requests: 200,
      p_window_ms: 60000,
    });

    // RPC failure or null result = infrastructure issue, not a code bug
    if (rateErr || rateResult === null || rateResult === undefined) {
      console.error("[mint-load-test-headers] Rate limit RPC unavailable:", rateErr?.message || "null result");
      return new Response(
        JSON.stringify({ success: false, error: "rate_limit_unavailable" }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "5" },
        }
      );
    }

    if (!rateResult.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: "Rate limit exceeded" }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(rateResult.retry_after || 10),
          },
        }
      );
    }

    // ── Mint headers via RPC ──
    const { data: headers, error: rpcError } = await serviceClient.rpc(
      "get_load_test_headers"
    );

    if (rpcError || !headers) {
      console.error(
        "[mint-load-test-headers] RPC failed:",
        rpcError?.message
      );
      return jsonError("Failed to mint headers", 500);
    }

    return new Response(JSON.stringify(headers), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[mint-load-test-headers] Unhandled:", err);
    return jsonError(
      err instanceof Error ? err.message : "Internal error",
      500
    );
  }
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
