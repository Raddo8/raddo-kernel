/**
 * health-probe: Micro-benchmark / health check for the create path.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ THIS FUNCTION DOES NOT MEASURE THROUGHPUT CEILINGS.            │
 * │ It validates that the create path is responsive (binary health).│
 * │ Internal request latency is NOT representative of end-user     │
 * │ latency. Use external k6 scripts for capacity quantification.  │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Constraints:
 *   - Max 5 sequential requests per invocation
 *   - Completes within ~10 seconds
 *   - Requires { "confirm_load": true } in request body
 *   - Creates isolated test fixtures with [HEALTH-PROBE] prefix
 *   - Cleans up all test data after each run
 *   - NOT scheduled via cron
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_PROBES = 5;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Safety gate
    if (body.confirm_load !== true) {
      return json(
        { success: false, error: "Must include confirm_load: true" },
        400
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ── Create isolated test fixtures ──
    const { data: ws } = await sb
      .from("workspaces")
      .insert({ name: "[HEALTH-PROBE] Probe Workspace", slug: `hp-${Date.now()}` })
      .select("id")
      .single();
    if (!ws) return json({ success: false, error: "Failed to create test workspace" }, 500);

    const { data: acct } = await sb
      .from("accounts")
      .insert({ name: "[HEALTH-PROBE] Probe Account", workspace_id: ws.id })
      .select("id")
      .single();
    if (!acct) return json({ success: false, error: "Failed to create test account" }, 500);

    const { data: item } = await sb
      .from("items")
      .insert({
        title: "[HEALTH-PROBE] Probe Item",
        workspace_id: ws.id,
        account_id: acct.id,
        type: "invoice",
      })
      .select("id")
      .single();
    if (!item) return json({ success: false, error: "Failed to create test item" }, 500);

    // ── Get HMAC cron headers for auth ──
    const { data: cronHeaders } = await sb.rpc("get_cron_headers");

    // ── Fire sequential probes ──
    const results: Array<{ latencyMs: number; status: number; ok: boolean }> = [];

    for (let i = 0; i < MAX_PROBES; i++) {
      const start = performance.now();
      const res = await fetch(`${supabaseUrl}/functions/v1/execute-action-server`, {
        method: "POST",
        headers: {
          ...(cronHeaders as Record<string, string>),
          apikey: anonKey,
        },
        body: JSON.stringify({
          mode: "create",
          params: {
            itemId: item.id,
            type: "send_notice",
            channel: "email",
            scheduledFor: new Date().toISOString(),
            idempotencyKey: `hp-${Date.now()}-${i}`,
            source: "system",
            payloadJson: { healthProbe: true, tag: "[HEALTH-PROBE]" },
          },
        }),
      });
      const latencyMs = Math.round(performance.now() - start);
      results.push({ latencyMs, status: res.status, ok: res.status === 200 });
    }

    // ── Cleanup ──
    await sb.from("actions").delete().eq("item_id", item.id);
    await sb.from("timeline_events").delete().eq("account_id", acct.id);
    await sb.from("items").delete().eq("id", item.id);
    await sb.from("accounts").delete().eq("id", acct.id);
    await sb.from("workspaces").delete().eq("id", ws.id);

    // ── Summarize ──
    const allOk = results.every((r) => r.ok);
    const avgLatency = Math.round(
      results.reduce((s, r) => s + r.latencyMs, 0) / results.length
    );

    return json({
      success: true,
      healthy: allOk,
      probes: results.length,
      avgInternalLatencyMs: avgLatency,
      note: "Internal latency only. Not representative of end-user latency.",
      results,
    });
  } catch (err) {
    console.error("[health-probe] Error:", err);
    return json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
