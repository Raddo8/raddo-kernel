// supabase/functions/world-embed/index.ts
//
// MEANING SEARCH · fills the embedding columns so search can match on meaning.
//
// Law:
//  · idempotent: only rows where embedding IS NULL are ever touched
//  · safe to re-run at any time; a partial run simply resumes next time
//  · cid-scoped: one tenant per invocation, never a cross-tenant sweep
//  · nothing else on the row is modified
//
// Callers:
//  · operator: header `x-cob-operator-key` + { cid } in the body
//  · signed-in principal: the cid is derived from the token, body cid ignored

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { derivePrincipal, isFailure } from "../_shared/world-identity/identity.ts";
import { embedBatch, embedProvider, toVectorLiteral } from "../_shared/embed.ts";

const BUILD_ID = "world-embed.1";
const BATCH = 100;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = supabaseUrl && serviceRole
  ? createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })
  : null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "X-Build-Id": BUILD_ID },
  });

const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  json({ ok: false, error, ...extra }, status);

/** Each table, and how a row of it reads as one piece of text. */
const TARGETS = [
  {
    table: "memory_entries",
    columns: "id, title, body_md",
    text: (r: any) => `${r.title ?? ""}\n${r.body_md ?? ""}`,
  },
  {
    table: "world_claims",
    columns: "id, predicate, value_text",
    text: (r: any) => `${r.predicate ?? ""}: ${r.value_text ?? ""}`,
  },
  {
    table: "storyline",
    columns: "id, title, body_md",
    text: (r: any) => `${r.title ?? ""}\n${r.body_md ?? ""}`,
  },
] as const;

async function fillTable(cid: string, target: (typeof TARGETS)[number], maxBatches: number) {
  let filled = 0;
  let skipped = 0;
  let remaining = 0;

  for (let i = 0; i < maxBatches; i++) {
    const { data, error } = await admin!
      .from(target.table)
      .select(target.columns)
      .eq("cid", cid)
      .is("embedding", null)
      .limit(BATCH);
    if (error) return { table: target.table, filled, skipped, remaining, error: error.message };

    const rows = (data ?? []) as any[];
    if (rows.length === 0) break;

    const usable = rows.filter((r) => target.text(r).trim().length > 1);
    skipped += rows.length - usable.length;
    if (usable.length === 0) break;

    const vectors = await embedBatch(usable.map((r) => target.text(r).slice(0, 8000)));
    if (!vectors) return { table: target.table, filled, skipped, remaining, error: "embedding_unavailable" };

    for (let k = 0; k < usable.length; k++) {
      const upd = await admin!
        .from(target.table)
        .update({ embedding: toVectorLiteral(vectors[k]) })
        .eq("cid", cid)
        .eq("id", usable[k].id)
        .is("embedding", null);
      if (!upd.error) filled++;
    }
  }

  const { count } = await admin!
    .from(target.table)
    .select("id", { count: "exact", head: true })
    .eq("cid", cid)
    .is("embedding", null);
  remaining = count ?? 0;

  return { table: target.table, filled, skipped, remaining };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    return json({ ok: true, service: "world-embed", build_id: BUILD_ID, provider: Boolean(embedProvider()) });
  }
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  if (!admin) return fail("admin_client_unavailable", 503);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Operator path first, then the signed-in principal path.
  const operatorKey = Deno.env.get("COB_OPERATOR_KEY") ?? "";
  const presented = req.headers.get("x-cob-operator-key") ?? "";
  let cid: string | null = null;

  if (operatorKey && presented && presented === operatorKey) {
    cid = typeof body?.cid === "string" && body.cid.trim() ? body.cid.trim() : null;
    if (!cid) return fail("cid_required");
  } else {
    const principal = await derivePrincipal(req, admin);
    if (isFailure(principal)) return fail(principal.error, principal.status);
    cid = principal.cid;
  }

  if (!embedProvider()) {
    return fail("no_embedding_provider", 503, {
      detail: "No embedding provider is configured. Search keeps working on words alone.",
    });
  }

  const maxBatches = Math.min(Math.max(Number(body?.max_batches ?? 20), 1), 200);
  const only = typeof body?.table === "string" ? body.table : null;
  const tables = only ? TARGETS.filter((t) => t.table === only) : TARGETS;
  if (tables.length === 0) return fail("unknown_table");

  const results = [];
  for (const t of tables) results.push(await fillTable(cid, t, maxBatches));

  return json({
    ok: true,
    action: "embed",
    cid,
    results,
    filled: results.reduce((n, r) => n + (r.filled ?? 0), 0),
    remaining: results.reduce((n, r) => n + (r.remaining ?? 0), 0),
    build_id: BUILD_ID,
  });
});
