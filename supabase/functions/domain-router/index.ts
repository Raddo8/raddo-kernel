// domain-router · dr.1
// Pass two of the three-pass ingest: many-to-many domain classification.
// Decomposed schema on purpose. Output volume is the dominant failure predictor in
// structured extraction, so this asks for a SMALL field set per call and never a large one.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL  = Deno.env.get("ROUTER_MODEL") ?? "claude-haiku-4-5";

type Item = { id: string; kind: string; title: string; body: string; occurred?: string };
type Route = { id: string; domains: { d: string; c: number }[]; why: string };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The taxonomy is read from the database, never hardcoded here. Fourteen, always.
async function taxonomy(sb: any) {
  const { data, error } = await sb.from("domain_taxonomy")
    .select("domain_key,label,definition,scope").order("ordinal");
  if (error) throw new Error("taxonomy read failed: " + error.message);
  return data as { domain_key: string; label: string; definition: string; scope: string }[];
}

function buildSystem(tax: any[]) {
  return [
    "You route a client's material into a fixed taxonomy of fourteen life-and-business domains.",
    "",
    "THE DOMAINS:",
    ...tax.map((t) => `${t.domain_key} · ${t.label} · ${t.definition}`),
    "",
    "RULES, binding:",
    "1. Routing is MANY-TO-MANY. Most real material belongs to two or three domains.",
    "   A payroll notice for a company that owes money is people AND cash AND tech if it is a SaaS payroll product.",
    "   Do not force a single domain. Do not pad either.",
    "2. Assign a confidence from 0.0 to 1.0 per domain. Below 0.35 means do not assign it.",
    "3. Route on what the material IS ABOUT, never on who sent it or how it arrived.",
    "4. 'network' is a real domain about people and institutions in the principal's orbit.",
    "   It is NOT a catch-all. If you cannot place an item, return an empty domain list and say why.",
    "   An honest empty is correct. A lazy 'network' is a routing failure.",
    "5. Never invent. You are classifying text you were given, nothing more.",
    "",
    "Return ONLY a JSON array. One object per input item, same order, no prose, no markdown fence:",
    '[{"id":"<id>","domains":[{"d":"<domain_key>","c":0.0}],"why":"<12 words max>"}]',
  ].join("\n");
}

async function routeBatch(items: Item[], tax: any[]): Promise<Route[]> {
  const sys = buildSystem(tax);
  const user = items.map((i) =>
    `<item id="${i.id}" kind="${i.kind}"${i.occurred ? ` occurred="${i.occurred}"` : ""}>\n` +
    `${(i.title ?? "").slice(0, 300)}\n${(i.body ?? "").slice(0, 1800)}\n</item>`
  ).join("\n\n");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": AI_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error(`router ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const j = await r.json();
  const raw = (j.content?.[0]?.text ?? "").trim().replace(/^```(json)?|```$/g, "").trim();
  let parsed: Route[];
  try { parsed = JSON.parse(raw); } catch { throw new Error("router returned unparseable json"); }
  if (!Array.isArray(parsed)) throw new Error("router did not return an array");
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(SB_URL, SB_KEY);
    const { cid, items, dry_run } = await req.json();
    if (!cid) throw new Error("cid required");
    if (!Array.isArray(items) || !items.length) throw new Error("items required");
    if (items.length > 40) throw new Error("batch cap is 40 items");

    const tax = await taxonomy(sb);
    const valid = new Set(tax.map((t) => t.domain_key));
    const routes = await routeBatch(items, tax);

    const rows: any[] = [];
    let unplaced = 0;
    for (const r of routes) {
      const ds = (r.domains ?? []).filter((x) => valid.has(x.d) && x.c >= 0.35);
      if (!ds.length) { unplaced++; continue; }
      for (const d of ds) {
        rows.push({
          cid, claim_id: null, memory_id: r.id, domain_key: d.d,
          confidence: Math.min(1, Math.max(0, d.c)),
          routed_by: `domain-router/dr.1/${MODEL}`, routed_at: new Date().toISOString(),
        });
      }
    }

    if (!dry_run && rows.length) {
      const { error } = await sb.from("item_domain").insert(rows);
      if (error) throw new Error("item_domain insert failed: " + error.message);
    }

    // Honest reporting. An unplaced item is a coverage fact, not a failure to hide.
    const spread = rows.reduce((a: any, r) => (a[r.domain_key] = (a[r.domain_key] ?? 0) + 1, a), {});
    return new Response(JSON.stringify({
      ok: true, version: "dr.1", model: MODEL,
      items: items.length, routed: routes.length, placements: rows.length,
      unplaced, avg_domains_per_item: +(rows.length / Math.max(1, items.length - unplaced)).toFixed(2),
      spread, dry_run: !!dry_run,
    }), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      { status: 400, headers: { ...cors, "content-type": "application/json" } });
  }
});
