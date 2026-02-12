import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { executeActionCore } from "../_shared/execute-action-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-timestamp, x-cron-token",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Auth: HMAC token verification ──
    const timestamp = req.headers.get("X-Cron-Timestamp") || req.headers.get("x-cron-timestamp");
    const token = req.headers.get("X-Cron-Token") || req.headers.get("x-cron-token");
    if (!timestamp || !token) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: isValid } = await supabase.rpc("verify_cron_token", {
      p_timestamp: timestamp,
      p_token: token,
    });
    if (!isValid) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Query due actions ──
    const { data: dueActions, error: queryErr } = await supabase
      .from("actions")
      .select("id")
      .in("status", ["scheduled", "approved"])
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (queryErr) {
      console.error("[process-scheduled-actions] Query error:", queryErr.message);
      return new Response(
        JSON.stringify({ success: false, error: queryErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!dueActions || dueActions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No due actions" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Execute each action directly via shared core ──
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    const details: Array<{ actionId: string; result: string; error?: string }> = [];

    for (const action of dueActions) {
      try {
        const result = await executeActionCore(supabase, action.id, {
          userId: null,
          source: "scheduler",
        });

        if (result.recovered) {
          skipped++;
          details.push({ actionId: action.id, result: "recovered", error: result.failed ? "timeout" : undefined });
        } else if (result.success) {
          succeeded++;
          details.push({ actionId: action.id, result: "succeeded" });
        } else {
          failed++;
          details.push({ actionId: action.id, result: "failed", error: result.error });
        }
      } catch (err) {
        failed++;
        details.push({
          actionId: action.id,
          result: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const summary = {
      success: true,
      processed: dueActions.length,
      succeeded,
      failed,
      skipped,
      details,
    };

    console.log("[process-scheduled-actions] Summary:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[process-scheduled-actions] Unhandled:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
