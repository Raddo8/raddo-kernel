// COB Operator API — scope-locked to workspace b0c00b00-…-0001.
// All writes go through the same paths the UI uses (state change + timeline event,
// action insert via items pipeline). Gated by X-COB-Operator-Key header secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkRateLimitDb, getClientIp } from "../_shared/rate-limit.ts";

const WORKSPACE_ID = "b0c00b00-0000-4000-8000-000000000001";
const ALLOWED_ACTIONS = new Set([
  "list_pursuits", "get_pursuit", "add_note", "set_state", "queue_task",
  "upload_file", "create_approval_request", "list_approval_requests",
  "list_work_orders", "claim_work_order", "complete_work_order",
]);
const ALLOWED_ORDER_TYPES = new Set([
  "qualify_enrichment","deepdive","build_asset","prepare_send","draft_nudge","revisit",
  "kernel_step","project_build",
]);

const DEFAULT_AUTOPILOT_MATRIX: Record<string, "auto" | "assist" | "manual"> = {
  qualify_enrichment: "auto", deepdive: "auto", build_asset: "assist",
  prepare_send: "assist", draft_nudge: "auto", revisit: "assist",
  kernel_step: "manual", project_build: "manual",
};

const ALLOWED_LAYERS = new Set(["L1", "L2", "L3", "L4", "L5"]);
const GATED_STATES = new Set([
  "qualified", "deepdive", "asset_built", "meeting_set",
  "build_shown", "proposal", "agreement", "onboarding", "client",
]);

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

      // Qualified gate · must mirror src/lib/state-transitions.ts.
      if (GATED_STATES.has(stateName)) {
        const { data: dm } = await supabase
          .from("contacts")
          .select("id, email, is_decision_maker")
          .eq("account_id", (item as any).account_id);
        const hasDm = (dm || []).some((c: any) => c.is_decision_maker && (c.email || "").trim());
        if (!hasDm) {
          return json(409, {
            error: "qualified_gate_blocked",
            reason: `Contact incomplete · a decision-maker contact with a non-empty email is required to reach ${stateName} or beyond.`,
          });
        }
      }

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

    if (action === "upload_file") {
      // Register metadata for a file COB uploaded via the Storage API directly.
      // Body: { pursuit_id? , account_id?, storage_path, file_name, kind, size_bytes }
      const storage_path = String(body?.storage_path || "");
      const file_name = String(body?.file_name || "");
      const kind = String(body?.kind || "other");
      const size_bytes = Number(body?.size_bytes || 0);
      if (!storage_path || !file_name) return json(400, { error: "storage_path_and_file_name_required" });
      if (!["deck","site","email_draft","agreement","other"].includes(kind)) return json(400, { error: "invalid_kind" });

      let itemId: string | null = null;
      let accountId: string | null = body?.account_id ? String(body.account_id) : null;
      if (body?.pursuit_id) {
        const { data: it } = await supabase.from("items")
          .select("id, account_id, workspace_id")
          .eq("id", String(body.pursuit_id)).eq("workspace_id", WORKSPACE_ID).maybeSingle();
        if (!it) return json(404, { error: "not_found" });
        itemId = (it as any).id;
        accountId = (it as any).account_id;
      }
      if (!accountId) return json(400, { error: "account_id_or_pursuit_id_required" });

      const { data: acct } = await supabase.from("accounts")
        .select("id, workspace_id").eq("id", accountId).eq("workspace_id", WORKSPACE_ID).maybeSingle();
      if (!acct) return json(404, { error: "account_not_found" });

      const { data: rf, error } = await supabase.from("record_files").insert({
        workspace_id: WORKSPACE_ID,
        account_id: accountId,
        item_id: itemId,
        file_name,
        storage_path,
        kind,
        size_bytes,
      } as any).select("id").single();
      if (error) return json(500, { error: error.message });

      await supabase.from("timeline_events").insert({
        account_id: accountId,
        item_id: itemId,
        direction: "system",
        channel: "system",
        summary: `File uploaded · ${file_name} (via COB)`,
        raw_json: { source: "cob-operator", kind, size: size_bytes, record_file_id: (rf as any).id },
        occurred_at: new Date().toISOString(),
      });
      return json(200, { ok: true, record_file_id: (rf as any).id });
    }

    if (action === "create_approval_request") {
      const id = String(body?.pursuit_id || "");
      const kind = String(body?.kind || "");
      const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
      if (!id || !kind) return json(400, { error: "pursuit_id_and_kind_required" });
      if (!["state_move","send_email","other"].includes(kind)) return json(400, { error: "invalid_kind" });

      const { data: item } = await supabase.from("items")
        .select("id, workspace_id").eq("id", id).eq("workspace_id", WORKSPACE_ID).maybeSingle();
      if (!item) return json(404, { error: "not_found" });

      const { data: ar, error } = await supabase.from("approval_requests").insert({
        workspace_id: WORKSPACE_ID,
        item_id: id,
        kind,
        payload,
        note: typeof body?.note === "string" ? body.note.slice(0, 1000) : null,
      } as any).select("id").single();
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, approval_id: (ar as any).id });
    }

    if (action === "list_approval_requests") {
      const status = body?.status ? String(body.status) : "pending";
      if (!["pending","approved","rejected","all"].includes(status)) return json(400, { error: "invalid_status" });
      let q = supabase.from("approval_requests")
        .select("id, item_id, kind, payload, status, note, created_at, decided_at")
        .eq("workspace_id", WORKSPACE_ID)
        .order("created_at", { ascending: false })
        .limit(100);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) return json(500, { error: error.message });
      return json(200, { approvals: data || [] });
    }

    if (action === "list_work_orders") {
      const status = body?.status ? String(body.status) : "queued";
      const validStatuses = ["queued","claimed","in_progress","done","failed","cancelled","active","all"];
      if (!validStatuses.includes(status)) return json(400, { error: "invalid_status" });
      let q = supabase.from("work_orders")
        .select("id, item_id, order_type, params, status, created_by, claimed_by, claimed_at, completed_at, result_note, created_at")
        .eq("workspace_id", WORKSPACE_ID)
        .order("created_at", { ascending: true })
        .limit(200);
      if (status === "active") q = q.in("status", ["queued","claimed","in_progress"]);
      else if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) return json(500, { error: error.message });
      return json(200, { work_orders: data || [] });
    }

    if (action === "claim_work_order") {
      const id = String(body?.work_order_id || "");
      const claimedBy = String(body?.claimed_by || "cob-engine").slice(0, 128);
      if (!id) return json(400, { error: "work_order_id_required" });
      // Atomic claim · only succeeds if still queued.
      const { data, error } = await supabase.from("work_orders")
        .update({ status: "claimed", claimed_by: claimedBy, claimed_at: new Date().toISOString() })
        .eq("id", id).eq("workspace_id", WORKSPACE_ID).eq("status", "queued")
        .select("id, item_id, order_type, params").maybeSingle();
      if (error) return json(500, { error: error.message });
      if (!data) return json(409, { error: "not_claimable" });
      return json(200, { ok: true, work_order: data });
    }

    if (action === "complete_work_order") {
      const id = String(body?.work_order_id || "");
      const outcome = String(body?.outcome || "done");
      const resultNote = typeof body?.result_note === "string" ? body.result_note.slice(0, 4000) : null;
      if (!id) return json(400, { error: "work_order_id_required" });
      if (!["done","failed","cancelled"].includes(outcome)) return json(400, { error: "invalid_outcome" });

      const { data: wo } = await supabase.from("work_orders")
        .select("id, item_id, order_type, workspace_id, status")
        .eq("id", id).eq("workspace_id", WORKSPACE_ID).maybeSingle();
      if (!wo) return json(404, { error: "not_found" });

      const { error: uErr } = await supabase.from("work_orders")
        .update({ status: outcome, completed_at: new Date().toISOString(), result_note: resultNote })
        .eq("id", id);
      if (uErr) return json(500, { error: uErr.message });

      // Optional file registrations · same shape as upload_file's inputs.
      const registered_files: string[] = [];
      if (Array.isArray(body?.files)) {
        for (const f of body.files) {
          const storage_path = String(f?.storage_path || "");
          const file_name = String(f?.file_name || "");
          const kind = String(f?.kind || "other");
          const size_bytes = Number(f?.size_bytes || 0);
          if (!storage_path || !file_name) continue;
          if (!["deck","site","email_draft","agreement","other"].includes(kind)) continue;
          const { data: it } = await supabase.from("items")
            .select("id, account_id").eq("id", (wo as any).item_id).maybeSingle();
          if (!it) continue;
          const { data: rf } = await supabase.from("record_files").insert({
            workspace_id: WORKSPACE_ID,
            account_id: (it as any).account_id,
            item_id: (wo as any).item_id,
            file_name, storage_path, kind, size_bytes,
          } as any).select("id").single();
          if (rf) registered_files.push((rf as any).id);
        }
      }

      // Optional approval_request creation (typical for state advancement after work).
      // Per-state autopilot matrix: if mode = AUTO for this order_type and kind = state_move,
      // apply the state change directly (respecting the qualified gate) and skip approval.
      // send_email is ALWAYS gated regardless of mode.
      let approval_id: string | null = null;
      let auto_applied_state: string | null = null;
      if (body?.approval && typeof body.approval === "object") {
        const kind = String(body.approval.kind || "");
        if (!["state_move","send_email","other"].includes(kind)) return json(400, { error: "invalid_approval_kind" });
        const payload = body.approval.payload && typeof body.approval.payload === "object" ? body.approval.payload : {};

        const { data: ws } = await supabase.from("workspaces").select("settings").eq("id", WORKSPACE_ID).maybeSingle();
        const { data: itMeta } = await supabase.from("items").select("metadata, account_id, workspace_id").eq("id", (wo as any).item_id).maybeSingle();
        const wm = ((ws as any)?.settings?.autopilot_matrix || {}) as Record<string, "auto"|"assist"|"manual">;
        const im = ((itMeta as any)?.metadata?.autopilot_matrix || {}) as Record<string, "auto"|"assist"|"manual">;
        const ot = (wo as any).order_type as string;
        const mode = im[ot] ?? wm[ot] ?? DEFAULT_AUTOPILOT_MATRIX[ot] ?? "manual";

        const canAutoApply = kind === "state_move" && mode === "auto" && typeof payload.to_state === "string";
        let didAutoApply = false;
        if (canAutoApply) {
          const targetName = String(payload.to_state);
          let gateBlocked = false;
          if (GATED_STATES.has(targetName)) {
            const { data: dm } = await supabase.from("contacts").select("email, is_decision_maker").eq("account_id", (itMeta as any).account_id);
            const hasDm = (dm || []).some((c: any) => c.is_decision_maker && (c.email || "").trim());
            if (!hasDm) gateBlocked = true;
          }
          if (!gateBlocked) {
            const { data: st } = await supabase.from("item_states").select("id, name, label").eq("workspace_id", WORKSPACE_ID).eq("name", targetName).maybeSingle();
            if (st) {
              await supabase.from("items").update({ state_id: (st as any).id }).eq("id", (wo as any).item_id);
              await supabase.from("timeline_events").insert({
                account_id: (itMeta as any).account_id,
                item_id: (wo as any).item_id,
                direction: "system", channel: "system",
                summary: `State changed to ${(st as any).label} · autopilot AUTO`,
                raw_json: { source: "cob-operator", state: targetName, mode: "auto", work_order_id: id },
                occurred_at: new Date().toISOString(),
              });
              auto_applied_state = targetName;
              didAutoApply = true;
            }
          }
        }
        if (!didAutoApply) {
          const { data: ar } = await supabase.from("approval_requests").insert({
            workspace_id: WORKSPACE_ID,
            item_id: (wo as any).item_id,
            kind, payload,
            note: typeof body.approval.note === "string" ? body.approval.note.slice(0, 1000) : null,
          } as any).select("id").single();
          approval_id = (ar as any)?.id ?? null;
        }
      }

      // Timeline event · always.
      const { data: it2 } = await supabase.from("items")
        .select("account_id").eq("id", (wo as any).item_id).maybeSingle();
      if (it2) {
        await supabase.from("timeline_events").insert({
          account_id: (it2 as any).account_id,
          item_id: (wo as any).item_id,
          direction: "system",
          channel: "system",
          summary: `Work order ${outcome} · ${(wo as any).order_type}`,
          body: resultNote,
          raw_json: { source: "cob-operator", work_order_id: id, outcome, files: registered_files, approval_id },
          occurred_at: new Date().toISOString(),
        });
      }

      return json(200, { ok: true, work_order_id: id, registered_files, approval_id });
    }

    return json(400, { error: "unhandled_action" });

  } catch (e) {
    console.error("[cob-operator] error", e);
    return json(500, { error: "internal_error" });
  }
});
