import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonError("Unauthorized", 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonError("Invalid token", 401);
    }

    // Parse body
    const { workspace_id } = await req.json();
    if (!workspace_id) {
      return jsonError("workspace_id is required", 400);
    }

    // Verify workspace membership
    const { data: isMember } = await userClient.rpc("is_workspace_member", {
      _user_id: user.id,
      _workspace_id: workspace_id,
    });
    if (!isMember) {
      return jsonOk({ error: "access_denied" });
    }

    // Use service-role client for aggregation queries
    const svc = createClient(supabaseUrl, serviceRoleKey);
    const currentPeriod = new Date().toISOString().slice(0, 7); // "YYYY-MM"

    // Fetch billing config
    const { data: billing } = await svc
      .from("workspace_billing")
      .select("plan, monthly_action_limit")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    const plan = billing?.plan ?? "free";
    const limit = billing?.monthly_action_limit ?? 100;

    // Channel breakdown for current period
    const { data: channelRows } = await svc
      .from("usage_events")
      .select("channel")
      .eq("workspace_id", workspace_id)
      .eq("billing_period", currentPeriod);

    const byChannel: Record<string, number> = {};
    let totalUsed = 0;
    if (channelRows) {
      for (const row of channelRows) {
        const ch = row.channel || "system";
        byChannel[ch] = (byChannel[ch] || 0) + 1;
        totalUsed++;
      }
    }

    // Daily breakdown (last 30 days) — fetch raw and aggregate in code
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: dailyRows } = await svc
      .from("usage_events")
      .select("recorded_at")
      .eq("workspace_id", workspace_id)
      .gte("recorded_at", thirtyDaysAgo)
      .order("recorded_at", { ascending: true });

    const dailyMap: Record<string, number> = {};
    if (dailyRows) {
      for (const row of dailyRows) {
        const day = row.recorded_at.slice(0, 10); // "YYYY-MM-DD"
        dailyMap[day] = (dailyMap[day] || 0) + 1;
      }
    }
    const daily = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

    return jsonOk({
      plan,
      monthly_action_limit: limit,
      current_period: currentPeriod,
      total_used: totalUsed,
      remaining: Math.max(0, limit - totalUsed),
      by_channel: byChannel,
      daily,
    });
  } catch (err) {
    console.error("[billing-usage] Unhandled:", err);
    return jsonError(err instanceof Error ? err.message : "Internal error", 500);
  }
});

function jsonOk(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
