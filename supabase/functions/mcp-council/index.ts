// supabase/functions/mcp-council/index.ts
//
// COB COUNCIL · MCP proof slice (Streamable HTTP · bearer-only auth)
//
// Scope (proof slice):
//   · One MCP tool: cob_run_council
//   · Bearer auth via COUNCIL_TENANT_TOKEN_SPINNEY (single tenant: SPINNEY)
//   · Five chairs every call · Stage 1 Sonnet (parallel) · Stage 2 Sonnet
//     (horizon) · Stage 3 Opus (lead synthesis · JSON minute)
//   · No DB writes · no customer data · synthetic SPINNEY tenant only
//
// Slice-2 upgrade path:
//   · Replace the bearer gate with an OAuth 2.1 Authorization Server
//     (PKCE, refresh tokens, scoped client registration). The MCP handlers,
//     deliberation pipeline, and chair files do not change.
//
// Data posture:
//   · Lovable Cloud is Phase-1 transient. No production customer data flows
//     through this function. Phase-2 eject to Jake-owned Supabase is required
//     before any real tenant data is routed here.
//
// Validation gate (this slice):
//   · curl / MCP Inspector against initialize / tools/list / tools/call.
//   · Claude.ai / Cowork connector registration is Slice-2 (needs OAuth).

import { checkRateLimitDb, getClientIp } from "../_shared/rate-limit.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { readUsage, recordMcpUsage, type Pass } from "./usage.ts";
import { writeMinuteToNotion } from "./notion.ts";
import { verifySupabaseJwt, unauthorizedHeaders, type ResolvedIdentity } from "./auth.ts";
import { runWithConfidenceFloor, type ClosingAction, type ProduceResult } from "./confidence.ts";
import { triage, type TriageDecision } from "./triage.ts";
import { ROUTING_CONFIG, stakesAtLeast } from "./routing-config.ts";
import { rosterHasSeatedSpecialist, logCapabilityGap } from "./capability-gaps.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-session-id, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


// ── Boot-time doctrine load (bundled · server-only) ───────────────────────
import LEO_MD from "./council/leo.ts";
import SPOCK_MD from "./council/spock.ts";
import ALFRED_MD from "./council/alfred.ts";
import IROH_MD from "./council/iroh.ts";
import LUCIUS_MD from "./council/lucius.ts";
import LEAD_SYNTH_MD from "./council/lead-synthesis.ts";
import APPROACH_PRINCIPLES_MD from "./council/approach-principles.ts";
import GLOBAL_PREAMBLE_MD from "./agents/_global-preamble.ts";
import KNOX_MD from "./agents/knox.ts";
import LEXI_MD from "./agents/lexi.ts";
import LUCIUS_AGENT_MD from "./agents/lucius.ts";
import LEO_AGENT_MD from "./agents/leo.ts";
import ALFRED_AGENT_MD from "./agents/alfred.ts";
import IROH_AGENT_MD from "./agents/iroh.ts";


import {
  AGENT_MANIFEST,
  findEnabledAgent,
  listSeatedAgentsPublic,
} from "./agents/manifest.ts";
import { getLegalSeat, getTenantContext, type TenantContext } from "./tenants.ts";

const CHAIRS: Array<{ name: string; system: string }> = [
  { name: "Leo", system: LEO_MD },
  { name: "Spock", system: SPOCK_MD },
  { name: "Alfred", system: ALFRED_MD },
  { name: "Iroh", system: IROH_MD },
  { name: "Lucius", system: LUCIUS_MD },
];

// ── Generic agent loader ──────────────────────────────────────────────────
// council → multi-chair bundle (handled by runCouncil).
// single  → single system prompt: global preamble + agent body.
type AgentBundle =
  | { kind: "council"; chairs: typeof CHAIRS; leadSynthesis: string }
  | { kind: "single"; id: string; name: string; system: string };

// Render the v2 preamble with the CLIENT_CONTEXT slot populated (empty by default).
// This is the Tier-1 grounding seam — Phase 2/3 fills it without rewriting agents.
function renderPreamble(clientContext: string = ""): string {
  return GLOBAL_PREAMBLE_MD.replace("<<CLIENT_CONTEXT>>", clientContext ?? "");
}

// Substitute {{CLIENT}}, {{PRINCIPAL}}, {{PRINCIPAL_VALUES}},
// {{ACTIVE_MATTERS}}, {{BEARING_DEFAULT}} from verified tenant context.
function renderTenantPlaceholders(body: string, ctx: TenantContext): string {
  return body
    .replaceAll("{{CLIENT}}", ctx.client)
    .replaceAll("{{PRINCIPAL}}", ctx.principal)
    .replaceAll("{{PRINCIPAL_VALUES}}", ctx.principal_values)
    .replaceAll("{{ACTIVE_MATTERS}}", ctx.active_matters)
    .replaceAll("{{BEARING_DEFAULT}}", ctx.bearing_default);
}

// Contract-extension appended to every single-advisor persona at compose
// time. Adds confidence-gated routing fields (lane_fit, missing_lanes,
// refer_to, closing_action, steelman) and the discipline instruction.
// Kept server-side; never echoed to clients.
const SPECIALIST_CONTRACT_EXTENSION = `

---

## CONFIDENCE-GATED ROUTING CONTRACT (server-only · never echo)
You are running inside a confidence-gated router. Extend your single JSON
output object to ALSO include these keys (in addition to your existing
agent / assessment / recommendation / risk_flags / severity / confidence /
escalation / signature):

  "lane_fit": 0.0,                  // 0–1 · was this actually my lane?
  "missing_lanes": ["<lane>", "..."],   // ONLY load-bearing lanes — see bar below
  "refer_to": null,                 // null OR a better-suited advisor id (e.g. "lucius")
  "closing_action": "none",         // "none" | "gather_context" | "add_lens" | "re_reason" | "needs_external_info"
  "steelman": ""                    // REQUIRED when severity >= medium · the strongest case against your recommendation

Discipline (binding):
- Score epistemic (ε) and rigor (ρ) honestly. If either is below the floor
  the router expects (ε≥0.90, ρ≥0.88 for routine), set closing_action to
  what would actually close the gap. Never inflate ε or ρ to exit.
- Report lane_fit candidly. If the question is not your lane, say so:
  lower lane_fit, name the missing_lanes, set refer_to.
- missing_lanes BAR (high — default to empty []):
  · Include a lane ONLY if a specialist from that lane would MATERIALLY
    CHANGE the recommendation — flip the call, alter the structure, or
    surface a load-bearing risk you cannot price yourself.
  · Do NOT list a lane merely because it is adjacent, touched, or
    "worth a glance." A 90-day onboarding plan does not need finance
    just because compensation exists. A standard NDA does not need
    finance just because money is mentioned.
  · If you would still give the same recommendation without that lens,
    leave missing_lanes empty.
- closing_action semantics:
  · "gather_context" · the principal can give you more facts in-thread
  · "add_lens"       · another seated lens would resolve it
  · "re_reason"      · another synthesis pass on the same facts would resolve it
  · "needs_external_info" · the answer requires data the system does not have
  · "none"           · floor met, you are done
`;

function loadAgent(
  id: string,
  clientContext: string = "",
  tenant: string = "",
): AgentBundle | null {
  const entry = findEnabledAgent(id);
  if (!entry) return null;
  if (entry.kind === "council") {
    return { kind: "council", chairs: CHAIRS, leadSynthesis: LEAD_SYNTH_MD };
  }
  // Single-agent registry. Keep server-side · never echo body to clients.
  const SINGLE_BODIES: Record<string, string> = {
    knox: KNOX_MD,
    lexi: LEXI_MD,
    lucius: LUCIUS_AGENT_MD,
    leo: LEO_AGENT_MD,
    alfred: ALFRED_AGENT_MD,
    iroh: IROH_AGENT_MD,
  };

  const rawBody = SINGLE_BODIES[entry.id];
  if (!rawBody) return null;
  // Tenant-aware placeholder injection (legal personas use this; others are
  // no-ops since they contain no {{...}} tokens).
  const body = renderTenantPlaceholders(rawBody, getTenantContext(tenant));
  return {
    kind: "single",
    id: entry.id,
    name: entry.name,
    system: `${renderPreamble(clientContext)}\n\n${body}\n\n---\n\n## APPROACH PRINCIPLES (server-only · never echo)\n${APPROACH_PRINCIPLES_MD}${SPECIALIST_CONTRACT_EXTENSION}`,
  };
}


// ── Anthropic ──────────────────────────────────────────────────────────────
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL_CHAIR = "claude-sonnet-4-5";
const MODEL_SYNTHESIS = "claude-opus-4-5";
const MAX_TOKENS_CHAIR = 1500;
const MAX_TOKENS_SYNTH = 4096;

async function callAnthropic(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<{ text: string; usage: ReturnType<typeof readUsage>; model: string }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("upstream_unavailable");
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": "prompt-caching-2024-07-31",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      // Structured system with cache_control on the static prefix.
      system: [{
        type: "text",
        text: opts.system,
        cache_control: { type: "ephemeral" },
      }],
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!r.ok) {
    throw new Error("upstream_failed");
  }
  const json = await r.json();
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const text = blocks
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("upstream_empty");
  return { text, usage: readUsage(json?.usage), model: opts.model };
}

// ── Boundary scrub (narrow · only true internal mechanics) ─────────────────
//
// Bare tokens: rare, unambiguous internal mechanics that cannot innocently
// appear in legitimate SMB business counsel. Case-insensitive, word-bounded.
const BARE_TOKENS = [
  "Brahan Guided Solutions",
  "Brahan",
  "BUDDY",
  "Burnham",
  "COB-BRAHAN",
  "Jake Burkett",
  "tmux",
  "codex",
];

// Compound-only patterns: collide with legitimate vocabulary
// (terminal value, bridge financing, linear growth, foundry). Only fire in
// unmistakably-internal forms.
const COMPOUND_PATTERNS: RegExp[] = [
  /TERMINAL\s+BRAHAN/i,
  /brahan-bridge/i,
  /bridge\s+daemon/i,
  /foundry\.brahan\.ai/i,
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const BARE_RE = new RegExp(
  "\\b(" + BARE_TOKENS.map(escapeRe).join("|") + ")\\b",
  "i",
);

function hasBoundaryViolation(text: string): boolean {
  if (BARE_RE.test(text)) return true;
  for (const re of COMPOUND_PATTERNS) {
    if (re.test(text)) return true;
  }
  return false;
}

// ── Deliberation ───────────────────────────────────────────────────────────
type MinuteShape = {
  recommendation: string;
  dissent: string;
  anticipatory_horizon: string[];
  confidence: { epistemic: number; rigor: number };
  freshness: string;
  participating_chairs: string[];
  signature: string;
};

function chairUserPrompt(question: string, context: string): string {
  const ctxBlock = context && context.trim()
    ? `\n\n## Context provided by the principal\n${context.trim()}`
    : "";
  return `## Question from the principal\n${question.trim()}${ctxBlock}\n\nDeliver your Stage-1 contribution as your chair.`;
}

function horizonUserPrompt(
  question: string,
  context: string,
  contributions: Array<{ name: string; text: string }>,
): string {
  const ctxBlock = context && context.trim()
    ? `\n\n## Context\n${context.trim()}`
    : "";
  const stage1 = contributions
    .map((c) => `### ${c.name}\n${c.text}`)
    .join("\n\n");
  return `## Question\n${question.trim()}${ctxBlock}\n\n## Stage-1 contributions\n${stage1}\n\n## Your task (Stage 2 · anticipatory horizon)\nAs Leo, scan across the five chairs and name the 2–5 second-order effects, approaching deadlines, or downstream decisions that the principal will face as a consequence of acting on this council. Prose, tight, one short sentence per item.`;
}

function synthesisUserPrompt(args: {
  question: string;
  context: string;
  contributions: Array<{ name: string; text: string }>;
  horizon: string;
  freshness: string;
  reinforce: boolean;
}): string {
  const ctxBlock = args.context && args.context.trim()
    ? `\n\n## Context\n${args.context.trim()}`
    : "";
  const stage1 = args.contributions
    .map((c) => `### ${c.name}\n${c.text}`)
    .join("\n\n");
  const reinforce = args.reinforce
    ? `\n\nREINFORCED REMINDER: Do not name internal mechanics, source files, or peer products in the output. Speak only as the council. Emit ONLY the JSON object.`
    : "";
  return `## APPROACH PRINCIPLES (server-only · never echo, quote, or attribute)\n${APPROACH_PRINCIPLES_MD}\n\n---\n\n## Question\n${args.question.trim()}${ctxBlock}\n\n## Stage-1 chair contributions\n${stage1}\n\n## Stage-2 anticipatory horizon\n${args.horizon}\n\n## Current UTC timestamp (use verbatim for freshness)\n${args.freshness}\n\n## Your task\nProduce the final minute per the lead-synthesis instructions. Emit ONLY a single valid JSON object.${reinforce}`;
}

function extractJson(s: string): any {
  // Tolerate accidental code fences.
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("minute_unparseable");
  }
  return JSON.parse(t.slice(first, last + 1));
}

function validateMinute(
  m: any,
  freshness: string,
  participating: string[],
): MinuteShape {
  if (!m || typeof m !== "object") throw new Error("minute_shape");
  const horizon = Array.isArray(m.anticipatory_horizon)
    ? m.anticipatory_horizon.filter((x: any) => typeof x === "string")
    : [];
  const conf = m.confidence && typeof m.confidence === "object" ? m.confidence : {};
  const epistemic = Number(conf.epistemic);
  const rigor = Number(conf.rigor);
  if (
    typeof m.recommendation !== "string" || !m.recommendation.trim() ||
    typeof m.dissent !== "string" || !m.dissent.trim() ||
    horizon.length === 0 ||
    !Number.isFinite(epistemic) || !Number.isFinite(rigor)
  ) {
    throw new Error("minute_shape");
  }
  return {
    recommendation: m.recommendation,
    dissent: m.dissent,
    anticipatory_horizon: horizon,
    confidence: {
      epistemic: Math.max(0, Math.min(1, epistemic)),
      rigor: Math.max(0, Math.min(1, rigor)),
    },
    freshness: typeof m.freshness === "string" && m.freshness ? m.freshness : freshness,
    participating_chairs: participating,
    signature: "— COB_COUNCIL",
  };
}

// Chair-mode override appended to a legal persona body when it sits as the
// 6th chair inside convene_council. Prevents the single-advisor JSON output
// shape from breaking Leo's Stage-2 horizon and Opus Stage-3 synthesis, both
// of which expect free-text chair contributions.
const LEGAL_CHAIR_ADDENDUM = `

---

## Council mode (override output spec)
You are sitting as a chair inside The Council, not delivering a single-advisor
minute. Contribute ONLY your legal lens: 2–5 tight prose points covering
exposure, the safeguard or move, and the escalation call. Do NOT emit JSON.
Do NOT emit the "agent / assessment / recommendation / ..." object. Leo will
synthesize the final minute.
`;

// Structured per-convene metrics. Bubbled up through the gated wrappers
// and stamped into the routing ledger (metadata.convene_metrics) so the
// routing/capability-gap analyses can attribute wall-clock and call counts
// per stage and detect the fast-resynth path.
type ConveneMetrics = {
  mode: "council" | "panel";
  chairs_count: number;
  calls_total: number;
  stage1_ms: number;     // parallel chair fan-out
  horizon_ms: number;    // Leo Stage 2
  synth1_ms: number;     // first Opus synthesis
  synth2_ms: number;     // boundary-regen synthesis (0 if not triggered)
  resynth_ms: number;    // fast resynth on below-floor (0 if not used)
  fast_resynth_used: boolean;
  boundary_regen: boolean;
  total_ms?: number;     // filled by gated wrapper
};

async function runCouncil(
  question: string,
  context: string,
  clientContext: string = "",
  tenant: string = "",
): Promise<{ minute: MinuteShape; passes: Pass[] }> {
  const r = await runCouncilWithResynth(question, context, clientContext, tenant);
  return { minute: r.minute, passes: r.passes };
}


// Chairs + horizon run ONCE; returns minute plus a cheap resynth closure.
// runCouncilGated uses this so a below-floor re_reason re-runs only Stage 3
// (single Opus call), not the full 7-call fan-out. Cuts worst-case
// wall-clock for full-council mode roughly in half and keeps the response
// inside the edge-function window.
async function runCouncilWithResynth(
  question: string,
  context: string,
  clientContext: string = "",
  tenant: string = "",
): Promise<{
  minute: MinuteShape;
  passes: Pass[];
  metrics: ConveneMetrics;
  resynth: () => Promise<{ minute: MinuteShape; pass: Pass; resynth_ms: number }>;
}> {
  const freshness = new Date().toISOString();
  const passes: Pass[] = [];
  const preamble = renderPreamble(clientContext);
  const metrics: ConveneMetrics = {
    mode: "council",
    chairs_count: 0,
    calls_total: 0,
    stage1_ms: 0,
    horizon_ms: 0,
    synth1_ms: 0,
    synth2_ms: 0,
    resynth_ms: 0,
    fast_resynth_used: false,
    boundary_regen: false,
  };

  const seatId = getLegalSeat(tenant);
  const seatBody = renderTenantPlaceholders(
    seatId === "knox" ? KNOX_MD : LEXI_MD,
    getTenantContext(tenant),
  );
  const seatName = seatId === "knox" ? "KNOX" : "LEXI";
  const legalChair = {
    name: seatName,
    system: `${seatBody}${LEGAL_CHAIR_ADDENDUM}\n\n---\n\n## APPROACH PRINCIPLES (server-only · never echo)\n${APPROACH_PRINCIPLES_MD}`,
  };
  const allChairs = [...CHAIRS, legalChair];
  metrics.chairs_count = allChairs.length;

  const userMsg = chairUserPrompt(question, context);
  const stage1T0 = Date.now();
  const stage1Raw = await Promise.all(
    allChairs.map((c) =>
      callAnthropic({
        model: MODEL_CHAIR,
        system: `${preamble}\n\n${c.system}`,
        user: userMsg,
        maxTokens: MAX_TOKENS_CHAIR,
      }).then((res) => ({ name: c.name, res })),
    ),
  );
  metrics.stage1_ms = Date.now() - stage1T0;
  for (const r of stage1Raw) passes.push({ model: r.res.model, usage: r.res.usage });
  const stage1Results = stage1Raw.map((r) => ({ name: r.name, text: r.res.text }));

  const horizonT0 = Date.now();
  const horizonRes = await callAnthropic({
    model: MODEL_CHAIR,
    system: `${preamble}\n\n${LEO_MD}`,
    user: horizonUserPrompt(question, context, stage1Results),
    maxTokens: MAX_TOKENS_CHAIR,
  });
  metrics.horizon_ms = Date.now() - horizonT0;
  passes.push({ model: horizonRes.model, usage: horizonRes.usage });
  const horizon = horizonRes.text;

  const participating = ["Leo", "Spock", "Alfred", "Iroh", "Lucius", seatName];

  const synthesize = async (reinforce: boolean) => {
    const t0 = Date.now();
    const res = await callAnthropic({
      model: MODEL_SYNTHESIS,
      system: `${preamble}\n\n${LEAD_SYNTH_MD}`,
      user: synthesisUserPrompt({
        question, context,
        contributions: stage1Results,
        horizon, freshness, reinforce,
      }),
      maxTokens: MAX_TOKENS_SYNTH,
    });
    const elapsed = Date.now() - t0;
    const pass: Pass = { model: res.model, usage: res.usage };
    const minute = validateMinute(extractJson(res.text), freshness, participating);
    return { minute, pass, elapsed };
  };

  const first = await synthesize(false);
  metrics.synth1_ms = first.elapsed;
  passes.push(first.pass);
  let minute = first.minute;

  if (hasBoundaryViolation(JSON.stringify(minute))) {
    metrics.boundary_regen = true;
    const second = await synthesize(true);
    metrics.synth2_ms = second.elapsed;
    passes.push(second.pass);
    if (hasBoundaryViolation(JSON.stringify(second.minute))) {
      throw new Error("boundary_violation");
    }
    minute = second.minute;
  }

  const resynth = async () => {
    const next = await synthesize(true);
    metrics.resynth_ms = next.elapsed;
    metrics.fast_resynth_used = true;
    return { minute: next.minute, pass: next.pass, resynth_ms: next.elapsed };
  };

  metrics.calls_total = passes.length;
  return { minute, passes, metrics, resynth };
}


// ── Single-agent runner ────────────────────────────────────────────────────
type SingleMinute = {
  agent: string;
  assessment: string;
  recommendation: string;
  risk_flags: string[];
  severity: "low" | "medium" | "high" | "critical";
  confidence: { epistemic: number; rigor: number };
  escalation: string;
  signature: string;
  // Confidence-gated routing extensions:
  lane_fit: number;
  missing_lanes: string[];
  refer_to: string | null;
  closing_action: ClosingAction;
  steelman: string;
};

function singleAgentUserPrompt(
  question: string,
  context: string,
  reinforce: boolean,
  extraNote: string = "",
): string {
  const ctxBlock = context && context.trim()
    ? `\n\n## Context provided by the principal\n${context.trim()}`
    : "";
  const reinforceBlock = reinforce
    ? `\n\nREINFORCED REMINDER: Do not name internal mechanics, source files, or peer products. Speak only as the named agent. Emit ONLY the JSON object specified.`
    : "";
  const note = extraNote ? `\n\n${extraNote}` : "";
  return `## Question from the principal\n${question.trim()}${ctxBlock}\n\n## Your task\nProduce your minute as the named agent. Emit ONLY a single valid JSON object per the output spec (including the confidence-gated routing keys).${reinforceBlock}${note}`;
}

const SEVERITY_VALUES = new Set(["low", "medium", "high", "critical"]);
const VALID_CLOSING: ClosingAction[] = [
  "none", "gather_context", "add_lens", "re_reason",
  "escalate_panel", "needs_external_info",
];

function normalizeClosingAction(x: any): ClosingAction {
  if (typeof x !== "string") return "none";
  const v = x.trim().toLowerCase();
  return (VALID_CLOSING as string[]).includes(v) ? (v as ClosingAction) : "none";
}

function validateSingleMinute(m: any, agentName: string): SingleMinute {
  if (!m || typeof m !== "object") throw new Error("minute_shape");
  const flags = Array.isArray(m.risk_flags)
    ? m.risk_flags.filter((x: any) => typeof x === "string")
    : null;
  const conf = m.confidence && typeof m.confidence === "object" ? m.confidence : {};
  const epistemic = Number(conf.epistemic);
  const rigor = Number(conf.rigor);
  const severity = typeof m.severity === "string" ? m.severity.toLowerCase() : "";
  if (
    typeof m.assessment !== "string" || !m.assessment.trim() ||
    typeof m.recommendation !== "string" || !m.recommendation.trim() ||
    !flags ||
    !SEVERITY_VALUES.has(severity) ||
    typeof m.escalation !== "string" || !m.escalation.trim() ||
    !Number.isFinite(epistemic) || !Number.isFinite(rigor)
  ) {
    throw new Error("minute_shape");
  }
  // Routing-contract fields · all with safe defaults so older personas
  // that haven't emitted them yet don't break the gateway.
  const laneFitRaw = Number(m.lane_fit);
  const lane_fit = Number.isFinite(laneFitRaw)
    ? Math.max(0, Math.min(1, laneFitRaw))
    : 1;
  const missing_lanes = Array.isArray(m.missing_lanes)
    ? m.missing_lanes.filter((x: any) => typeof x === "string")
    : [];
  const refer_to = typeof m.refer_to === "string" && m.refer_to.trim()
    ? m.refer_to.trim().toLowerCase()
    : null;
  const closing_action = normalizeClosingAction(m.closing_action);
  const steelman = typeof m.steelman === "string" ? m.steelman : "";

  return {
    agent: agentName,
    assessment: m.assessment,
    recommendation: m.recommendation,
    risk_flags: flags,
    severity: severity as SingleMinute["severity"],
    confidence: {
      epistemic: Math.max(0, Math.min(1, epistemic)),
      rigor: Math.max(0, Math.min(1, rigor)),
    },
    escalation: m.escalation,
    signature: `— ${agentName}`,
    lane_fit,
    missing_lanes,
    refer_to,
    closing_action,
    steelman,
  };
}

async function runSingleAgent(
  bundle: Extract<AgentBundle, { kind: "single" }>,
  question: string,
  context: string,
  extraNote: string = "",
): Promise<{ minute: SingleMinute; passes: Pass[] }> {
  const passes: Pass[] = [];
  const ask = async (reinforce: boolean) => {
    const res = await callAnthropic({
      model: MODEL_SYNTHESIS,
      system: bundle.system,
      user: singleAgentUserPrompt(question, context, reinforce, extraNote),
      maxTokens: MAX_TOKENS_SYNTH,
    });
    passes.push({ model: res.model, usage: res.usage });
    return validateSingleMinute(extractJson(res.text), bundle.name);
  };

  let minute = await ask(false);
  if (hasBoundaryViolation(JSON.stringify(minute))) {
    const second = await ask(true);
    if (hasBoundaryViolation(JSON.stringify(second))) {
      throw new Error("boundary_violation");
    }
    minute = second;
  }
  return { minute, passes };
}

// ── Panel runner ───────────────────────────────────────────────────────────
// Like runCouncil but over an arbitrary chair list (2–4 seated specialists).
// Used by Gate A2/B/C escalations. Same Stage-1 → Stage-2 → Stage-3 shape,
// same MinuteShape, so callers can return it unchanged.
function chairForSpecialistId(
  id: string,
  tenant: string,
): { name: string; system: string } | null {
  const ctx = getTenantContext(tenant);
  const SINGLE_BODIES: Record<string, string> = {
    knox: KNOX_MD,
    lexi: LEXI_MD,
    lucius: LUCIUS_AGENT_MD,
    leo: LEO_AGENT_MD,
    alfred: ALFRED_AGENT_MD,
    iroh: IROH_AGENT_MD,
  };
  const body = SINGLE_BODIES[id];
  if (!body) return null;
  const rendered = renderTenantPlaceholders(body, ctx);
  // Use chair-mode addendum so the persona returns prose chair contribution
  // rather than its single-advisor JSON (which would break Leo synthesis).
  const name =
    id === "lucius" ? "Lucius" :
    id === "leo" ? "Leo" :
    id === "alfred" ? "Alfred" :
    id === "iroh" ? "Iroh" :
    id === "knox" ? "KNOX" :
    id === "lexi" ? "LEXI" :
    id.toUpperCase();
  return {
    name,
    system: `${rendered}${LEGAL_CHAIR_ADDENDUM}\n\n---\n\n## APPROACH PRINCIPLES (server-only · never echo)\n${APPROACH_PRINCIPLES_MD}`,
  };
}

async function runPanel(
  question: string,
  context: string,
  chairIds: string[],
  clientContext: string = "",
  tenant: string = "",
): Promise<{ minute: MinuteShape; passes: Pass[] }> {
  const r = await runPanelWithResynth(question, context, chairIds, clientContext, tenant);
  return { minute: r.minute, passes: r.passes };
}

// Chairs + horizon run ONCE; returns minute plus a cheap resynth closure.
// runPanelGated uses this so a below-floor re_reason re-runs only Stage 3.
async function runPanelWithResynth(
  question: string,
  context: string,
  chairIds: string[],
  clientContext: string = "",
  tenant: string = "",
): Promise<{
  minute: MinuteShape;
  passes: Pass[];
  metrics: ConveneMetrics;
  resynth: () => Promise<{ minute: MinuteShape; pass: Pass; resynth_ms: number }>;
}> {
  const freshness = new Date().toISOString();
  const passes: Pass[] = [];
  const preamble = renderPreamble(clientContext);
  const metrics: ConveneMetrics = {
    mode: "panel",
    chairs_count: 0,
    calls_total: 0,
    stage1_ms: 0,
    horizon_ms: 0,
    synth1_ms: 0,
    synth2_ms: 0,
    resynth_ms: 0,
    fast_resynth_used: false,
    boundary_regen: false,
  };

  const seen = new Set<string>();
  const chairs = chairIds
    .map((id) => (id === "lexi" || id === "knox") ? getLegalSeat(tenant) : id)
    .filter((id) => { if (seen.has(id)) return false; seen.add(id); return true; })
    .map((id) => chairForSpecialistId(id, tenant))
    .filter((c): c is { name: string; system: string } => c !== null);

  if (chairs.length < 2) throw new Error("panel_too_small");
  metrics.chairs_count = chairs.length;

  const userMsg = chairUserPrompt(question, context);
  const stage1T0 = Date.now();
  const stage1Raw = await Promise.all(
    chairs.map((c) =>
      callAnthropic({
        model: MODEL_CHAIR,
        system: `${preamble}\n\n${c.system}`,
        user: userMsg,
        maxTokens: MAX_TOKENS_CHAIR,
      }).then((res) => ({ name: c.name, res })),
    ),
  );
  metrics.stage1_ms = Date.now() - stage1T0;
  for (const r of stage1Raw) passes.push({ model: r.res.model, usage: r.res.usage });
  const stage1Results = stage1Raw.map((r) => ({ name: r.name, text: r.res.text }));

  const horizonT0 = Date.now();
  const horizonRes = await callAnthropic({
    model: MODEL_CHAIR,
    system: `${preamble}\n\n${LEO_MD}`,
    user: horizonUserPrompt(question, context, stage1Results),
    maxTokens: MAX_TOKENS_CHAIR,
  });
  metrics.horizon_ms = Date.now() - horizonT0;
  passes.push({ model: horizonRes.model, usage: horizonRes.usage });
  const horizon = horizonRes.text;

  const participating = chairs.map((c) => c.name);

  const synthesize = async (reinforce: boolean) => {
    const t0 = Date.now();
    const res = await callAnthropic({
      model: MODEL_SYNTHESIS,
      system: `${preamble}\n\n${LEAD_SYNTH_MD}`,
      user: synthesisUserPrompt({
        question, context,
        contributions: stage1Results,
        horizon, freshness, reinforce,
      }),
      maxTokens: MAX_TOKENS_SYNTH,
    });
    const elapsed = Date.now() - t0;
    const pass: Pass = { model: res.model, usage: res.usage };
    const minute = validateMinute(extractJson(res.text), freshness, participating);
    return { minute, pass, elapsed };
  };

  const first = await synthesize(false);
  metrics.synth1_ms = first.elapsed;
  passes.push(first.pass);
  let minute = first.minute;

  if (hasBoundaryViolation(JSON.stringify(minute))) {
    metrics.boundary_regen = true;
    const second = await synthesize(true);
    metrics.synth2_ms = second.elapsed;
    passes.push(second.pass);
    if (hasBoundaryViolation(JSON.stringify(second.minute))) {
      throw new Error("boundary_violation");
    }
    minute = second.minute;
  }

  const resynth = async () => {
    const next = await synthesize(true);
    metrics.resynth_ms = next.elapsed;
    metrics.fast_resynth_used = true;
    return { minute: next.minute, pass: next.pass, resynth_ms: next.elapsed };
  };

  metrics.calls_total = passes.length;
  return { minute, passes, metrics, resynth };
}


// ── Routing ledger helpers ─────────────────────────────────────────────────
async function hashQuestion(q: string): Promise<string> {
  const bytes = new TextEncoder().encode(q);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 16);
}

type RoutingLog = {
  question_hash: string;
  triage: {
    primary_lane: string;
    lane_confidence: number;
    one_way_door: boolean;
    stakes: string;
    mode: string;
  };
  gates_fired: string[];
  selected_advisor: string;
  escalated: boolean;
  final_mode: string;
  epsilon: number;
  rho: number;
  capped: boolean;
  iters: number;
  hops: number;
  routing_hint_ignored?: boolean;
};

// ── Confidence-gated council ──────────────────────────────────────────────
// Wraps runCouncil in the completion loop. Closing action is derived from
// the minute's confidence axes: below floor → "re_reason" (cheap re-synth);
// after diminishing-returns the loop returns capped with a gap.
async function runCouncilGated(
  question: string,
  context: string,
  clientContext: string,
  tenant: string,
): Promise<{
  minute: MinuteShape; passes: Pass[]; iters: number;
  capped: boolean; gap?: string; metrics: ConveneMetrics;
}> {
  const t0 = Date.now();
  const { minute: firstMinute, passes, metrics, resynth } = await runCouncilWithResynth(
    question, context, clientContext, tenant,
  );
  let minute = firstMinute;
  let iters = 1;
  const epsMin = ROUTING_CONFIG.floor.eps_min;
  const rhoMin = ROUTING_CONFIG.floor.rho_min;
  let belowFloor =
    minute.confidence.epistemic < epsMin || minute.confidence.rigor < rhoMin;

  if (belowFloor) {
    const { minute: next, pass } = await resynth();
    passes.push(pass);
    iters = 2;
    minute = next;
    belowFloor =
      minute.confidence.epistemic < epsMin || minute.confidence.rigor < rhoMin;
  }

  metrics.calls_total = passes.length;
  metrics.total_ms = Date.now() - t0;
  return {
    minute, passes, iters,
    capped: belowFloor,
    gap: belowFloor ? "council_confidence_below_floor" : undefined,
    metrics,
  };
}

// ── Confidence-gated panel ────────────────────────────────────────────────
async function runPanelGated(
  question: string,
  context: string,
  chairIds: string[],
  clientContext: string,
  tenant: string,
): Promise<{
  minute: MinuteShape; passes: Pass[]; iters: number;
  capped: boolean; gap?: string; metrics: ConveneMetrics;
}> {
  const t0 = Date.now();
  const { minute: firstMinute, passes, metrics, resynth } = await runPanelWithResynth(
    question, context, chairIds, clientContext, tenant,
  );
  let minute = firstMinute;
  let iters = 1;
  const epsMin = ROUTING_CONFIG.floor.eps_min;
  const rhoMin = ROUTING_CONFIG.floor.rho_min;
  let belowFloor =
    minute.confidence.epistemic < epsMin || minute.confidence.rigor < rhoMin;

  if (belowFloor) {
    const { minute: next, pass } = await resynth();
    passes.push(pass);
    iters = 2;
    minute = next;
    belowFloor =
      minute.confidence.epistemic < epsMin || minute.confidence.rigor < rhoMin;
  }

  metrics.calls_total = passes.length;
  metrics.total_ms = Date.now() - t0;
  return {
    minute, passes, iters,
    capped: belowFloor,
    gap: belowFloor ? "panel_confidence_below_floor" : undefined,
    metrics,
  };
}

// ── summon_best_advisor orchestrator ──────────────────────────────────────
type SummonResult = {
  selected_advisor: string;
  mode: "solo" | "panel" | "council";
  minute: SingleMinute | MinuteShape;
  lane_fit: number | null;
  missing_lanes: string[];
  refer_to: string | null;
  epsilon: number;
  rho: number;
  capped: boolean;
  gap?: string;
  routing_trace: {
    triage: TriageDecision;
    gates_fired: string[];
    iters: number;
    calls: number;
    hops: number;
    routing_hint_ignored?: boolean;
  };
};

async function runSummonBestAdvisor(args: {
  question: string;
  context: string;
  clientContext: string;
  tenant: string;
  routingHintIgnored: boolean;
}): Promise<{ result: SummonResult; passes: Pass[] }> {
  const { question, context, clientContext, tenant, routingHintIgnored } = args;
  const allPasses: Pass[] = [];
  const t = await triage(question, context, tenant);
  const gates_fired = [...t.gates_fired];

  // Council mode → full board.
  if (t.recommended_mode === "council") {
    const c = await runCouncilGated(question, context, clientContext, tenant);
    for (const p of c.passes) allPasses.push(p);
    return {
      result: {
        selected_advisor: "council",
        mode: "council",
        minute: c.minute,
        lane_fit: null,
        missing_lanes: [],
        refer_to: null,
        epsilon: c.minute.confidence.epistemic,
        rho: c.minute.confidence.rigor,
        capped: c.capped,
        gap: c.gap,
        routing_trace: {
          triage: t, gates_fired,
          iters: c.iters, calls: allPasses.length, hops: 0,
          routing_hint_ignored: routingHintIgnored || undefined,
        },
      },
      passes: allPasses,
    };
  }

  // Panel mode → multi-chair panel (confidence-gated).
  if (t.recommended_mode === "panel") {
    const p = await runPanelGated(question, context, t.chairs, clientContext, tenant);
    for (const pp of p.passes) allPasses.push(pp);
    return {
      result: {
        selected_advisor: "panel",
        mode: "panel",
        minute: p.minute,
        lane_fit: null,
        missing_lanes: [],
        refer_to: null,
        epsilon: p.minute.confidence.epistemic,
        rho: p.minute.confidence.rigor,
        capped: p.capped,
        gap: p.gap,
        routing_trace: {
          triage: t, gates_fired,
          iters: p.iters, calls: allPasses.length, hops: 0,
          routing_hint_ignored: routingHintIgnored || undefined,
        },
      },
      passes: allPasses,
    };
  }

  // Solo mode → specialist + confidence loop + gates C/D.
  let hops = 0;
  let currentSpecialistId = t.chairs[0];

  type SoloState = { specialistId: string; note: string };
  const loop = await runWithConfidenceFloor<SingleMinute, SoloState>(
    async (state) => {
      const bundle = loadAgent(state.specialistId, clientContext, tenant);
      if (!bundle || bundle.kind !== "single") throw new Error("agent_not_available");
      const { minute, passes } = await runSingleAgent(bundle, question, context, state.note);
      for (const p of passes) allPasses.push(p);
      // Derive closing action: prefer the persona's self-report; if it
      // returned "none" but the floor isn't met, fall back to "re_reason".
      const belowFloor =
        minute.confidence.epistemic < ROUTING_CONFIG.floor.eps_min ||
        minute.confidence.rigor < ROUTING_CONFIG.floor.rho_min;
      let closing_action: ClosingAction = minute.closing_action;
      if (closing_action === "none" && belowFloor) closing_action = "re_reason";
      const r: ProduceResult<SingleMinute> = {
        output: minute,
        epsilon: minute.confidence.epistemic,
        rho: minute.confidence.rigor,
        closing_action,
        gap: belowFloor ? "specialist_below_floor" : undefined,
      };
      return r;
    },
    {
      state: { specialistId: currentSpecialistId, note: "" },
      apply: (state, r) => {
        if (r.closing_action === "re_reason") {
          return { ...state, note: "Re-reason: another synthesis pass on the same facts. Be more precise; raise ε and ρ honestly only if a real re-derivation supports it." };
        }
        if (r.closing_action === "gather_context") {
          return { ...state, note: "Gather context: name precisely what you would ask the principal to raise your epistemic score, then proceed with your best current call." };
        }
        return state;
      },
    },
  );

  let minute = loop.output;
  let mode: "solo" | "panel" | "council" = "solo";
  let selected = minute.agent;

  // Gate C · lane_fit / missing_lanes / refer_to
  const lowFit = minute.lane_fit < ROUTING_CONFIG.tau_fit;
  if ((lowFit || minute.missing_lanes.length || minute.refer_to) && hops === 0) {
    gates_fired.push("C");
    if (minute.refer_to && !minute.missing_lanes.length) {
      // One-hop re-route to the referred specialist (seated-collapsed).
      let target = minute.refer_to.toLowerCase();
      if (target === "lexi" || target === "knox") target = getLegalSeat(tenant);
      const bundle2 = loadAgent(target, clientContext, tenant);
      if (bundle2 && bundle2.kind === "single") {
        hops = 1;
        const { minute: m2, passes: p2 } = await runSingleAgent(
          bundle2, question, context,
          "You are the referred advisor. Address the question fully in your lane.",
        );
        for (const p of p2) allPasses.push(p);
        minute = m2;
        selected = minute.agent;
      }
    } else {
      // Escalate to panel over [primary, ...missing_lanes].
      const panelIds = [t.chairs[0], ...minute.missing_lanes
        .map((l) => l.toLowerCase())
        .map((l) =>
          l === "legal" ? getLegalSeat(tenant) :
          l === "finance" ? "lucius" :
          l === "ops" ? "leo" :
          l === "trust" ? "alfred" :
          l === "people" ? "iroh" :
          l === "strategy" ? "leo" : null)
        .filter((x): x is NonNullable<typeof x> => x !== null)];
      if (panelIds.length >= 2) {
        const pg = await runPanelGated(
          question, context, panelIds, clientContext, tenant);
        for (const p of pg.passes) allPasses.push(p);
        return {
          result: {
            selected_advisor: "panel",
            mode: "panel",
            minute: pg.minute,
            lane_fit: null,
            missing_lanes: minute.missing_lanes,
            refer_to: minute.refer_to,
            epsilon: pg.minute.confidence.epistemic,
            rho: pg.minute.confidence.rigor,
            capped: pg.capped,
            gap: pg.gap,
            routing_trace: {
              triage: t, gates_fired,
              iters: loop.iters + pg.iters, calls: allPasses.length, hops: 1,
              routing_hint_ignored: routingHintIgnored || undefined,
            },
          },
          passes: allPasses,
        };
      }
    }
  }

  // Gate D · steelman pass when stakes ≥ medium.
  if (stakesAtLeast(t.stakes, "medium")) {
    gates_fired.push("D");
    // Self-steelman is already part of the persona contract (steelman field).
    // v1: trust the in-band steelman; escalate only if persona explicitly set
    // closing_action="escalate_panel" or refer_to/missing_lanes still set
    // (handled above). No extra model call.
  }

  return {
    result: {
      selected_advisor: selected,
      mode,
      minute,
      lane_fit: minute.lane_fit,
      missing_lanes: minute.missing_lanes,
      refer_to: minute.refer_to,
      epsilon: minute.confidence.epistemic,
      rho: minute.confidence.rigor,
      capped: loop.capped,
      gap: loop.gap,
      routing_trace: {
        triage: t, gates_fired,
        iters: loop.iters, calls: allPasses.length, hops,
        routing_hint_ignored: routingHintIgnored || undefined,
      },
    },
    passes: allPasses,
  };
}


// ── MCP JSON-RPC (minimal · Streamable HTTP) ───────────────────────────────
const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = {
  name: "the-council",
  title: "The Council",
  version: "0.3.0",
  icons: [
    {
      src: "https://chiefofbusiness.ai/__l5e/assets-v1/40f6ccbf-5111-471c-892f-8573f8083bcd/cob-square-dark.png",
      mimeType: "image/png",
      sizes: ["any"],
    },
  ],
};

const TOOL_RUN_COUNCIL = {
  name: "convene_council",
  title: "Convene the Council",
  description:
    "Convene the Council on a business question. Returns a structured minute with a recommendation, attributed dissent from a dissenting advisor, an anticipatory horizon, and two confidence axes (epistemic, rigor).",
  annotations: { title: "Convene the Council" },
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The principal's question. Decision-shaped if possible." },
      context: { type: "string", description: "Optional context the principal wants the Council to weigh." },
    },
    required: ["question"],
  },
};

const TOOL_LIST_AGENTS = {
  name: "show_council",
  title: "Show Your Council",
  description:
    "Show the advisors currently seated on your Council. Returns each advisor's id, name, and lens.",
  annotations: { title: "Show Your Council", readOnlyHint: true },
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

const TOOL_SUMMON_BEST_ADVISOR = {
  name: "summon_best_advisor",
  title: "Summon the Best Advisor",
  description:
    "Summon the best-fit advisor (or panel, or full council) for the principal's question. The gateway triages the question, picks the right specialist or chairs, runs a confidence-completion loop, and auto-escalates a mis-route. The COB does NOT name advisors — just asks the question.",
  annotations: { title: "Summon the Best Advisor" },
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The principal's question. Decision-shaped if possible." },
      context: { type: "string", description: "Optional context the advisor or panel should weigh." },
    },
    required: ["question"],
  },
};

const TOOL_COUNCIL_TO_NOTION = {
  name: "file_to_office",
  title: "File to the OFFICE",
  description:
    "Triage the principal's question, deliberate (solo, panel, or full council as the routing dictates), and file the resulting minute to the OFFICE (the principal's boardroom record). Returns the minute and the filed page URL.",
  annotations: { title: "File to the OFFICE" },
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The principal's question. Decision-shaped if possible." },
      context: { type: "string", description: "Optional context to weigh." },
    },
    required: ["question"],
  },
};

// `consult_advisor` is unadvertised but accepted for one release as an alias
// of `summon_best_advisor`. Any `agent_id` arg is captured as a hint only —
// the router still selects.
const TOOLS = [TOOL_RUN_COUNCIL, TOOL_SUMMON_BEST_ADVISOR, TOOL_COUNCIL_TO_NOTION, TOOL_LIST_AGENTS];

function rpcError(id: any, code: number, message: string, status = 200): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

function rpcResult(id: any, result: any): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

// Constant-time compare to resist token-timing probes.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = (supabaseUrl && serviceRole)
  ? createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })
  : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Headers":
          "authorization, content-type, mcp-session-id, x-client-info, apikey",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return rpcError(null, -32600, "method_not_allowed", 405);
  }

  // Dual-mode auth gate · before parsing body.
  //   1. Legacy static SPINNEY bearer (kept for curl regression + Phase-2 transition)
  //   2. Supabase OAuth 2.1 JWT (client-registerable connector path)
  const expected = Deno.env.get("COUNCIL_TENANT_TOKEN_SPINNEY") ?? "";
  const allowTestContext = Deno.env.get("COUNCIL_ALLOW_TEST_CONTEXT") === "1";
  const authz = req.headers.get("Authorization") ?? "";
  const m = authz.match(/^Bearer\s+(.+)$/i);

  let identity: ResolvedIdentity | null = null;
  let authMode: "static" | "oauth" | null = null;

  if (m) {
    const token = m[1].trim();
    if (expected && safeEqual(token, expected)) {
      authMode = "static";
      identity = { tenant: "SPINNEY", sub: "static-bearer", scope: "", clientId: null };
    } else {
      try {
        identity = await verifySupabaseJwt(token);
        authMode = "oauth";
      } catch (_e) {
        identity = null;
      }
    }
  }

  if (!identity || !authMode) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: "unauthorized" },
      }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          ...unauthorizedHeaders("invalid_token"),
        },
      },
    );
  }
  // SECURITY INVARIANT: `tenant` is sourced EXCLUSIVELY from the verified
  // identity — static SPINNEY bearer or `app_metadata.tenant` from the
  // ES256-verified JWT (see auth.ts). It is NEVER read from the JSON-RPC
  // body, tool arguments, query string, or any client-controlled header.
  // The legal-seat and tenant-context lookups below depend on this.
  const tenant = identity.tenant;

  // Rate limit · per-IP, 30 req/min.
  if (supabaseAdmin) {
    const ip = getClientIp(req.headers);
    try {
      const rl = await checkRateLimitDb(
        supabaseAdmin,
        "mcp-council",
        ip,
        30,
        60_000,
      );
      if (!rl.allowed) {
        return rpcError(null, -32002, "rate_limited", 429);
      }
    } catch (_e) {
      // Fail-open on rate-limiter outage · log only, do not leak to client.
      console.error("rate_limit_error");
    }
  }


  let body: any;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "parse_error", 400);
  }

  const id = body?.id ?? null;
  const method = body?.method;

  if (typeof method !== "string") {
    return rpcError(id, -32600, "invalid_request");
  }

  try {
    if (method === "initialize") {
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }

    if (method === "notifications/initialized") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (method === "tools/list") {
      return rpcResult(id, { tools: TOOLS });
    }

    if (method === "tools/call") {
      const params = body?.params ?? {};
      const name = params?.name;
      const args = params?.arguments ?? {};

      const safeErrors = new Set([
        "boundary_violation",
        "minute_shape",
        "minute_unparseable",
        "upstream_failed",
        "upstream_unavailable",
        "upstream_empty",
        "notion_write_failed",
        "notion_not_configured",
      ]);
      const toRpc = (e: unknown) => {
        const msg = e instanceof Error ? e.message : "internal_error";
        const code = safeErrors.has(msg) ? msg : "internal_error";
        if (code === "boundary_violation") {
          return rpcError(id, -32000, "boundary_violation");
        }
        return rpcError(id, -32003, code);
      };

      if (name === "show_council") {
        // Tenant comes from the verified identity (see invariant above).
        const roster = listSeatedAgentsPublic(tenant);
        const lines = roster.map((a) => `- ${a.name} (${a.id}) · ${a.lens}`).join("\n");
        const text = `Advisors currently seated on your Council:\n${lines}`;
        const structured = { advisors: roster };
        return rpcResult(id, {
          content: [{ type: "text", text }],
          structuredContent: structured,
          isError: false,
        });
      }

      // Tier-1 grounding seam · `_client_context` (test field).
      // Phase 2B hardening: ignored entirely on OAuth path (prompt-injection
      // surface). Static-bearer path accepts it only when the env opt-in is
      // set, so curl validation of the seam still works during transition.
      const clientContext =
        (authMode === "static" && allowTestContext &&
          typeof args?._client_context === "string")
          ? args._client_context.slice(0, 8000)
          : "";

      if (name === "convene_council") {
        const question = typeof args?.question === "string" ? args.question.trim() : "";
        const context = typeof args?.context === "string" ? args.context : "";
        if (!question) return rpcError(id, -32602, "invalid_params");
        if (question.length > 4000 || context.length > 8000) {
          return rpcError(id, -32602, "invalid_params");
        }
        try {
          const { minute, passes, iters, capped, gap, metrics } = await runCouncilGated(
            question, context, clientContext, tenant);
          const out: any = { ...minute };
          if (capped) { out.capped = true; if (gap) out.gap = gap; }
          const qhash = await hashQuestion(question);
          // Structured metric log · machine-grep friendly. Routing /
          // capability-gap ledgers consume this line.
          console.log("convene_metrics", JSON.stringify({
            tool: "convene_council",
            tenant,
            question_hash: qhash,
            ...metrics,
            iters,
            capped,
            epsilon: minute.confidence.epistemic,
            rho: minute.confidence.rigor,
          }));
          await recordMcpUsage(supabaseAdmin, {
            tenant, tool: "convene_council", agent_id: null, passes,
            routing_log: {
              question_hash: qhash,
              triage: { primary_lane: "council", lane_confidence: 1, one_way_door: false, stakes: "n/a", mode: "council" },
              gates_fired: capped ? ["floor", "capped"] : ["floor"],
              selected_advisor: "council",
              escalated: false,
              final_mode: "council",
              epsilon: minute.confidence.epistemic,
              rho: minute.confidence.rigor,
              capped, iters, hops: 0,
              convene_metrics: metrics,
            },
          });
          return rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(out) }],
            structuredContent: out,
            isError: false,
          });
        } catch (e) {
          return toRpc(e);
        }
      }

      // summon_best_advisor (and the consult_advisor alias for one release).
      if (name === "summon_best_advisor" || name === "consult_advisor") {
        const question = typeof args?.question === "string" ? args.question.trim() : "";
        const context = typeof args?.context === "string" ? args.context : "";
        // Backwards alias: agent_id is captured as a hint only — logged,
        // never honored as a directive. The router still selects.
        const routingHintIgnored =
          name === "consult_advisor" && typeof args?.agent_id === "string" && !!args.agent_id.trim();
        if (routingHintIgnored) {
          console.log("routing_hint_ignored", { hint: args.agent_id, tenant });
        }
        if (!question) return rpcError(id, -32602, "invalid_params");
        if (question.length > 4000 || context.length > 8000) {
          return rpcError(id, -32602, "invalid_params");
        }
        try {
          const { result, passes } = await runSummonBestAdvisor({
            question, context, clientContext, tenant, routingHintIgnored,
          });
          const qhash = await hashQuestion(question);
          await recordMcpUsage(supabaseAdmin, {
            tenant, tool: "summon_best_advisor",
            agent_id: result.mode === "solo" ? result.selected_advisor : null,
            passes,
            routing_log: {
              question_hash: qhash,
              triage: {
                primary_lane: result.routing_trace.triage.primary_lane,
                lane_confidence: result.routing_trace.triage.lane_confidence,
                one_way_door: result.routing_trace.triage.one_way_door,
                stakes: result.routing_trace.triage.stakes,
                mode: result.routing_trace.triage.recommended_mode,
              },
              gates_fired: result.routing_trace.gates_fired,
              selected_advisor: result.selected_advisor,
              escalated: result.routing_trace.hops > 0 || result.mode !== result.routing_trace.triage.recommended_mode,
              final_mode: result.mode,
              epsilon: result.epsilon,
              rho: result.rho,
              capped: result.capped,
              iters: result.routing_trace.iters,
              hops: result.routing_trace.hops,
              routing_hint_ignored: routingHintIgnored || undefined,
            },
          });
          return rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
            isError: false,
          });
        } catch (e) {
          return toRpc(e);
        }
      }

      if (name === "file_to_office") {
        const question = typeof args?.question === "string" ? args.question.trim() : "";
        const context = typeof args?.context === "string" ? args.context : "";
        if (!question) return rpcError(id, -32602, "invalid_params");
        if (question.length > 4000 || context.length > 8000) {
          return rpcError(id, -32602, "invalid_params");
        }
        try {
          // file_to_office runs the same triage → mode pipeline so OFFICE
          // entries reflect the actual deliberation that happened.
          const { result, passes } = await runSummonBestAdvisor({
            question, context, clientContext, tenant, routingHintIgnored: false,
          });
          // Only minutes with a council-shape (recommendation + dissent +
          // horizon) file cleanly to Notion. Single-advisor minutes get
          // wrapped into a council-shape envelope so the OFFICE write works.
          const m: any = result.minute;
          const filedMinute: MinuteShape = (m.dissent && m.anticipatory_horizon)
            ? m as MinuteShape
            : {
                recommendation: m.recommendation,
                dissent: m.steelman && m.steelman.trim()
                  ? m.steelman
                  : "No formal dissent · single-advisor minute.",
                anticipatory_horizon: Array.isArray(m.risk_flags) && m.risk_flags.length
                  ? m.risk_flags.slice(0, 5)
                  : ["No horizon items surfaced by the advisor."],
                confidence: m.confidence,
                freshness: new Date().toISOString(),
                participating_chairs: [result.selected_advisor],
                signature: "— COB_COUNCIL",
              };

          const notionPayloadText = [
            question,
            filedMinute.recommendation,
            filedMinute.dissent,
            filedMinute.anticipatory_horizon.join(" · "),
            filedMinute.participating_chairs.join(" · "),
          ].join("\n");
          if (hasBoundaryViolation(notionPayloadText)) {
            await recordMcpUsage(supabaseAdmin, {
              tenant, tool: "file_to_office", agent_id: null, passes,
            });
            throw new Error("boundary_violation");
          }

          const { url: notion_url } = await writeMinuteToNotion(filedMinute, question);
          const qhash = await hashQuestion(question);
          await recordMcpUsage(supabaseAdmin, {
            tenant, tool: "file_to_office",
            agent_id: result.mode === "solo" ? result.selected_advisor : null,
            passes,
            routing_log: {
              question_hash: qhash,
              triage: {
                primary_lane: result.routing_trace.triage.primary_lane,
                lane_confidence: result.routing_trace.triage.lane_confidence,
                one_way_door: result.routing_trace.triage.one_way_door,
                stakes: result.routing_trace.triage.stakes,
                mode: result.routing_trace.triage.recommended_mode,
              },
              gates_fired: result.routing_trace.gates_fired,
              selected_advisor: result.selected_advisor,
              escalated: result.routing_trace.hops > 0 || result.mode !== result.routing_trace.triage.recommended_mode,
              final_mode: result.mode,
              epsilon: result.epsilon,
              rho: result.rho,
              capped: result.capped,
              iters: result.routing_trace.iters,
              hops: result.routing_trace.hops,
            },
          });
          const out = { minute: filedMinute, notion_url, routing_trace: result.routing_trace };
          return rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(out) }],
            structuredContent: out,
            isError: false,
          });
        } catch (e) {
          return toRpc(e);
        }
      }


      return rpcError(id, -32601, "unknown_tool");
    }


    return rpcError(id, -32601, "method_not_found");
  } catch (_e) {
    return rpcError(id, -32603, "internal_error");
  }
});
