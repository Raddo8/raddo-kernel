// supabase/functions/mcp-council/convene-router.ts
//
// Stage B · Convene Routing.
//
// Fast Haiku-class triage that decides how DEEP a convene_council call
// should go. Sits in front of the existing parallel fan-out so most
// convenes run 1–3 chairs instead of the full standing 6.
//
// Hard rules:
//   · Own timeout (~8s). Never blocks the fan-out for more than that.
//   · On ANY error / timeout / empty output → caller falls back to the
//     known-good full-6 convene (quality-safe).
//   · HARD CAP of 6 synchronous chairs regardless of router output.
//   · Router NEVER answers the question. Classify only.

export const STANDING_FORCES = [
  "aims",     // DIRECTION — strategy / vision / intent
  "leo",      // EXECUTION — ops / sequencing / feasibility
  "lucius",   // ECONOMICS — finance / unit economics / growth macro
  "knox",     // GUARDIAN — legal / risk / lines we don't cross
  "marcus",   // HUMAN — principal / team / how it lands on people
  "alfred",   // CONTINUITY — trust / reputation / brand / the record
] as const;

export const BENCH_SPECIALISTS = ["felix"] as const; // growth depth (bench)

export type Force = (typeof STANDING_FORCES)[number];
export type Specialist = (typeof BENCH_SPECIALISTS)[number];

export type Consequence =
  | "trivial" | "low" | "medium" | "high" | "one_way_door";

export type ConveneMode = "single" | "panel" | "full";

export type RoutingDecision = {
  consequence: Consequence;
  forces: Force[];          // ranked by relevance
  specialists: Specialist[];
  run_dissent: boolean;
  rationale: string;
  // Derived (filled by routeConvene):
  mode: ConveneMode;
  chairs: string[];         // final ≤6 chair ids in fan-out order
  triage_ms: number;
  triage_fallback: boolean;
  router_model?: string;
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ROUTER_MODEL = Deno.env.get("MCP_CONVENE_ROUTER_MODEL") ?? "claude-haiku-4-5";
const ROUTER_TIMEOUT_MS = 8_000;
const ROUTER_MAX_TOKENS = 350;
const CHAIR_CAP = 6;

const ROUTER_SYSTEM = `You are CONVENE-ROUTER, an internal dispatcher for a decision-governance
council. You do NOT answer the principal's question. You only decide which
standing forces (chairs) the question needs and how deep the deliberation
should go. Bias toward FEWER chairs · the lightest mode that fits the stakes.

Standing forces (pick the ones that materially change the recommendation):
- aims    · DIRECTION   · is this the right bet · strategy · vision · intent
- leo     · EXECUTION   · can we do it · how · sequencing · feasibility · ops
- lucius  · ECONOMICS   · does it make money & grow · finance · unit economics
- knox    · GUARDIAN    · legal · risk · lines we don't cross
- marcus  · HUMAN       · the principal · team · how it lands on people
- alfred  · CONTINUITY  · trust · reputation · brand · the record

Bench specialists (summon ONLY if the crux needs that depth · count vs cap):
- felix   · GROWTH depth · demand · GTM · channels · pricing-for-growth

Consequence ladder · drives DEPTH:
- trivial / low      → SINGLE  · 1 best-fit force only · run_dissent=false
- medium             → PANEL   · 2–3 forces · run_dissent optional
- high / one_way_door→ FULL    · selected forces up to 6 · run_dissent=true

one_way_door = a true irreversible commit being decided (signing a PG,
firing a co-founder, wiring a non-refundable deposit, accepting an offer).
Pure analysis of a clause or scenario is NOT one_way_door.

Output ONLY a single valid JSON object · no prose · no code fences:

{
  "consequence": "trivial|low|medium|high|one_way_door",
  "forces": ["<force>", "..."],
  "specialists": ["<specialist>", "..."],
  "run_dissent": false,
  "rationale": "<one tight sentence>"
}

Rank forces by relevance (most relevant first). Two forces is the typical
medium · three is common · four+ only when the question genuinely spans
the board. If you list more than 6 entries total (forces + specialists),
the dispatcher will keep the top 6 by your ranking.`;

function extractJson(s: string): any {
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("router_unparseable");
  return JSON.parse(t.slice(a, b + 1));
}

function normConsequence(x: any): Consequence {
  const v = typeof x === "string" ? x.trim().toLowerCase() : "";
  if (v === "trivial" || v === "low" || v === "medium" ||
      v === "high" || v === "one_way_door") return v;
  return "medium";
}

function normForces(xs: any): Force[] {
  if (!Array.isArray(xs)) return [];
  const seen = new Set<Force>();
  const out: Force[] = [];
  for (const raw of xs) {
    const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if ((STANDING_FORCES as readonly string[]).includes(v) && !seen.has(v as Force)) {
      seen.add(v as Force);
      out.push(v as Force);
    }
  }
  return out;
}

function normSpecialists(xs: any): Specialist[] {
  if (!Array.isArray(xs)) return [];
  const seen = new Set<Specialist>();
  const out: Specialist[] = [];
  for (const raw of xs) {
    const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if ((BENCH_SPECIALISTS as readonly string[]).includes(v) && !seen.has(v as Specialist)) {
      seen.add(v as Specialist);
      out.push(v as Specialist);
    }
  }
  return out;
}

async function callRouter(question: string, context: string): Promise<{ raw: string; model: string }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("upstream_unavailable");
  const ctxBlock = context && context.trim() ? `\n\n## Context\n${context.trim().slice(0, 4000)}` : "";
  const user = `## Question\n${question.trim().slice(0, 4000)}${ctxBlock}\n\nClassify per the system spec. Emit ONLY the JSON object.`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ROUTER_TIMEOUT_MS) as unknown as number;
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ROUTER_MODEL,
        max_tokens: ROUTER_MAX_TOKENS,
        system: ROUTER_SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!r.ok) throw new Error(`router_http_${r.status}`);
    const json = await r.json();
    const blocks = Array.isArray(json?.content) ? json.content : [];
    const text = blocks
      .filter((b: any) => b?.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text).join("\n").trim();
    if (!text) throw new Error("router_empty");
    return { raw: text, model: ROUTER_MODEL };
  } finally {
    clearTimeout(t);
  }
}

function fallbackDecision(reason: string, triage_ms: number): RoutingDecision {
  // Quality-safe default: full standing 6 + dissent.
  return {
    consequence: "high",
    forces: [...STANDING_FORCES],
    specialists: [],
    run_dissent: true,
    rationale: `triage_fallback:${reason}`,
    mode: "full",
    chairs: [...STANDING_FORCES],
    triage_ms,
    triage_fallback: true,
  };
}

export async function routeConvene(
  question: string,
  context: string,
): Promise<RoutingDecision> {
  const t0 = Date.now();
  let raw: string;
  let model: string;
  try {
    const r = await callRouter(question, context);
    raw = r.raw; model = r.model;
  } catch (e) {
    return fallbackDecision((e as Error)?.message ?? "router_error", Date.now() - t0);
  }

  let parsed: any;
  try { parsed = extractJson(raw); }
  catch { return fallbackDecision("unparseable", Date.now() - t0); }

  const consequence = normConsequence(parsed.consequence);
  let forces = normForces(parsed.forces);
  let specialists = normSpecialists(parsed.specialists);
  const run_dissent =
    typeof parsed.run_dissent === "boolean"
      ? parsed.run_dissent
      : (consequence === "high" || consequence === "one_way_door");
  const rationale = typeof parsed.rationale === "string"
    ? parsed.rationale.slice(0, 240)
    : "";

  // Zero forces → general 3-force panel default.
  if (forces.length === 0) {
    forces = ["aims", "leo", "lucius"];
  }

  // Derive mode from consequence (lightest that fits).
  let mode: ConveneMode;
  if (consequence === "trivial" || consequence === "low") mode = "single";
  else if (consequence === "medium") mode = "panel";
  else mode = "full";

  // Build chair list per mode · forces ranked first, specialists appended.
  let chairs: string[];
  if (mode === "single") {
    chairs = [forces[0]];
  } else if (mode === "panel") {
    // 2–3 chairs · prefer the top-ranked. Add a specialist only if the
    // router explicitly named one AND a panel slot remains.
    const seed = forces.slice(0, 3);
    chairs = [...seed];
    for (const s of specialists) {
      if (chairs.length >= 3) break;
      if (!chairs.includes(s)) chairs.push(s);
    }
    if (chairs.length < 2) {
      // Degenerate panel · top up from standing forces.
      for (const f of STANDING_FORCES) {
        if (chairs.length >= 2) break;
        if (!chairs.includes(f)) chairs.push(f);
      }
    }
  } else {
    // FULL · forces + specialists, capped at 6, ranking preserved.
    chairs = [];
    for (const f of forces) {
      if (chairs.length >= CHAIR_CAP) break;
      if (!chairs.includes(f)) chairs.push(f);
    }
    for (const s of specialists) {
      if (chairs.length >= CHAIR_CAP) break;
      if (!chairs.includes(s)) chairs.push(s);
    }
  }

  // HARD CAP (belt + suspenders).
  if (chairs.length > CHAIR_CAP) chairs = chairs.slice(0, CHAIR_CAP);

  return {
    consequence,
    forces,
    specialists,
    run_dissent,
    rationale,
    mode,
    chairs,
    triage_ms: Date.now() - t0,
    triage_fallback: false,
    router_model: model,
  };
}
