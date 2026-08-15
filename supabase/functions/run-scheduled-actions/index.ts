// HARDEN-10 · K2 · the runner's trigger.
//
// Thin by design: the claim, the lease, the effect and the receipt all live in
// public.scheduled_actions_run. This function authenticates the tick and
// returns what the runner MEASURED. Zero eligible rows returns the reason the
// runner gave, never a bare success.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-timestamp, x-cron-token",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const timestamp = req.headers.get("x-cron-timestamp");
    const token = req.headers.get("x-cron-token");
    if (!timestamp || !token) return json({ ok: false, error: "Unauthorized" }, 401);

    const { data: isValid } = await supabase.rpc("verify_cron_token", {
      p_timestamp: timestamp,
      p_token: token,
    });
    if (!isValid) return json({ ok: false, error: "Unauthorized" }, 401);

    const { data, error } = await supabase.rpc("scheduled_actions_run", {
      p_worker: `edge:run-scheduled-actions:${crypto.randomUUID().slice(0, 8)}`,
      p_limit: 25,
      p_lease_seconds: 120,
      p_max_attempts: 5,
    });

    if (error) {
      console.error("[run-scheduled-actions] runner error:", error.message);
      return json({ ok: false, error: error.message }, 500);
    }

    console.log("[run-scheduled-actions]", JSON.stringify(data));
    return json(data, 200);
  } catch (err) {
    console.error("[run-scheduled-actions] unhandled:", err);
    return json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
    );
  }
});
