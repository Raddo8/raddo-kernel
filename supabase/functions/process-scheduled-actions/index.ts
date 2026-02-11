import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { executeActionCore } from "../_shared/execute-action-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth: X-CRON-SECRET only, no JWT fallback ──
    const cronSecret = Deno.env.get("CRON_SECRET");
    const reqSecret = req.headers.get("X-CRON-SECRET");

    if (!cronSecret || !reqSecret || reqSecret !== cronSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Query due actions ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

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
