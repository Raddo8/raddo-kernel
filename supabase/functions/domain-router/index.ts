// domain-router · dr.4
// Adds the self-supervising quality loop. The client is never the labeller.
//
// Changes from dr.2:
//  1. NETWORK REBALANCE. dr.2's prompt over-corrected: it suppressed the relationships
//     domain so hard that it missed 21 of 21 legitimate co-assignments in evaluation.
//     Relationships is now explicitly LEGITIMATE as a co-domain and forbidden only as a
//     sole fallback. The rule is about it being a LAST resort, never about it being rare.
//  2. RECALL PUSH. dr.2 ran at 1.95 domains per item against 2.48 by careful hand.
//     Under-assignment leaves folders emptier than the truth, which is the one failure
//     this product cannot have. The prompt now names the evidence tests explicitly.
//  3. CONSENSUS. N independent passes. Agreement is the label. Disagreement is a queue.
//     This is how ground truth gets manufactured without spending the client's hours.
//  4. SCOPE GATE (dr.4). An adversarial audit of dr.3 found the personal domains firing on
//     the literal word rather than the subject: a prospect's family, an adversary's divorce
//     and the figurative "the family's own network" all landed in the principal's household
//     folder at 0.75 to 0.89 confidence. Prompt wording alone is not enough, because the
//     failure IS a wording-level trigger. So the model must now declare WHOSE each personal
//     domain is, and the server DROPS any personal domain not scoped to the principal.
//     Judgment stays with the model; enforcement is deterministic.
//  5. SUBSTANCE-BEFORE-ORBIT (dr.4). 'network' may never stand alone. If a pass returns
//     network with no substance domain, the server withholds it and files an audit rather
//     than accepting a parking-spot placement.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL  = Deno.env.get("ROUTER_MODEL") ?? "claude-haiku-4-5";

const cors = { "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
type Src = "claim" | "memory";
type Item = { id: string; src: Src; kind: string; title: string; body: string; occurred?: string };
type Dom = { d: string; c: number; whose?: string };
type Route = { id: string; domains: Dom[]; why: string };

async function taxonomy(sb: any) {
  const { data, error } = await sb.from("domain_taxonomy")
    .select("domain_key,label,definition,scope").order("ordinal");
  if (error) throw new Error("taxonomy read failed: " + error.message);
  return data as any[];
}

function buildSystem(tax: any[], variant: number) {
  const biz = tax.filter(t => t.scope !== "personal");
  const per = tax.filter(t => t.scope === "personal");
  const lens = [
    "Read each item as an archivist deciding which folders it must be filed in.",
    "Read each item as an investigator asking which parts of this person's world it touches.",
    "Read each item as an auditor asking which areas would be incomplete without it.",
  ][variant % 3];
  return [
    "You route a principal's material into a fixed taxonomy of life-and-business domains.",
    lens,
    "",
    "BUSINESS AND SHARED DOMAINS:",
    ...biz.map(t => `${t.domain_key} · ${t.label} · ${t.definition}`),
    "",
    "PERSONAL DOMAINS · a principal is a whole person, not only an operator.",
    "Family, faith, children's schooling and sport, health and travel are FIRST CLASS material.",
    ...per.map(t => `${t.domain_key} · ${t.label} · ${t.definition}`),
    "",
    "RULES, binding:",
    "1. Routing is MANY-TO-MANY and UNDER-ASSIGNMENT IS THE COSTLY ERROR.",
    "   A missed domain leaves a folder emptier than the truth and the principal never learns why.",
    "   Most real material belongs to TWO OR THREE domains. If you have written only one,",
    "   look again before you finish. Do not pad, but do not be stingy.",
    "2. EVIDENCE TESTS. Apply each one to every item:",
    "   · names an amount, payment, invoice, balance or transfer  -> cash almost certainly applies",
    "   · names a court, docket, counsel, filing, claim or statute -> legal almost certainly applies",
    "   · names a lease, landlord, premises, or square footage     -> property almost certainly applies",
    "   · names equity, members, notes, investors or distributions -> capital almost certainly applies",
    "   · names payroll, employment, hiring or benefits            -> people almost certainly applies",
    "   · names a child, spouse, parent or the household           -> family almost certainly applies",
    "   These are tests, not commands. If the evidence is there, the domain belongs.",
    "3. RELATIONSHIPS is a REAL and FREQUENTLY CORRECT domain. A named person or institution",
    "   in the principal's orbit genuinely belongs there IN ADDITION to the substance domain.",
    "   An opposing investor is legal AND relationships. A lender is capital AND relationships.",
    "   The ONLY prohibition: never use relationships as the SOLE domain to avoid deciding.",
    "   If relationships is your only answer, either find the substance domain or return empty.",
    "4. Personal life has its own homes. A child's school is education and family.",
    "   A coaching commitment is interests and family. Faith practice is interests, and giving",
    "   where money or service is involved. Never sweep these into relationships.",
    "5. Confidence 0.0 to 1.0 per domain. Below 0.35 means do not assign it.",
    "6. Route on what the material IS ABOUT, never on who sent it or how it arrived.",
    "7. Never invent. Classify the text you were given, nothing more. An honest empty is correct.",
    "",
    "THE SCOPE AND ABOUTNESS GATE · run this BEFORE you emit anything:",
    "A. WHOSE IS IT. The personal domains belong to THE PRINCIPAL and their household only.",
    "   A prospect's family is customers and relationships. An adversary's divorce is legal.",
    "   A client's golf is customers. A metaphor ('the family's own network') is not family at all.",
    "   For every personal domain you assign, you MUST state whose it is in the 'whose' field:",
    "   'principal' when it is the principal or their household, otherwise 'other'.",
    "   If you cannot tell, say 'other'. An honest 'other' costs nothing; a wrong 'principal' is a lie",
    "   about someone's own life.",
    "B. SUBSTANCE BEFORE ORBIT. Before you write 'network', answer this silently: what domain",
    "   would this claim take if no person were named in it? Emit THAT domain too.",
    "   Founding a company is capital. Hiring seven people is people. A CEO dying is people.",
    "   Opening an office is strategy or operations. If the only answer you have is 'network',",
    "   you have not finished thinking. Never return network alone.",
    "C. LOCATION IS ALWAYS TRAVEL. A named residence, a stated home, a move, a trip, a week away,",
    "   or 'out of town' is travel IN ADDITION to whatever else it is. This domain is currently",
    "   empty across the whole corpus, which means location language is being missed everywhere.",
    "",
    "",
    "Return ONLY a JSON array, same order, no prose, no markdown fence:",
    '[{"id":"<id>","domains":[{"d":"<domain_key>","c":0.0,"whose":"principal|other"}],"why":"<12 words max>"}]',
  ].join("\n");
}

async function onePass(items: Item[], tax: any[], variant: number): Promise<Route[]> {
  const user = items.map(i =>
    `<item id="${i.id}" kind="${i.kind}"${i.occurred ? ` occurred="${i.occurred}"` : ""}>\n` +
    `${(i.title ?? "").slice(0, 300)}\n${(i.body ?? "").slice(0, 1800)}\n</item>`).join("\n\n");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": AI_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096,
      system: [{ type: "text", text: buildSystem(tax, variant), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`router ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const raw = (j.content?.[0]?.text ?? "").trim().replace(/^```(json)?|```$/g, "").trim();
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("router did not return an array");
  return parsed as Route[];
}

// CONSENSUS · agreement is the label, disagreement is a queue.
// A domain seen in a majority of passes is accepted outright.
// A domain seen in a minority is accepted only if it was held with real confidence,
// and either way the disagreement is written to route_audit so it can be resolved
// later by evidence, by the client's ordinary behaviour, or by one question in chat.
type Merged = { id: string; keep: { d: string; c: number; votes: number }[];
                audit: { d: string; votes: number; mean: number; reason: string }[] };
const PERSONAL = new Set(["family","health","education","giving","estate","travel","interests"]);
function merge(passes: Route[][], n: number, personal: Set<string>): Merged[] {
  const byId = new Map<string, Map<string, number[]>>();
  for (const p of passes) for (const r of p ?? []) {
    if (!byId.has(r.id)) byId.set(r.id, new Map());
    const m = byId.get(r.id)!;
    for (const d of r.domains ?? []) {
      if (!(d.c >= 0.35)) continue;
      // SCOPE GATE, enforced. A personal domain not scoped to the principal is dropped
      // outright rather than argued with. This is the dr.3 defect class, killed in code.
      if (personal.has(d.d) && (d.whose ?? "other") !== "principal") continue;
      if (!m.has(d.d)) m.set(d.d, []);
      m.get(d.d)!.push(d.c);
    }
  }
  const out: Merged[] = [];
  for (const [id, m] of byId) {
    const keep: any[] = [], audit: any[] = [];
    for (const [d, cs] of m) {
      const votes = cs.length, mean = cs.reduce((a, b) => a + b, 0) / votes;
      if (votes * 2 > n) keep.push({ d, c: +(mean * (0.85 + 0.15 * votes / n)).toFixed(2), votes });
      else if (mean >= 0.75) { keep.push({ d, c: +(mean * 0.7).toFixed(2), votes });
        audit.push({ d, votes, mean: +mean.toFixed(2), reason: "minority but confident" }); }
      else audit.push({ d, votes, mean: +mean.toFixed(2), reason: "minority and uncertain" });
    }
    // SUBSTANCE BEFORE ORBIT, enforced. network alone is never a placement.
    const kept = keep.filter(k => k.d !== "network");
    if (!kept.length && keep.some(k => k.d === "network")) {
      const n0 = keep.find(k => k.d === "network")!;
      audit.push({ d: "network", votes: n0.votes, mean: n0.c, reason: "network alone, withheld" });
      out.push({ id, keep: [], audit });
      continue;
    }
    out.push({ id, keep, audit });
  }
  return out;
}

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
    return (data ?? []).map((r: any) => ({ id: r.id, src, kind: r.predicate ?? "claim",
      title: names[r.subject_id] ?? "", body: r.value_text ?? "", occurred: r.observed_at ?? undefined }));
  }
  const { data, error } = await sb.from("memory_entries")
    .select("id,title,body_md,kind,occurred_at").eq("cid", cid).in("id", ids);
  if (error) throw new Error("memory load failed: " + error.message);
  return (data ?? []).map((r: any) => ({ id: r.id, src, kind: r.kind ?? "memory",
    title: r.title ?? "", body: r.body_md ?? "", occurred: r.occurred_at ?? undefined }));
}

async function routeAndWrite(sb: any, cid: string, src: Src, batch: Item[], tax: any[],
                             passes: number, valid: Set<string>, dry: boolean) {
  const runs: Route[][] = [];
  for (let v = 0; v < passes; v++) runs.push(await onePass(batch, tax, v));
  const merged = merge(runs, passes, PERSONAL);
  const rows: any[] = [], audits: any[] = [];
  let unplaced = 0;
  for (const m of merged) {
    const keep = m.keep.filter(k => valid.has(k.d));
    if (!keep.length) unplaced++;
    for (const k of keep) rows.push({ cid,
      claim_id:  src === "claim"  ? m.id : null,
      memory_id: src === "memory" ? m.id : null,
      domain_key: k.d, confidence: Math.min(1, Math.max(0, k.c)),
      routed_by: `domain-router/dr.4/${MODEL}/p${passes}`, routed_at: new Date().toISOString() });
    for (const a of m.audit.filter(a => valid.has(a.d))) audits.push({ cid,
      claim_id:  src === "claim"  ? m.id : null,
      memory_id: src === "memory" ? m.id : null,
      domain_key: a.d, votes: a.votes, passes, mean_conf: a.mean, reason: a.reason });
  }
  if (!dry) {
    const ids = batch.map(b => b.id);
    const col = src === "claim" ? "claim_id" : "memory_id";
    await sb.from("item_domain").delete().eq("cid", cid).in(col, ids);
    await sb.from("route_audit").delete().eq("cid", cid).in(col, ids);
    if (rows.length) { const { error } = await sb.from("item_domain").insert(rows);
      if (error) throw new Error("insert failed: " + error.message); }
    if (audits.length) await sb.from("route_audit").insert(audits);
  }
  return { rows, audits, unplaced, merged };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(SB_URL, SB_KEY);
  try {
    const b = await req.json();
    const { cid, items, dry_run, program_id, holder, max_units, envelope_left } = b;
    if (!cid) throw new Error("cid required");
    const passes = Math.min(Math.max(Number(b.passes ?? 1), 1), 5);
    const tax = await taxonomy(sb);
    const valid = new Set(tax.map((t: any) => t.domain_key));

    if (Array.isArray(items) && items.length) {
      if (items.length > 40) throw new Error("batch cap is 40 items");
      const src: Src = b.src === "memory" ? "memory" : "claim";
      const r = await routeAndWrite(sb, cid, src, items, tax, passes, valid, !!dry_run);
      return new Response(JSON.stringify({ ok: true, version: "dr.4", mode: "direct",
        model: MODEL, passes, items: items.length, placements: r.rows.length,
        audits: r.audits.length, unplaced: r.unplaced,
        routes: dry_run ? r.merged : undefined, dry_run: !!dry_run }),
        { headers: { ...cors, "content-type": "application/json" } });
    }

    if (!program_id || !holder) throw new Error("program_id and holder required for worker mode");
    const cap = Math.min(Number(max_units ?? 20), 100);
    let units = 0, placements = 0, auditsN = 0, unplacedAll = 0, itemsSeen = 0;
    const errors: string[] = [];
    for (;;) {
      const { data: budget } = await sb.rpc("ingest_budget", { p_program: program_id,
        p_used_units: units, p_envelope_left: Number(envelope_left ?? 1) });
      if (units >= cap || (budget && budget.continue === false)) {
        await sb.rpc("ingest_session_close", { p_program: program_id, p_holder: holder,
          p_units: units, p_items: itemsSeen, p_reason: units >= cap ? "unit_cap" : (budget?.reason ?? "budget") });
        break;
      }
      const { data: claimed, error: cErr } = await sb.rpc("ingest_claim", { p_program: program_id,
        p_phase: "route", p_holder: holder, p_lease_seconds: 900 });
      if (cErr) throw new Error("claim failed: " + cErr.message);
      const unit = Array.isArray(claimed) ? claimed[0] : claimed;
      if (!unit) {
        await sb.rpc("ingest_session_close", { p_program: program_id, p_holder: holder,
          p_units: units, p_items: itemsSeen, p_reason: "queue_drained" });
        break;
      }
      try {
        const batch = await loadItems(sb, cid, unit.payload);
        if (!batch.length) {
          await sb.rpc("ingest_commit", { p_unit: unit.unit_id, p_holder: holder,
            p_position: unit.payload?.cursor ?? null, p_items: 0 });
        } else {
          const src: Src = unit.payload?.src === "memory" ? "memory" : "claim";
          const r = await routeAndWrite(sb, cid, src, batch, tax, passes, valid, false);
          await sb.rpc("ingest_commit", { p_unit: unit.unit_id, p_holder: holder,
            p_position: unit.payload?.cursor ?? null, p_items: batch.length });
          placements += r.rows.length; auditsN += r.audits.length;
          unplacedAll += r.unplaced; itemsSeen += batch.length;
        }
        units++;
      } catch (e) {
        errors.push(String((e as any)?.message ?? e).slice(0, 300));
        await sb.rpc("ingest_fail", { p_unit: unit.unit_id, p_holder: holder,
          p_error: String((e as any)?.message ?? e), p_permanent: false });
        units++;
        if (errors.length >= 3) break;
      }
    }
    const { data: gate } = await sb.rpc("ingest_gate", { p_program: program_id });
    return new Response(JSON.stringify({ ok: true, version: "dr.4", mode: "worker", model: MODEL,
      passes, units, items: itemsSeen, placements, audits: auditsN, unplaced: unplacedAll, errors, gate }),
      { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, version: "dr.4", error: String((e as any)?.message ?? e) }),
      { status: 400, headers: { ...cors, "content-type": "application/json" } });
  }
});
