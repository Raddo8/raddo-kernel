// temporal-assessor · ta.1
// COPPS · SCHEDULE. The stage that decides what a date MEANS.
//
// The mistake this exists to correct: date extraction and date assessment are different
// jobs. Finding a date is deterministic and a regex is the right tool. Deciding whether
// missing it costs anything, and whether the principal is even the actor, is judgment.
// A regex doing judgment produced a Clock where a closed company's payroll period
// outranked a live statute of limitations. A Clock that cries wolf is worse than none.
//
// Same hardening as the domain router, for the same reasons:
//  · ORDINAL IDS. Never ask the model to transcribe a UUID; it drops segments silently.
//  · CONSENSUS. N passes with rotating framings; agreement is the label.
//  · AUDIT, NOT GUESS. Disagreement is written to a queue, never resolved by coin flip.
//  · ENFORCEMENT IN CODE. An unknown enum value is rejected, not coerced.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL  = Deno.env.get("ASSESSOR_MODEL") ?? "claude-haiku-4-5";

const cors = { "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const KINDS = new Set(["hard_deadline","scheduled_event","target","window","reference","expected_next"]);
const CONSEQ = new Set(["irreversible_loss","financial_penalty","legal_exposure","opportunity_lost","reputational","none","unknown"]);

type Item = { work_id: string; title: string; detail: string|null; subject: string|null;
              due_date: string|null; ref_date: string|null; kind: string };
type Verdict = { i: number; date_kind: string; consequence: string;
                 principal_acts: boolean; note: string; conf: number };

function system(variant: number) {
  const lens = [
    "Assess each item as the principal's chief of staff deciding what actually lands on their desk this week.",
    "Assess each item as a risk officer asking what is irreversibly lost if nothing happens.",
    "Assess each item as a docket clerk distinguishing a duty from a diary entry.",
  ][variant % 3];
  return [
    "You assess what a DATE MEANS for a person's obligations. You do not find dates; they are given.",
    lens,
    "",
    "For each item decide three things.",
    "",
    "1 · date_kind, exactly one of:",
    "   hard_deadline  · a duty with a fixed date. Missing it forecloses something.",
    "                    Statutes of limitation, filing and discovery deadlines, notice periods,",
    "                    cure periods, option windows closing, renewals that auto-extend if untouched.",
    "   scheduled_event· it happens at that time whether or not the principal acts. A trial, a",
    "                    hearing, a closing, a meeting. Attending is not the same as owing.",
    "   target         · a soft or self-imposed date. Someone intended to do it by then.",
    "   window         · a PERIOD, not a point. A pay period, a coverage term, a reporting month.",
    "                    A window that has closed is not an overdue deadline.",
    "   reference      · the date is context or is itself the thing in dispute. A docket date,",
    "                    when something happened, two conflicting dates that must be reconciled.",
    "   expected_next  · the next instalment of a recurring series, inferred from cadence.",
    "",
    "2 · consequence · what missing it actually costs:",
    "   irreversible_loss · a right, claim or option is extinguished and cannot be recovered",
    "   legal_exposure    · materially worsens a legal position without extinguishing it",
    "   financial_penalty · money is owed, charged, or forfeited",
    "   opportunity_lost  · a deal, revenue or advantage is foregone but may recur",
    "   reputational      · standing or presentation suffers",
    "   none              · nothing happens. Say this freely. Most dates cost nothing.",
    "   unknown           · the material does not say. Say this rather than inventing a cost.",
    "",
    "3 · principal_acts · true ONLY if the PRINCIPAL is the one who must do something.",
    "   If counsel, a vendor, a court, or a counterparty is the actor, this is FALSE even when",
    "   the outcome matters enormously to the principal. Knowing is not the same as doing.",
    "",
    "BINDING RULES:",
    "· Proximity is not urgency. A date next week with no consequence is not urgent.",
    "· A closed window is not an overdue deadline. Do not turn a past period into an alarm.",
    "· If the item is plainly stale, say consequence none and explain why in the note.",
    "· Never invent a consequence the material does not support. unknown is a real answer.",
    "· The note is one sentence, plain language, stating what breaks and to whom.",
    "· conf is 0.0 to 1.0, your confidence in the whole assessment.",
    "",
    "Return ONLY a JSON array, same order, no prose, no fence. Use the small integer item number:",
    '[{"i":1,"date_kind":"...","consequence":"...","principal_acts":true,"note":"...","conf":0.0}]',
  ].join("\n");
}

async function onePass(items: Item[], variant: number): Promise<Verdict[]> {
  const user = items.map((it, n) =>
    `<item i="${n+1}">\n` +
    `title: ${(it.title ?? "").slice(0,300)}\n` +
    (it.subject ? `subject: ${it.subject}\n` : "") +
    (it.detail ? `detail: ${it.detail.slice(0,600)}\n` : "") +
    (it.due_date ? `date_found: ${it.due_date}\n` : "") +
    (it.ref_date ? `date_found: ${it.ref_date}\n` : "") +
    `today: ${new Date().toISOString().slice(0,10)}\n</item>`).join("\n\n");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type":"application/json", "x-api-key":AI_KEY, "anthropic-version":"2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096,
      system: [{ type:"text", text: system(variant), cache_control:{ type:"ephemeral" } }],
      messages: [{ role:"user", content: user }] }),
  });
  if (!r.ok) throw new Error(`assessor ${r.status}: ${(await r.text()).slice(0,300)}`);
  const j = await r.json();
  const raw = (j.content?.[0]?.text ?? "").trim().replace(/^```(json)?|```$/g,"").trim();
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("assessor did not return an array");
  const out: Verdict[] = [];
  for (const v of parsed as any[]) {
    const n = Number(v?.i);
    if (!Number.isInteger(n) || n < 1 || n > items.length) continue;      // hallucinated index dropped
    if (!KINDS.has(v?.date_kind) || !CONSEQ.has(v?.consequence)) continue; // unknown enum rejected, never coerced
    out.push({ i: n, date_kind: v.date_kind, consequence: v.consequence,
      principal_acts: v.principal_acts === true,
      note: String(v.note ?? "").slice(0,300), conf: Number(v.conf ?? 0) });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(SB_URL, SB_KEY);
  try {
    const b = await req.json();
    const cid = b.cid; if (!cid) throw new Error("cid required");
    const passes = Math.min(Math.max(Number(b.passes ?? 3), 1), 5);
    const limit  = Math.min(Number(b.limit ?? 20), 40);
    const dry    = !!b.dry_run;

    const { data: rows, error } = await sb.rpc("work_unassessed", { p_cid: cid, p_limit: limit });
    if (error) throw new Error("work_unassessed failed: " + error.message);
    const items = (rows ?? []) as Item[];
    if (!items.length) return new Response(JSON.stringify({ ok:true, version:"ta.1", assessed:0, remaining:0 }),
      { headers: { ...cors, "content-type":"application/json" } });

    const runs: Verdict[][] = [];
    for (let v = 0; v < passes; v++) runs.push(await onePass(items, v));

    let assessed = 0, audited = 0;
    for (let n = 1; n <= items.length; n++) {
      const votes = runs.map(r => r.find(x => x.i === n)).filter(Boolean) as Verdict[];
      if (!votes.length) continue;
      const tally = (key: "date_kind"|"consequence") => {
        const m: Record<string, number> = {};
        votes.forEach(v => { m[v[key]] = (m[v[key]] ?? 0) + 1; });
        const best = Object.entries(m).sort((a,b) => b[1]-a[1])[0];
        return { value: best[0], votes: best[1] };
      };
      const k = tally("date_kind"), c = tally("consequence");
      const actsYes = votes.filter(v => v.principal_acts).length;
      const acts = actsYes * 2 > votes.length;
      const agreed = k.votes * 2 > votes.length && c.votes * 2 > votes.length;
      const note = (votes.find(v => v.date_kind === k.value)?.note) ?? votes[0].note;
      const conf = votes.reduce((a,v) => a + v.conf, 0) / votes.length;

      if (!dry) {
        await sb.from("work_item").update({
          date_kind: k.value, consequence: c.value, principal_acts: acts,
          consequence_note: note,
          date_basis: agreed ? `assessed · ${k.votes}/${votes.length} agree` : `assessed · SPLIT ${k.votes}/${votes.length}`,
        }).eq("work_id", items[n-1].work_id);

        if (!agreed) {
          await sb.from("route_audit").insert({
            cid, claim_id: null, memory_id: null, domain_key: "network",
            votes: k.votes, passes: votes.length, mean_conf: conf,
            reason: `temporal split on ${items[n-1].work_id}: kind ${k.value} ${k.votes}/${votes.length}, consequence ${c.value} ${c.votes}/${votes.length}`,
          }).then(() => {}, () => {});
          audited++;
        }
      }
      assessed++;
    }

    if (!dry) await sb.rpc("work_rescore", { p_cid: cid });
    const { data: left } = await sb.rpc("work_unassessed_count", { p_cid: cid });

    return new Response(JSON.stringify({ ok:true, version:"ta.1", model:MODEL, passes,
      assessed, split_to_audit: audited, remaining: left ?? null, dry_run: dry }),
      { headers: { ...cors, "content-type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, version:"ta.1", error:String((e as any)?.message ?? e) }),
      { status:400, headers: { ...cors, "content-type":"application/json" } });
  }
});
