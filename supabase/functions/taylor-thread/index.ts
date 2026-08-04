/**
 * UNIT 2 · TAYLOR panel backend (app surface of the shared thread).
 * UNIT 3 · plus the Welcome Party's server truth.
 *
 * Actions:
 *   read               -> thread messages (both surfaces) + shared context
 *   post               -> append the client's message, call the model, append TAYLOR's reply
 *   welcome_state      -> connector-success signal, the COB's name, the celebrated marker
 *   welcome_celebrated -> stamp the once-per-tenant celebration marker
 *   set_cob_name       -> rename the COB through the SAME path the connector uses
 *
 * Every failure state has its OWN error string. Nothing is ever a generic
 * exception, and no two different failures share a code.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  contextDigest,
  postThreadMessage,
  readSharedContext,
  readThreadMessages,
  renderThreadForModel,
  resolveThread,
  taylorModelId,
  TAYLOR_SYSTEM,
} from "../_shared/taylor-shared.ts";
import { setCobName } from "../_shared/cob-name.ts";


const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "taylor_missing_bearer" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !ANON) return json({ error: "taylor_runtime_supabase_config_missing" }, 500);
  if (!SERVICE) return json({ error: "taylor_runtime_service_role_missing" }, 500);

  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: authErr } = await asUser.auth.getClaims(token);
  if (authErr || !claims?.claims) return json({ error: "taylor_token_rejected" }, 401);

  // CID is DERIVED server side from the caller's own membership. Never accepted.
  const { data: cidData, error: cidErr } = await asUser.rpc("current_cid");
  if (cidErr) return json({ error: "taylor_cid_lookup_failed", detail: cidErr.message }, 500);
  const cid = typeof cidData === "string" ? cidData.trim() : "";
  if (!cid) return json({ error: "taylor_no_tenant_for_caller" }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String((body as any)?.action || "read");

  const threadId = await resolveThread(admin, cid);
  if (!threadId) return json({ error: "taylor_thread_unavailable" }, 500);

  if (action === "read") {
    const [messages, context] = await Promise.all([readThreadMessages(admin, threadId), readSharedContext(admin, cid)]);
    return json({ thread_id: threadId, cid, messages, context, model: taylorModelId(Deno.env) });
  }

  // UNIT 3 · the Welcome Party reads server truth only. CID is derived above.
  const readOnboardingRow = async () => {
    const { data, error } = await admin
      .from("onboarding_tenants")
      .select("id, connector_connected_at, connector_first_client, welcome_celebrated_at")
      .eq("cid", cid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data as any;
  };

  if (action === "welcome_state" || action === "welcome_celebrated" || action === "set_cob_name") {
    if (action === "set_cob_name") {
      const result = await setCobName(admin, cid, (body as any)?.name);
      if (!result.ok) return json({ error: "taylor_name_" + result.reason.replace(/-/g, "_") }, 400);
      await admin
        .from("onboarding_progress")
        .upsert(
          {
            cid,
            step_key: "chief-name",
            status: "done",
            source: "start_panel",
            detail: "named on the welcome party",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "cid,step_key" },
        );
    }

    if (action === "welcome_celebrated") {
      const row = await readOnboardingRow();
      if (row?.id && !row.welcome_celebrated_at) {
        const { error: markErr } = await admin
          .from("onboarding_tenants")
          .update({ welcome_celebrated_at: new Date().toISOString() })
          .eq("id", row.id)
          .is("welcome_celebrated_at", null);
        if (markErr) return json({ error: "taylor_welcome_marker_not_recorded", detail: markErr.message }, 500);
      }
    }

    const [row, biz] = await Promise.all([
      readOnboardingRow(),
      admin.from("tenants").select("display_name, cob_name, principal").eq("cid", cid).maybeSingle().then((r: any) => r?.data ?? null),
    ]);
    return json({
      cid,
      cob_name: biz?.cob_name ?? null,
      display_name: biz?.display_name ?? null,
      principal: biz?.principal ?? null,
      connector_connected_at: row?.connector_connected_at ?? null,
      connector_first_client: row?.connector_first_client ?? null,
      welcome_celebrated_at: row?.welcome_celebrated_at ?? null,
    });
  }

  if (action !== "post") return json({ error: "taylor_unknown_action" }, 400);


  const message = String((body as any)?.message || "").trim().slice(0, 4000);
  const pageCtx = String((body as any)?.page_ctx || "").slice(0, 200);
  if (!message) return json({ error: "taylor_empty_message" }, 400);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "taylor_model_key_unresolvable" }, 503);
  const model = taylorModelId(Deno.env);

  const posted = await postThreadMessage(admin, { threadId, cid, role: "client", surface: "start_panel", content: message });
  if (!posted) return json({ error: "taylor_client_message_not_recorded" }, 500);

  const [messages, context] = await Promise.all([readThreadMessages(admin, threadId), readSharedContext(admin, cid)]);
  const history = renderThreadForModel(messages);
  const system = `${TAYLOR_SYSTEM}\n\n[shared context, trusted]\n${contextDigest(context)}${
    pageCtx ? `\n\n[the screen they are on right now] ${pageCtx}` : ""
  }`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 400, system, messages: history }),
    });
  } catch (e) {
    return json({ error: "taylor_model_unreachable", detail: String(e instanceof Error ? e.message : e).slice(0, 300), client_message_id: posted.id }, 502);
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    return json({ error: "taylor_model_call_rejected", status: res.status, detail, model, client_message_id: posted.id }, 502);
  }

  const payload = await res.json().catch(() => null);
  const answer = String(
    (Array.isArray(payload?.content) ? payload.content : [])
      .filter((p: any) => p?.type === "text" && typeof p.text === "string")
      .map((p: any) => p.text)
      .join(""),
  ).trim();
  if (!answer) return json({ error: "taylor_model_returned_nothing", model, client_message_id: posted.id }, 502);

  const reply = await postThreadMessage(admin, { threadId, cid, role: "taylor", surface: "start_panel", content: answer });
  if (!reply) return json({ error: "taylor_reply_not_recorded", answer, model }, 500);

  return json({ thread_id: threadId, model, client_message_id: posted.id, reply_id: reply.id, answer });
});
