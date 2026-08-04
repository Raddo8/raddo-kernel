/**
 * TEMPORARY acceptance probe for UNIT 2. Header-gated by TAYLOR_PROBE_TOKEN.
 * Deleted immediately after the acceptance run.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  contextDigest,
  postThreadMessage,
  readSharedContext,
  readThreadMessages,
  resolveThread,
  taylorModelId,
  TAYLOR_SYSTEM,
} from "../_shared/taylor-shared.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: keyRow } = await admin.from("internal_keys").select("key_value").eq("name", "taylor_probe_token").maybeSingle();
  const expectedHex = keyRow?.key_value ? String(keyRow.key_value).toLowerCase() : null;
  const presented = req.headers.get("x-probe-token") || "";
  const presentedHex = "\\x" + Array.from(new TextEncoder().encode(presented)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!expectedHex || presented.length < 16 || presentedHex !== expectedHex) {
    return new Response(JSON.stringify({ error: "probe_forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }


  const body = await req.json().catch(() => ({} as any));
  const cid = String(body?.cid || "").trim();
  const out: Record<string, unknown> = { cid };

  const threadId = await resolveThread(admin, cid);
  out.thread_id = threadId;
  if (!threadId) return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const panelMsg = await postThreadMessage(admin, { threadId, cid, role: "client", surface: "start_panel", content: String(body?.panel_message || "probe panel message") });
  out.panel_message_id = panelMsg?.id ?? null;
  const connMsg = await postThreadMessage(admin, { threadId, cid, role: "client", surface: "connector", content: String(body?.connector_message || "probe connector message") });
  out.connector_message_id = connMsg?.id ?? null;

  const ctx = await readSharedContext(admin, cid);
  out.context_summary = {
    current_step: ctx.onboarding.current_step,
    consent_signed_at: ctx.onboarding.consent_signed_at,
    connector_connected_at: ctx.onboarding.connector_connected_at,
    intake_recorded_count: ctx.intake_recorded.length,
    intake_answers_count: ctx.intake_answers.length,
    fireside_count: ctx.fireside_answers.length,
    material_count: ctx.material_index.length,
    connections: ctx.connections,
    latest_intake: ctx.intake_recorded[0] ?? null,
  };

  const messages = await readThreadMessages(admin, threadId);
  out.message_count = messages.length;
  out.surfaces_present = Array.from(new Set(messages.map((m) => m.surface)));

  const model = taylorModelId(Deno.env);
  out.model = model;
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) {
    out.model_result = "taylor_model_key_unresolvable";
  } else {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        system: `${TAYLOR_SYSTEM}\n\n[shared context, trusted]\n${contextDigest(ctx)}`,
        messages: [{ role: "user", content: String(body?.prompt || "What is my next step?") }],
      }),
    });
    if (!r.ok) out.model_result = { status: r.status, detail: (await r.text()).slice(0, 400) };
    else {
      const j = await r.json();
      const answer = (Array.isArray(j?.content) ? j.content : []).filter((p: any) => p?.type === "text").map((p: any) => p.text).join("").trim();
      const saved = await postThreadMessage(admin, { threadId, cid, role: "taylor", surface: "start_panel", content: answer });
      out.model_result = { ok: true, model_echo: j?.model ?? null, answer, reply_id: saved?.id ?? null };
    }
  }
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
