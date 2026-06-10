// supabase/functions/mcp-council/triage.ts
//
// Internal classifier. NOT a public MCP tool.
// Cheap Haiku-class call: classify only, never answer.
// Output drives mode selection (solo · panel · council) under the gates in §0
// of the routing plan. Council is reserved for existential or ≥3-lane fanout.

import { ROUTING_CONFIG, type Lane, type Mode, type Stakes } from "./routing-config.ts";


const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const TRIAGE_MODEL = Deno.env.get("MCP_TRIAGE_MODEL") ?? "claude-haiku-4-5";
const TRIAGE_FALLBACK = "claude-sonnet-4-5";
const TRIAGE_MAX_TOKENS = 400;

const VALID_LANES: Lane[] = ["legal", "finance", "ops", "trust", "people", "strategy"];
const VALID_STAKES: Stakes[] = ["low", "medium", "high", "existential"];

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

one_way_door AXIS · commit-decision vs. pure analysis:
- true whenever the question is a DECISION TO COMMIT to an irreversible act,
  even if the principal is only weighing it. The axis is "is this question
  about whether to do the irreversible thing," not "is the principal signing
  right now." Examples that are TRUE:
    · "Should I personally guarantee this lease?"
    · "Should we accept the acquisition offer?"
    · "Should I fire my co-founder?"
    · "Should we wire the non-refundable deposit?"
    · "I'm signing the PG tomorrow — last check."
- false ONLY for PURE ANALYSIS that does not itself decide the commit:
    · "Is this indemnity clause standard?"
    · "What's market for a Series A SAFE cap?"
    · "Explain how an MSA termination-for-convenience clause works."
    · "Is this NDA reasonable?" (analysis of a routine doc, not a commit)
- When in doubt between "weighing a commit" and "analyzing a clause," prefer
  true. The cost of a missed OWD is far higher than an over-cautious panel.


SUBDOMAIN DETECTION (capability-gap signal · deterministic ledger feed):
If answering at expert depth requires a specialist sub-domain beyond the
seated function head's generalist range, name it from the controlled list
and set gap_reason="capability". If the question is squarely in the head's
lane and only lacks the principal's own figures / documents / inputs, set
detected_subdomain=null and gap_reason="data". A request for the principal's
own numbers is NOT a capability gap. When unsure between capability and data,
prefer "data" (conservative — avoids polluting the ledger with false gaps).
If the question is clean in-scope with no gap, set both null.

Controlled sub-domain vocabulary (use exactly one or null):
"re-finance" · "quant-modeling" · "derivatives" · "tax" · "vc-captable" ·
"securities" · "employment-law" · "privacy-intl" · "ip-patents" ·
"antitrust" · "comp-design" · "supply-chain" · "engineering" · "security" ·
"marketing" · "risk-esg" · "industry:<name>" (e.g. "industry:restaurants")

Output ONLY a single valid JSON object — no prose, no code fences:

{
  "primary_lane": "<lane>",
  "lane_confidence": 0.0,
  "secondary_lanes": ["<lane>", "..."],
  "one_way_door": false,
  "stakes": "<low|medium|high|existential>",
  "detected_subdomain": null,
  "gap_reason": null,
  "reasoning": "<one tight sentence, no PII>"
}

lane_confidence is your honest 0–1 score that primary_lane is the right
primary lane. Be candid. If two lanes tie, set primary to the heavier one
and put the other in secondary_lanes with low confidence.`;

export type GapReason = "capability" | "data" | null;

export type TriageDecision = {
  primary_lane: Lane;
  lane_confidence: number;
  secondary_lanes: Lane[];
  one_way_door: boolean;
  stakes: Stakes;
  detected_subdomain: string | null;
  gap_reason: GapReason;
  recommended_mode: Mode;
  chairs: string[];           // specialist ids in order
  reasoning: string;
  gates_fired: string[];      // which mode-selection gate fired (A0/A1/A2/B/none)
};

// Controlled sub-domain vocabulary (matches the triage prompt).
const SUBDOMAIN_PREFIX_OK = ["industry:"];
const SUBDOMAIN_VOCAB = new Set<string>([
  "re-finance", "quant-modeling", "derivatives", "tax", "vc-captable",
  "securities", "employment-law", "privacy-intl", "ip-patents",
  "antitrust", "comp-design", "supply-chain", "engineering", "security",
  "marketing", "risk-esg",
]);

function normalizeSubdomain(x: any): string | null {
  if (typeof x !== "string") return null;
  const v = x.trim().toLowerCase();
  if (!v || v === "null" || v === "none") return null;
  if (SUBDOMAIN_VOCAB.has(v)) return v;
  for (const pfx of SUBDOMAIN_PREFIX_OK) {
    if (v.startsWith(pfx) && v.length > pfx.length) return v;
  }
  return null;
}

function normalizeGapReason(x: any): GapReason {
  if (typeof x !== "string") return null;
  const v = x.trim().toLowerCase();
  if (v === "capability" || v === "data") return v;
  return null;
}

// Lane → specialist id. Legal seat collapsed to single seat (KNOX).
function laneToId(lane: Lane, _tenant: string): string {
  switch (lane) {
    case "legal": return "knox";
    case "finance": return "lucius";
    case "ops": return "leo";
    case "trust": return "alfred";
    case "people": return "iroh";
    case "strategy": return "leo";  // strategy is solo-capable via Leo
  }
}

const FULL_BOARD_IDS = ["leo", "spock", "lucius", "alfred", "iroh"];

function fullBoardWithLegal(_tenant: string): string[] {
  return [...FULL_BOARD_IDS, "knox"];
}

function extractJson(s: string): any {
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("triage_unparseable");
  return JSON.parse(t.slice(first, last + 1));
}

async function callAnthropicTriage(model: string, user: string): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("upstream_unavailable");
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: TRIAGE_MAX_TOKENS,
      system: TRIAGE_SYSTEM,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error("upstream_failed");
  const json = await r.json();
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const text = blocks
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text).join("\n").trim();
  if (!text) throw new Error("upstream_empty");
  return text;
}

function normalizeLane(x: any): Lane | null {
  if (typeof x !== "string") return null;
  const v = x.trim().toLowerCase();
  return (VALID_LANES as string[]).includes(v) ? (v as Lane) : null;
}

function normalizeStakes(x: any): Stakes {
  if (typeof x !== "string") return "medium";
  const v = x.trim().toLowerCase();
  return (VALID_STAKES as string[]).includes(v) ? (v as Stakes) : "medium";
}

export async function triage(
  question: string,
  context: string,
  tenant: string,
): Promise<TriageDecision> {
  const ctxBlock = context && context.trim()
    ? `\n\n## Context\n${context.trim()}`
    : "";
  const user = `## Question\n${question.trim()}${ctxBlock}\n\nClassify per the system spec. Emit ONLY the JSON object.`;

  let raw: string;
  try {
    raw = await callAnthropicTriage(TRIAGE_MODEL, user);
  } catch (_e) {
    raw = await callAnthropicTriage(TRIAGE_FALLBACK, user);
  }

  let parsed: any;
  try { parsed = extractJson(raw); } catch {
    // Fail-safe: when triage breaks, default to panel-min on finance+legal
    // (conservative — never solo on a missed classification).
    return applyGates({
      primary_lane: "ops",
      lane_confidence: 0.5,
      secondary_lanes: [],
      one_way_door: false,
      stakes: "medium",
      detected_subdomain: null,
      gap_reason: null,
      reasoning: "triage_unparseable_default",
    }, tenant);
  }

  const primary = normalizeLane(parsed.primary_lane) ?? "ops";
  const secRaw = Array.isArray(parsed.secondary_lanes) ? parsed.secondary_lanes : [];
  const secondaries = (secRaw.map(normalizeLane).filter(Boolean) as Lane[])
    .filter((l) => l !== primary);
  // dedupe
  const seen = new Set<Lane>();
  const secondary_lanes = secondaries.filter((l) => {
    if (seen.has(l)) return false;
    seen.add(l); return true;
  });
  const lane_confidence = Math.max(0, Math.min(1, Number(parsed.lane_confidence) || 0));
  const one_way_door = !!parsed.one_way_door;
  const stakes = normalizeStakes(parsed.stakes);
  let detected_subdomain = normalizeSubdomain(parsed.detected_subdomain);
  let gap_reason = normalizeGapReason(parsed.gap_reason);
  // Coherence v2 · Capability dominates data. When a specialist sub-domain
  // is named (outside the seated head's range), that IS a capability gap
  // even if the principal's own figures are also missing. Only fall to
  // "data" when no sub-domain was named and the question is in-lane but
  // lacking the principal's inputs (e.g., "what's our runway").
  if (detected_subdomain) {
    gap_reason = "capability";
  } else if (gap_reason === "capability") {
    // capability without a named subdomain is incoherent · drop to null.
    gap_reason = null;
  }
  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 240) : "";

  return applyGates({
    primary_lane: primary, lane_confidence, secondary_lanes,
    one_way_door, stakes, detected_subdomain, gap_reason, reasoning,
  }, tenant);
}

function applyGates(
  cls: {
    primary_lane: Lane;
    lane_confidence: number;
    secondary_lanes: Lane[];
    one_way_door: boolean;
    stakes: Stakes;
    detected_subdomain: string | null;
    gap_reason: GapReason;
    reasoning: string;
  },
  tenant: string,
): TriageDecision {
  const distinctLanes = new Set<Lane>([cls.primary_lane, ...cls.secondary_lanes]);
  const gates_fired: string[] = [];

  let mode: Mode;
  let chairs: string[];

  // Gate A0 · existential → council
  if (cls.stakes === "existential") {
    gates_fired.push("A0");
    mode = "council";
    chairs = fullBoardWithLegal(tenant);
  }
  // Gate A1 · ≥3 distinct lanes → council
  else if (distinctLanes.size >= ROUTING_CONFIG.multi_lane_council_threshold) {
    gates_fired.push("A1");
    mode = "council";
    chairs = fullBoardWithLegal(tenant);
  }
  // Gate A2 · one-way-door OR high stakes → panel-minimum (never auto-council)
  else if (cls.one_way_door || cls.stakes === "high") {
    gates_fired.push("A2");
    mode = "panel";
    const lanes: Lane[] = [cls.primary_lane, ...cls.secondary_lanes].slice(0, 4);
    // Panel-min of one lane is degenerate — add an adjacent lens if needed.
    if (lanes.length < 2) {
      const filler: Lane = cls.primary_lane === "legal" ? "finance"
        : cls.primary_lane === "finance" ? "legal"
        : "ops";
      if (!lanes.includes(filler)) lanes.push(filler);
    }
    chairs = dedupe(lanes.map((l) => laneToId(l, tenant)));
  }
  // Gate B · routing uncertainty → panel
  else if (cls.lane_confidence < ROUTING_CONFIG.tau_route) {
    gates_fired.push("B");
    mode = "panel";
    const lanes: Lane[] = [cls.primary_lane, ...cls.secondary_lanes].slice(0, 4);
    if (lanes.length < 2) {
      const filler: Lane = cls.primary_lane === "legal" ? "finance" : "ops";
      if (!lanes.includes(filler)) lanes.push(filler);
    }
    chairs = dedupe(lanes.map((l) => laneToId(l, tenant)));
  }
  // Solo
  else {
    mode = "solo";
    chairs = [laneToId(cls.primary_lane, tenant)];
  }

  return {
    ...cls,
    recommended_mode: mode,
    chairs,
    gates_fired,
  };
}

function dedupe<T>(xs: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of xs) { if (!seen.has(x)) { seen.add(x); out.push(x); } }
  return out;
}
