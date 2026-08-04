/**
 * UNIT 3 · TEMPORARY acceptance probe. SYNTHETIC TENANTS ONLY.
 *
 * Refuses any cid outside the synthetic set. Deleted after acceptance.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { setCobName, taylorConnectorIntro } from "../_shared/cob-name.ts";
import { postThreadMessage, resolveThread, readThreadMessages } from "../_shared/taylor-shared.ts";
import { buildWelcomePayload, normalizeClient, firstNameOf } from "../mcp-council/welcome.ts";

const SYNTHETIC = new Set(["CID-100011", "CID-100012"]);
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({} as any));
  const cid = String(body?.cid || "");
  if (!SYNTHETIC.has(cid)) return json({ error: "probe_refuses_non_synthetic_cid" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const step = String(body?.step || "state");
  const out: Record<string, unknown> = { cid, step };

  if (step === "rename") {
    out.rename = await setCobName(admin, cid, body?.name);
  }

  if (step === "celebrate") {
    const { data: row } = await admin
      .from("onboarding_tenants").select("id, welcome_celebrated_at").eq("cid", cid)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (row?.id && !(row as any).welcome_celebrated_at) {
      const { error } = await admin.from("onboarding_tenants")
        .update({ welcome_celebrated_at: new Date().toISOString() })
        .eq("id", (row as any).id).is("welcome_celebrated_at", null);
      out.marker_error = error?.message ?? null;
    }
  }

  if (step === "intro") {
    const { data: biz } = await admin.from("tenants").select("display_name, cob_name, principal").eq("cid", cid).maybeSingle();
    const client = normalizeClient({
      display_name: (biz as any)?.display_name,
      cob_name: (biz as any)?.cob_name,
      principal: (biz as any)?.principal,
    });
    const threadId = await resolveThread(admin, cid);
    const existing = await admin.from("taylor_messages").select("id")
      .eq("thread_id", threadId).eq("role", "taylor").eq("surface", "connector").limit(1);
    if (threadId && (!existing.data || existing.data.length === 0)) {
      out.posted = await postThreadMessage(admin, {
        threadId, cid, role: "taylor", surface: "connector",
        content: taylorConnectorIntro(client.cob_name, client.first_name ?? firstNameOf((biz as any)?.principal)),
      });
    } else out.posted = "already-present";
    out.thread_id = threadId;
  }

  if (step === "welcome_payload") {
    const { data: biz } = await admin.from("tenants").select("display_name, cob_name, principal").eq("cid", cid).maybeSingle();
    out.payload = buildWelcomePayload(normalizeClient({
      display_name: (biz as any)?.display_name,
      cob_name: (biz as any)?.cob_name,
      principal: (biz as any)?.principal,
    }));
  }

  const { data: row } = await admin
    .from("onboarding_tenants")
    .select("id, connector_connected_at, welcome_celebrated_at").eq("cid", cid)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const { data: biz } = await admin.from("tenants").select("display_name, cob_name, principal").eq("cid", cid).maybeSingle();
  const threadId = await resolveThread(admin, cid);
  out.record = { ...(row as any), ...(biz as any) };
  out.thread = threadId ? (await readThreadMessages(admin, threadId)).filter((m) => m.surface === "connector") : [];
  return json(out);
});
