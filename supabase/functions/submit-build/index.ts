/**
 * UNIT 4 · BUILD MY HQ.
 *
 * One press, one submission. The caller's CID is DERIVED server side from their
 * own membership. The compiled onboarding record is stored on the tenant's own
 * onboarding row, the shared thread reference travels with it, and the existing
 * build-stage machinery takes over from there: this function only advances the
 * record out of intake. It invents no build engine of its own.
 *
 * Actions:
 *   submit -> store the compiled record, stamp build_submitted_at, move to files
 *   state  -> read back the live build stage (drives the ceremony, never a timer)
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { resolveThread } from "../_shared/taylor-shared.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** The staged ceremony. Each stage is a REAL record state, in order. */
const STAGE_ORDER = ["intake", "files", "build", "review", "live"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "build_missing_bearer" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !ANON) return json({ error: "build_runtime_supabase_config_missing" }, 500);
  if (!SERVICE) return json({ error: "build_runtime_service_role_missing" }, 500);

  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: authErr } = await asUser.auth.getClaims(token);
  if (authErr || !claims?.claims?.sub) return json({ error: "build_token_rejected" }, 401);
  const userId = String(claims.claims.sub);

  const { data: cidData, error: cidErr } = await asUser.rpc("current_cid");
  if (cidErr) return json({ error: "build_cid_lookup_failed", detail: cidErr.message }, 500);
  const cid = typeof cidData === "string" ? cidData.trim() : "";
  if (!cid) return json({ error: "build_no_tenant_for_caller" }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String((body as any)?.action || "state");

  const { data: row, error: rowErr } = await admin
    .from("onboarding_tenants")
    .select("id, status, identity_state, build_submitted_at, connector_connected_at")
    .eq("cid", cid)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rowErr) return json({ error: "build_record_read_failed", detail: rowErr.message }, 500);
  if (!row) return json({ error: "build_no_onboarding_record_for_cid", cid }, 404);

  const stageOf = (s: string | null) => {
    const i = STAGE_ORDER.indexOf(String(s || "intake") as (typeof STAGE_ORDER)[number]);
    return i < 0 ? 0 : i;
  };

  const readState = async () => {
    const { data: fresh } = await admin
      .from("onboarding_tenants")
      .select("status, build_submitted_at")
      .eq("id", row.id)
      .maybeSingle();
    const status = (fresh as any)?.status ?? row.status ?? "intake";
    return {
      cid,
      status,
      stage_index: stageOf(status),
      stages: STAGE_ORDER,
      build_submitted_at: (fresh as any)?.build_submitted_at ?? null,
    };
  };

  if (action === "state") return json(await readState());
  if (action !== "submit") return json({ error: "build_unknown_action" }, 400);

  if (row.identity_state !== "BOUND") {
    return json({ error: "build_onboarding_" + String(row.identity_state || "state_missing").toLowerCase(), cid }, 409);
  }

  // Idempotent: a second press never resubmits or rewinds the stage.
  if (row.build_submitted_at) return json({ ...(await readState()), idempotent: true });

  const threadId = await resolveThread(admin, cid);
  const compiled = (body as any)?.record && typeof (body as any).record === "object" ? (body as any).record : {};

  const submission = {
    submitted_at: new Date().toISOString(),
    cid,
    thread_id: threadId,
    record: compiled,
  };

  const { error: updErr } = await admin
    .from("onboarding_tenants")
    .update({
      build_submission: submission,
      build_submitted_at: submission.submitted_at,
      status: stageOf(row.status) < 1 ? "files" : row.status,
      current_step: "build",
      updated_at: submission.submitted_at,
    })
    .eq("id", row.id);
  if (updErr) return json({ error: "build_submission_not_recorded", detail: updErr.message }, 500);

  await admin.from("onboarding_progress").upsert(
    {
      cid,
      step_key: "build-hq",
      status: "done",
      source: "start_build_button",
      detail: "the client pressed BUILD MY HQ",
      updated_at: submission.submitted_at,
    },
    { onConflict: "cid,step_key" },
  );

  return json(await readState());
});
