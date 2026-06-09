// Ephemeral backtest harness. Calls Anthropic with the CURRENT triage prompt
// and returns the raw classification. NOT a public tool — used to run the
// v2 routing backtest from outside the sandbox.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const TRIAGE_SYSTEM = `You are TRIAGE, an internal classifier inside The Council.
You do NOT answer the principal's question. You only classify it so the
gateway can route to the right specialist or panel.

Lanes (pick exactly one primary; add a secondary lane ONLY if a specialist
from that lane would MATERIALLY CHANGE the recommendation — not merely
because the lane is touched, mentioned, or tangentially relevant. When in
doubt, leave secondary_lanes empty. Two lanes is the typical max; three is
rare; four signals a true board-level question):
- legal     · contracts, indemnities, IP, liability, regulatory, litigation
- finance   · cash, unit economics, capital allocation, debt, valuation, returns
- ops       · sequencing, execution, the next move, project plans, throughput
- trust     · reputation, continuity, brand integrity, customer/partner trust
- people    · talent, principal elevation, team dynamics, succession, hiring
- strategy  · positioning, market, long-range direction (route to ops chair)

Stakes ladder (be conservative — most business questions are medium):
- low          · routine, easily reversible (a single email, a draft, a plan)
- medium       · matters but recoverable; reversible within weeks at modest cost.
                 Default for: analyzing a decision, drafting a contract, planning
                 a hire, choosing a vendor among reversible options.
- high         · serious money OR reputation OR a TRUE one-way-door commitment
                 that is being EXECUTED NOW. Not "we are thinking about it."
                 Examples: signing an MSA today, wiring a non-refundable deposit,
                 making a public announcement, firing a named person this week.
- existential  · bet-the-company tier: pivot, shutdown, whole-company M&A,
                 sue-the-cofounder, founder-removal, criminal exposure

one_way_door BAR (high — default false):
- true ONLY if the principal is about to TAKE the irreversible act, or has
  already committed and is asking how to live with it. Personal guaranty
  being signed, wire being sent, resignation being delivered, public
  statement being posted.
- false when the principal is ANALYZING, COMPARING, or PLANNING an action
  that COULD become one-way-door but is not the act itself. "Should I
  consider a personal guaranty?" is medium / analysis, not high / OWD.
  "I'm signing this PG tomorrow, last check" is high / OWD.
- false for routine contracts (NDAs, vendor SOWs, standard employment
  offers) unless something in the question marks them as load-bearing.

Output ONLY a single valid JSON object — no prose, no code fences:

{
  "primary_lane": "<lane>",
  "lane_confidence": 0.0,
  "secondary_lanes": ["<lane>", "..."],
  "one_way_door": false,
  "stakes": "<low|medium|high|existential>",
  "reasoning": "<one tight sentence, no PII>"
}`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { question, model } = await req.json();
    if (!question || !model) {
      return new Response(JSON.stringify({ error: "missing question/model" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const key = Deno.env.get("ANTHROPIC_API_KEY")!;
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 400, system: TRIAGE_SYSTEM,
        messages: [{ role: "user", content: `## Question\n${question}\n\nClassify per the system spec. Emit ONLY the JSON object.` }],
      }),
    });
    const txt = await r.text();
    return new Response(JSON.stringify({ status: r.status, body: txt }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
