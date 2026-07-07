// COB Operator API — scope-locked to workspace b0c00b00-…-0001.
// All writes go through the same paths the UI uses (state change + timeline event,
// action insert via items pipeline). Gated by X-COB-Operator-Key header secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkRateLimitDb, getClientIp } from "../_shared/rate-limit.ts";

const WORKSPACE_ID = "b0c00b00-0000-4000-8000-000000000001";
const ALLOWED_ACTIONS = new Set(["list_pursuits", "get_pursuit", "add_note", "set_state", "queue_task"]);
const ALLOWED_LAYERS = new Set(["L1", "L2", "L3", "L4", "L5"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cob-operator-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function signalHeat(events: { ts: string }[]): "hot" | "warm" | "cold" {
  const now = Date.now();
  const in48h = events.filter(e => now - new Date(e.ts).getTime() <= 48 * 3600_000).length;
  const in7d = events.filter(e => now - new Date(e.ts).getTime() <= 7 * 86400_000).length;
  if (in48h >= 3) return "hot";
  if (in7d >= 1) return "warm";
  return "cold";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const key = req.headers.get("x-cob-operator-key") || "";
  const expected = Deno.env.get("COB_OPERATOR_KEY") || "";
  if (!expected || key.length !== expected.length || key !== expected) {
    return json(401, { error: "unauthorized" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Rate limit per-IP: 60 requests / minute
  const ip = getClientIp(req.headers);
  const rl = await checkRateLimitDb(supabase, "cob-operator", ip, 60, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter || 1) },
    });
  }

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

  const action = body?.action as string;
  if (!action || !ALLOWED_ACTIONS.has(action)) return json(400, { error: "unknown_action" });

  // Workspace lock — any explicit workspace_id must match.
  if (body?.workspace_id && body.workspace_id !== WORKSPACE_ID) {
    return json(403, { error: "workspace_locked" });
  }

  try {
    if (action === "list_pursuits") {
      const { data: items } = await supabase
        .from("items")
        .select("id, title, state_id, account_id, metadata, updated_at, accounts(id, name, metadata), item_states(name, label, color, sort_order)")
        .eq("workspace_id", WORKSPACE_ID)
        .eq("type", "pursuit");

      const slugs = Array.from(new Set((items || []).map((p: any) => p.accounts?.metadata?.utm_slug).filter(Boolean)));
      const heatMap: Record<string, "hot" | "warm" | "cold"> = {};
      if (slugs.length > 0) {
        const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
        const { data: se } = await supabase
          .from("site_events")
          .select("ts, utm_source")
          .in("utm_source", slugs)
          .gte("ts", cutoff);
        const byS: Record<string, { ts: string }[]> = {};
        for (const e of se || []) (byS[(e as any).utm_source] ||= []).push({ ts: (e as any).ts });
        for (const s of slugs) heatMap[s as string] = signalHeat(byS[s as string] || []);
      }

      const pursuits = (items || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        state: p.item_states,
        account: { id: p.account_id, name: p.accounts?.name, utm_slug: p.accounts?.metadata?.utm_slug || null },
        metadata: p.metadata,
        updated_at: p.updated_at,
        signals_heat: p.accounts?.metadata?.utm_slug ? heatMap[p.accounts.metadata.utm_slug] : "cold",
      }));
      return json(200, { pursuits });
    }

    if (action === "get_pursuit") {
      const id = String(body?.pursuit_id || "");
      if (!id) return json(400, { error: "pursuit_id_required" });
      const { data: item } = await supabase
        .from("items")
        .select("*, accounts(*), item_states(*)")
        .eq("id", id)
        .eq("workspace_id", WORKSPACE_ID)
        .maybeSingle();
      if (!item) return json(404, { error: "not_found" });

      const { data: layers } = await supabase
        .from("timeline_events")
        .select("id, summary, body, raw_json, occurred_at")
        .eq("item_id", id)
        .not("raw_json->layer", "is", null)
        .order("occurred_at", { ascending: false });

      const slug = (item as any).accounts?.metadata?.utm_slug;
      let signals: any[] = [];
      if (slug) {
        const { data: se } = await supabase
          .from("site_events")
          .select("id, ts, event, route, utm_source, utm_medium, utm_campaign")
          .eq("utm_source", slug)
          .order("ts", { ascending: false })
          .limit(50);
        signals = se || [];
      }
      return json(200, { pursuit: item, layers: layers || [], signals });
    }

    if (action === "add_note") {
      const id = String(body?.pursuit_id || "");
      const layer = body?.layer ? String(body.layer) : null;
      const noteBody = String(body?.body || "").slice(0, 20000);
      const summary = String(body?.summary || "note").slice(0, 200);
      if (!id) return json(400, { error: "pursuit_id_required" });
      if (layer && !ALLOWED_LAYERS.has(layer)) return json(400, { error: "invalid_layer" });

      const { data: item } = await supabase
        .from("items").select("id, account_id, workspace_id")
        .eq("id", id).eq("workspace_id", WORKSPACE_ID).maybeSingle();
      if (!item) return json(404, { error: "not_found" });

      const raw: any = { source: "cob-operator" };
      if (layer) raw.layer = layer;

      const { data: ev, error } = await supabase.from("timeline_events").insert({
        account_id: (item as any).account_id,
        item_id: id,
        direction: "system",
        channel: "system",
        summary,
        body: noteBody || null,
        raw_json: raw,
        occurred_at: new Date().toISOString(),
      }).select("id").single();
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, event_id: (ev as any).id });
    }

    if (action === "set_state") {
      const id = String(body?.pursuit_id || "");
      const stateName = String(body?.state || "");
      if (!id || !stateName) return json(400, { error: "pursuit_id_and_state_required" });

      const { data: item } = await supabase
        .from("items").select("id, account_id, workspace_id")
        .eq("id", id).eq("workspace_id", WORKSPACE_ID).maybeSingle();
      if (!item) return json(404, { error: "not_found" });

      const { data: st } = await supabase
        .from("item_states").select("id, name, label")
        .eq("workspace_id", WORKSPACE_ID).eq("name", stateName).maybeSingle();
      if (!st) return json(400, { error: "unknown_state" });

      const { error: upErr } = await supabase.from("items")
        .update({ state_id: (st as any).id })
        .eq("id", id).eq("workspace_id", WORKSPACE_ID);
      if (upErr) return json(500, { error: upErr.message });

      await supabase.from("timeline_events").insert({
        account_id: (item as any).account_id,
        item_id: id,
        direction: "system",
        channel: "system",
        summary: `State changed to ${(st as any).label}`,
        raw_json: { source: "cob-operator", state: stateName },
        occurred_at: new Date().toISOString(),
      });
      return json(200, { ok: true, state_id: (st as any).id });
    }

    if (action === "queue_task") {
      const id = String(body?.pursuit_id || "");
      const task = String(body?.task || "").slice(0, 64);
      if (!id || !task) return json(400, { error: "pursuit_id_and_task_required" });

      const { data: item } = await supabase
        .from("items").select("id, workspace_id")
        .eq("id", id).eq("workspace_id", WORKSPACE_ID).maybeSingle();
      if (!item) return json(404, { error: "not_found" });

      const payload = {
        task,
        note: typeof body?.note === "string" ? body.note.slice(0, 2000) : undefined,
        ...(body?.payload && typeof body.payload === "object" ? body.payload : {}),
      };

      const { data: a, error } = await supabase.from("actions").insert({
        workspace_id: WORKSPACE_ID,
        item_id: id,
        type: "internal_task",
        channel: "system",
        status: "approved",
        payload_json: payload,
        source: "cob-operator",
        idempotency_key: `cob-operator:${id}:${task}:${Date.now()}`,
      } as any).select("id").single();
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, action_id: (a as any).id });
    }

    return json(400, { error: "unhandled_action" });
  } catch (e) {
    console.error("[cob-operator] error", e);
    return json(500, { error: "internal_error" });
  }
});
