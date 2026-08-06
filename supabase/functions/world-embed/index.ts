// supabase/functions/world-embed/index.ts
//
// W-EMBED · THE MEANING LAYER · deterministic, certifiable.
// Fills the vector(1536) `embedding` column so the World answers natural-language
// questions. Internal-only (service-role Bearer). Idempotent: only reads NULL
// embeddings. Model: OpenAI text-embedding-3-small · 1536 dims.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BUILD_ID = "wembed.1";
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;
const DEFAULT_BATCH = 128;
const OPENAI_URL = "https://api.openai.com/v1/embeddings";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const admin = (supabaseUrl && serviceRole)
  ? createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })
  : null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Build-Id": BUILD_ID } });
const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra }, status);

type TableSpec = { table: string; select: string; text: (r: Record<string, unknown>) => string };
const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const TABLES: Record<string, TableSpec> = {
  world_claims:   { table: "world_claims",   select: "id, predicate, value_text", text: (r) => s(r.value_text) || s(r.predicate) },
  memory_entries: { table: "memory_entries", select: "id, title, body_md",        text: (r) => [s(r.title), s(r.body_md)].filter(Boolean).join(" — ") },
  storyline:      { table: "storyline",      select: "id, title, body_md",        text: (r) => [s(r.title), s(r.body_md)].filter(Boolean).join(" — ") },
};

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMS }),
  });
  if (!res.ok) { const detail = await res.text().catch(() => ""); throw new Error(`openai_${res.status}:${detail.slice(0, 300)}`); }
  const data = await res.json();
  const out: number[][] = (data?.data ?? []).sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding as number[]);
  if (out.length !== texts.length) throw new Error("openai_count_mismatch");
  return out;
}
const toVector = (v: number[]): string => `[${v.join(",")}]`;

async function embedTable(cid: string, spec: TableSpec, batch: number, max: number) {
  let embedded = 0, scanned = 0, skipped = 0, rounds = 0;
  while (embedded + skipped < max) {
    let q = admin!.from(spec.table).select(spec.select).eq("cid", cid).is("embedding", null).limit(batch);
    if (spec.table === "world_claims") q = q.neq("status", "voided");
    const { data, error } = await q;
    if (error) throw new Error(`${spec.table}_read_failed:${error.message}`);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) break;
    rounds++; scanned += rows.length;
    const payload = rows.map((r) => ({ id: r.id as string, text: spec.text(r) }));
    const embeddable = payload.filter((p) => p.text.length > 0);
    const empties = payload.filter((p) => p.text.length === 0);
    for (const e of empties) {
      await admin!.from(spec.table).update({ embedding: toVector(new Array(EMBED_DIMS).fill(0)) }).eq("cid", cid).eq("id", e.id);
      skipped++;
    }
    if (embeddable.length > 0) {
      const vectors = await embedBatch(embeddable.map((p) => p.text));
      for (let i = 0; i < embeddable.length; i++) {
        const { error: uerr } = await admin!.from(spec.table).update({ embedding: toVector(vectors[i]) }).eq("cid", cid).eq("id", embeddable[i].id);
        if (uerr) throw new Error(`${spec.table}_write_failed:${uerr.message}`);
        embedded++;
      }
    }
    if (rounds > Math.ceil(max / Math.max(batch, 1)) + 2) break;
  }
  let rq = admin!.from(spec.table).select("id", { count: "exact", head: true }).eq("cid", cid).is("embedding", null);
  if (spec.table === "world_claims") rq = rq.neq("status", "voided");
  const { count: remaining } = await rq;
  return { table: spec.table, scanned, embedded, skipped, remaining: remaining ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return json({ ok: true, service: "world-embed", build_id: BUILD_ID, model: EMBED_MODEL, dims: EMBED_DIMS });
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  if (!admin) return fail("admin_client_unavailable", 503);
  if (!openaiKey) return fail("openai_key_unset", 503, { hint: "set OPENAI_API_KEY as an edge secret" });
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== serviceRole) return fail("forbidden", 403);
  let body: any; try { body = await req.json(); } catch { return fail("invalid_json"); }
  const cid = s(body?.cid); if (!cid) return fail("cid_required");
  const batch = Math.min(256, Math.max(1, Number(body?.batch) || DEFAULT_BATCH));
  const max = Math.max(1, Number(body?.max) || 100000);
  const want: string[] = Array.isArray(body?.tables) && body.tables.length ? body.tables.map(String) : ["world_claims", "memory_entries", "storyline"];
  const results: unknown[] = [];
  try {
    for (const name of want) {
      const spec = TABLES[name];
      if (!spec) { results.push({ table: name, error: "unknown_table" }); continue; }
      results.push(await embedTable(cid, spec, batch, max));
    }
  } catch (e) { return fail("embed_failed", 500, { detail: e instanceof Error ? e.message : String(e), partial: results }); }
  const remaining = results.reduce((n: number, r: any) => n + (r?.remaining ?? 0), 0);
  return json({ ok: true, action: "embed", cid, model: EMBED_MODEL, dims: EMBED_DIMS, done: remaining === 0, remaining, results, build_id: BUILD_ID });
});
