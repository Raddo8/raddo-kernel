// domain-router · dr.2
// Pass two of the three-pass ingest, now a QUEUE-DRIVEN WORKER rather than an endpoint.
// It claims units from the ingestion program, routes them, commits, and yields to the
// budget governor. A session never decides what to do; it asks the program.
//
// dr.2 fixes two defects found by trying to use dr.1 in anger:
//   1. dr.1 hardcoded memory_id, so it could not route world_claims at all.
//      item_domain has a CHECK(num_nonnulls(claim_id, memory_id) = 1) and separate FKs,
//      so the target column must be chosen per item, not assumed.
//   2. dr.1's dry_run returned only aggregates, so it could not be used to inspect
//      routing before writing. dry_run now returns the per-item routes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL  = Deno.env.get("ROUTER_MODEL") ?? "claude-haiku-4-5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
type Src = "claim" | "memory";
type Item = { id: string; src: Src; kind: string; title: string; body: string; occurred?: string };
type Route = { id: string; domains: { d: string; c: number }[]; why: string };

async function taxonomy(sb: any) {
  const { data, error } = await sb.from("domain_taxonomy")
    .select("domain_key,label,definition,scope").order("ordinal");
  if (error) throw new Error("taxonomy read failed: " + error.message);
  return data as { domain_key: string; label: string; definition: string; scope: string }[];
}

function buildSystem(tax: any[]) {
  const biz = tax.filter(t => t.scope !== "personal");
  const per = tax.filter(t => t.scope === "personal");
  return [
    "You route a principal's material into a fixed taxonomy of life-and-business domains.",
    "",
    "BUSINESS AND SHARED DOMAINS:",
    ...biz.map(t => `${t.domain_key} · ${t.label} · ${t.definition}`),
    "",
    "PERSONAL DOMAINS · a principal is a whole person, not only an operator.",
    "Family, faith, children's schooling and sport, health and travel are FIRST CLASS material",
    "and must be routed to these domains, never swept into relationships:",
    ...per.map(t => `${t.domain_key} · ${t.label} · ${t.definition}`),
    "",
    "RULES, binding:",
    "1. Routing is MANY-TO-MANY. Most real material belongs to two or three domains.",
    "   A payroll notice for a company that owes money is people AND cash, and tech too if the",
    "   payroll runs on a SaaS product. Do not force a single domain. Do not pad either.",
    "2. Assign a confidence from 0.0 to 1.0 per domain. Below 0.35 means do not assign it.",
    "3. Route on what the material IS ABOUT, never on who sent it or how it arrived.",
    "4. 'network' is a real domain about people and institutions in the principal's orbit.",
    "   It is NOT a catch-all and it is NOT where personal life goes. A child's school belongs to",
    "   education and family. A coaching commitment belongs to interests and family. Faith practice",
    "   belongs to interests, and to giving where money or service is involved.",
    "   If you truly cannot place an item, return an empty domain list and say why.",
    "   An honest empty is correct. A lazy 'network' is a routing failure.",
    "5. Never invent. You are classifying text you were given, nothing more.",
    "",
    "Return ONLY a JSON array. One object per input item, same order, no prose, no markdown fence:",
    '[{"id":"<id>","domains":[{"d":"<domain_key>","c":0.0}],"why":"<12 words max>"}]',
  ].join("\n");
}

async function routeBatch(items: Item[], tax: any[]): Promise<Route[]> {
  const user = items.map(i =>
    `<item id="${i.id}" kind="${i.kind}"${i.occurred ? ` occurred="${i.occurred}"` : ""}>\n` +
    `${(i.title ?? "").slice(0, 300)}\n${(i.body ?? "").slice(0, 1800)}\n</item>`
  ).join("\n\n");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": AI_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 4096,
      system: [{ type: "text", text: buildSystem(tax), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error(`router ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const j = await r.json();
  const raw = (j.content?.[0]?.text ?? "").trim().replace(/^```(json)?|```$/g, "").trim();
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("router did not return an array");
  return parsed as Route[];
}

// Load the actual material for a unit. The unit payload names WHAT to route, never carries it.
async function loadItems(sb: any, cid: string, payload: any): Promise<Item[]> {
  const src: Src = payload?.src === "memory" ? "memory" : "claim";
  const ids: string[] = payload?.ids ?? [];
  if (!ids.length) return [];
  if (src === "claim") {
    const { data, error } = await sb.from("world_claims")
      .select("id,predicate,value_text,observed_at,subject_id").eq("cid", cid).in("id", ids);
    if (error) throw new Error("claim load failed: " + error.message);
    const subs = [...new Set((data ?? []).map((r: any) => r.subject_id).filter(Boolean))];
    const names: Record<string, string> = {};
    if (subs.length) {
      const { data: ents } = await sb.from("world_entities").select("id,name").in("id", subs);
      (ents ?? []).forEach((e: any) => (names[e.id] = e.name));
    }
    return (data ?? []).map((r: any) => ({
      id: r.id, src, kind: r.predicate ?? "claim",
      title: names[r.subject_id] ?? "", body: r.value_text ?? "",
      occurred: r.observed_at ?? undefined,
    }));
  }
  const { data, error } = await sb.from("memory_entries")
    .select("id,title,body_md,kind,occurred_at").eq("cid", cid).in("id", ids);
  if (error) throw new Error("memory load failed: " + error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id, src, kind: r.kind ?? "memory", title: r.title ?? "",
    body: r.body_md ?? "", occurred: r.occurred_at ?? undefined,
  }));
}

function rowsFor(cid: string, src: Src, routes: Route[], valid: Set<string>) {
  const rows: any[] = []; let unplaced = 0;
  for (const r of routes) {
    const ds = (r.domains ?? []).filter(x => valid.has(x.d) && x.c >= 0.35);
    if (!ds.length) { unplaced++; continue; }
    for (const d of ds) {
      rows.push({
        cid,
        claim_id:  src === "claim"  ? r.id : null,   // the CHECK allows exactly one
        memory_id: src === "memory" ? r.id : null,
        domain_key: d.d,
        confidence: Math.min(1, Math.max(0, d.c)),
        routed_by: `domain-router/dr.2/${MODEL}`,
        routed_at: new Date().toISOString(),
      });
    }
  }
  return { rows, unplaced };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(SB_URL, SB_KEY);
  try {
    const body = await req.json();
    const { cid, items, dry_run, program_id, holder, max_units, envelope_left } = body;
    if (!cid) throw new Error("cid required");
    const tax = await taxonomy(sb);
    const valid = new Set(tax.map(t => t.domain_key));

    // ── MODE A · direct. One batch handed in. Used for smoke tests and evaluation.
    if (Array.isArray(items) && items.length) {
      if (items.length > 40) throw new Error("batch cap is 40 items");
      const src: Src = body.src === "memory" ? "memory" : "claim";
      const routes = await routeBatch(items, tax);
      const { rows, unplaced } = rowsFor(cid, src, routes, valid);
      if (!dry_run && rows.length) {
        const { error } = await sb.from("item_domain").insert(rows);
        if (error) throw new Error("item_domain insert failed: " + error.message);
      }
      return new Response(JSON.stringify({
        ok: true, version: "dr.2", mode: "direct", model: MODEL,
        items: items.length, placements: rows.length, unplaced,
        routes: dry_run ? routes : undefined,   // dr.1 defect 2: dry_run now shows its work
        dry_run: !!dry_run,
      }), { headers: { ...cors, "content-type": "application/json" } });
    }

    // ── MODE B · worker. Drain the program's route queue until the budget says stop.
    if (!program_id || !holder) throw new Error("program_id and holder required for worker mode");
    const cap = Math.min(Number(max_units ?? 20), 100);
    let units = 0, placements = 0, unplacedAll = 0, itemsSeen = 0;
    const errors: string[] = [];

    for (;;) {
      const { data: budget } = await sb.rpc("ingest_budget", {
        p_program: program_id, p_used_units: units, p_envelope_left: Number(envelope_left ?? 1),
      });
      if (units >= cap || (budget && budget.continue === false)) {
        await sb.rpc("ingest_session_close", {
          p_program: program_id, p_holder: holder, p_units: units,
          p_items: itemsSeen, p_reason: units >= cap ? "unit_cap" : (budget?.reason ?? "budget"),
        });
        break;
      }

      const { data: claimed, error: cErr } = await sb.rpc("ingest_claim", {
        p_program: program_id, p_phase: "route", p_holder: holder, p_lease_seconds: 900,
      });
      if (cErr) throw new Error("claim failed: " + cErr.message);
      const unit = Array.isArray(claimed) ? claimed[0] : claimed;
      if (!unit) {
        await sb.rpc("ingest_session_close", {
          p_program: program_id, p_holder: holder, p_units: units,
          p_items: itemsSeen, p_reason: "queue_drained",
        });
        break;
      }

      try {
        const batch = await loadItems(sb, cid, unit.payload);
        if (!batch.length) {
          await sb.rpc("ingest_commit", {
            p_unit: unit.unit_id, p_holder: holder,
            p_position: unit.payload?.cursor ?? null, p_items: 0,
          });
        } else {
          const src: Src = unit.payload?.src === "memory" ? "memory" : "claim";
          const routes = await routeBatch(batch, tax);
          const { rows, unplaced } = rowsFor(cid, src, routes, valid);
          if (rows.length) {
            // Idempotent on retry: clear any prior placements for these ids first.
            const ids = batch.map(b => b.id);
            await sb.from("item_domain").delete()
              .eq("cid", cid).in(src === "claim" ? "claim_id" : "memory_id", ids);
            const { error } = await sb.from("item_domain").insert(rows);
            if (error) throw new Error("insert failed: " + error.message);
          }
          await sb.rpc("ingest_commit", {
            p_unit: unit.unit_id, p_holder: holder,
            p_position: unit.payload?.cursor ?? null, p_items: batch.length,
          });
          placements += rows.length; unplacedAll += unplaced; itemsSeen += batch.length;
        }
        units++;
      } catch (e) {
        errors.push(String((e as any)?.message ?? e).slice(0, 300));
        await sb.rpc("ingest_fail", {
          p_unit: unit.unit_id, p_holder: holder,
          p_error: String((e as any)?.message ?? e), p_permanent: false,
        });
        units++;
        if (errors.length >= 3) break;   // stop a poisoned run rather than burn the queue
      }
    }

    const { data: gate } = await sb.rpc("ingest_gate", { p_program: program_id });
    return new Response(JSON.stringify({
      ok: true, version: "dr.2", mode: "worker", model: MODEL,
      units, items: itemsSeen, placements, unplaced: unplacedAll,
      errors, gate,
    }), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, version: "dr.2", error: String((e as any)?.message ?? e) }),
      { status: 400, headers: { ...cors, "content-type": "application/json" } });
  }
});
