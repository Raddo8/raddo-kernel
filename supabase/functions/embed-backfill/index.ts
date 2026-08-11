// supabase/functions/embed-backfill/index.ts
//
// EMBED-BACKFILL · fills `embedding vector(1536)` on world_claims,
// memory_entries and storyline, and keeps filling it forever (pg_cron, 10m).
//
// Law:
//  · 1536 dims, OpenAI text-embedding-3-small. Every existing row in this
//    database is in that vector space; a second space would make search lie.
//  · Only rows where embedding IS NULL are read, and the write-back carries
//    `.is("embedding", null)` so a concurrent run can never double-write.
//  · One bad row never fails a batch. It is skipped, counted and named.
//  · Every invocation returns `remaining`, so it can be run until zero.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BUILD_ID = "embed-backfill.1";
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;
const OPENAI_URL = "https://api.openai.com/v1/embeddings";

const BATCH = 96;                // rows per provider call
const DEFAULT_LIMIT = 600;       // rows per table per invocation
const TIME_BUDGET_MS = 100_000;  // stay inside the edge function ceiling

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
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

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

type Spec = { table: string; select: string; text: (r: Record<string, unknown>) => string };

const TABLES: Spec[] = [
  {
    table: "world_claims",
    select: "id, cid, predicate, value_text",
    text: (r) => [s(r.predicate), s(r.value_text)].filter(Boolean).join(" "),
  },
  {
    table: "memory_entries",
    select: "id, cid, title, body_md",
    text: (r) => [s(r.title), s(r.body_md)].filter(Boolean).join(" "),
  },
  {
    table: "storyline",
    select: "id, cid, lane, title, body_md",
    text: (r) => [s(r.lane) || s(r.title), s(r.title), s(r.body_md)].filter(Boolean).join(" "),
  },
];

const toVector = (v: number[]): string => `[${v.join(",")}]`;

/** Batch embed. Returns one vector per input, or null for the whole batch. */
async function embedBatch(inputs: string[]): Promise<number[][] | null> {
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs, dimensions: EMBED_DIMS }),
    });
    if (!res.ok) {
      console.error("embed_http_failed", res.status, (await res.text()).slice(0, 400));
      return null;
    }
    const data = await res.json();
    const rows: Array<{ index: number; embedding: number[] }> = data?.data ?? [];
    if (rows.length !== inputs.length) return null;
    const out: number[][] = new Array(inputs.length);
    for (let i = 0; i < rows.length; i++) out[rows[i].index ?? i] = rows[i].embedding;
    return out.every((v) => Array.isArray(v) && v.length === EMBED_DIMS) ? out : null;
  } catch (e) {
    console.error("embed_exception", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Embed one row on its own · used to isolate a poisoned row out of a batch. */
async function embedSingles(
  rows: Array<{ id: string; text: string }>,
  skipped: Array<{ id: string; reason: string }>,
): Promise<Array<{ id: string; vector: number[] }>> {
  const out: Array<{ id: string; vector: number[] }> = [];
  for (const r of rows) {
    const v = await embedBatch([r.text]);
    if (v) out.push({ id: r.id, vector: v[0] });
    else skipped.push({ id: r.id, reason: "provider_rejected_row" });
  }
  return out;
}

async function remainingCount(table: string, cid: string | null): Promise<number> {
  let q = admin!.from(table).select("id", { count: "exact", head: true }).is("embedding", null);
  if (cid) q = q.eq("cid", cid);
  const { count } = await q;
  return count ?? 0;
}

async function runTable(spec: Spec, cid: string | null, limit: number, deadline: number) {
  const started = Date.now();
  let embedded = 0;
  const skipped: Array<{ id: string; reason: string }> = [];
  let processed = 0;

  while (processed < limit && Date.now() < deadline) {
    const take = Math.min(BATCH, limit - processed);
    let q = admin!
      .from(spec.table)
      .select(spec.select)
      .is("embedding", null)
      .order("created_at", { ascending: true, nullsFirst: false })
      .limit(take);
    if (cid) q = q.eq("cid", cid);

    const { data, error } = await q;
    if (error) {
      return {
        table: spec.table,
        embedded,
        remaining: await remainingCount(spec.table, cid),
        skipped: skipped.length,
        skipped_ids: skipped,
        error: `read_failed:${error.message}`,
        ms: Date.now() - started,
      };
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) break;
    processed += rows.length;

    const candidates: Array<{ id: string; text: string }> = [];
    for (const r of rows) {
      const id = String(r.id);
      const text = spec.text(r);
      if (!text) { skipped.push({ id, reason: "empty_text" }); continue; }
      candidates.push({ id, text: text.slice(0, 8000) });
    }
    if (candidates.length === 0) continue;

    // Batch first; on a batch failure fall back to per-row so one poisoned
    // row cannot cost the other ninety-five.
    let vectors = await embedBatch(candidates.map((c) => c.text));
    let pairs: Array<{ id: string; vector: number[] }>;
    if (vectors) pairs = candidates.map((c, i) => ({ id: c.id, vector: vectors![i] }));
    else pairs = await embedSingles(candidates, skipped);

    for (const p of pairs) {
      const { error: uerr } = await admin!
        .from(spec.table)
        .update({ embedding: toVector(p.vector) })
        .eq("id", p.id)
        .is("embedding", null);   // concurrent-run guard
      if (uerr) skipped.push({ id: p.id, reason: `write_failed:${uerr.message}` });
      else embedded++;
    }

    if (rows.length < take) break;
  }

  return {
    table: spec.table,
    embedded,
    remaining: await remainingCount(spec.table, cid),
    skipped: skipped.length,
    skipped_ids: skipped.slice(0, 50),
    ms: Date.now() - started,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    return json({ ok: true, service: "embed-backfill", build_id: BUILD_ID, model: EMBED_MODEL, dims: EMBED_DIMS });
  }
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  if (!admin) return fail("admin_client_unavailable", 503);
  if (!openaiKey) return fail("openai_key_unset", 503, { hint: "set OPENAI_API_KEY as an edge secret" });

  // Auth · either the service-role bearer (manual runs) or the cron HMAC pair
  // minted by public.get_cron_headers() (the scheduled run).
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let authorized = Boolean(token) && token === serviceRole;
  if (!authorized) {
    const ts = req.headers.get("x-cron-timestamp");
    const ct = req.headers.get("x-cron-token");
    if (ts && ct) {
      const { data: ok } = await admin.rpc("verify_cron_token", { p_timestamp: ts, p_token: ct });
      authorized = ok === true;
    }
  }
  if (!authorized) return fail("forbidden", 403);


  let body: Record<string, unknown> = {};
  if (req.headers.get("content-length") !== "0") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const cid = s(body?.cid) || null;
  const limit = Math.max(1, Math.min(5000, Number(body?.limit) || DEFAULT_LIMIT));
  const only = Array.isArray(body?.tables) ? (body.tables as unknown[]).map(String) : null;

  const deadline = Date.now() + TIME_BUDGET_MS;
  const results: unknown[] = [];
  for (const spec of TABLES) {
    if (only && !only.includes(spec.table)) continue;
    results.push(await runTable(spec, cid, limit, deadline));
  }

  const remaining = results.reduce((n: number, r: any) => n + (r?.remaining ?? 0), 0);
  return json({
    ok: true,
    action: "embed-backfill",
    cid,
    model: EMBED_MODEL,
    dims: EMBED_DIMS,
    done: remaining === 0,
    remaining,
    results,
    build_id: BUILD_ID,
  });
});
