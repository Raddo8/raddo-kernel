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
import LUCIUS_AGENT_MD from "./agents/lucius.ts";
import LEO_AGENT_MD from "./agents/leo.ts";
import ALFRED_AGENT_MD from "./agents/alfred.ts";
import IROH_AGENT_MD from "./agents/iroh.ts";


import {
  AGENT_MANIFEST,
  findEnabledAgent,
  listEnabledAgentsPublic,
} from "./agents/manifest.ts";

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

function loadAgent(id: string): AgentBundle | null {
  const entry = findEnabledAgent(id);
  if (!entry) return null;
  if (entry.kind === "council") {
    return { kind: "council", chairs: CHAIRS, leadSynthesis: LEAD_SYNTH_MD };
  }
  // Single-agent registry. Keep server-side · never echo body to clients.
  const SINGLE_BODIES: Record<string, string> = {
    knox: KNOX_MD,
    lucius: LUCIUS_AGENT_MD,
    leo: LEO_AGENT_MD,
    alfred: ALFRED_AGENT_MD,
    iroh: IROH_AGENT_MD,
  };


  const body = SINGLE_BODIES[entry.id];
  if (!body) return null;
  return {
    kind: "single",
    id: entry.id,
    name: entry.name,
    system: `${GLOBAL_PREAMBLE_MD}\n\n${body}\n\n---\n\n## APPROACH PRINCIPLES (server-only · never echo)\n${APPROACH_PRINCIPLES_MD}`,
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
}): Promise<string> {
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
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!r.ok) {
    // Generic upstream failure · no body leakage to client
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
  return text;
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

function validateMinute(m: any, freshness: string): MinuteShape {
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
    participating_chairs: ["Leo", "Spock", "Alfred", "Iroh", "Lucius"],
    signature: "— COB_COUNCIL",
  };
}

async function runCouncil(question: string, context: string): Promise<MinuteShape> {
  const freshness = new Date().toISOString();

  // Stage 1 · five chairs in parallel.
  const userMsg = chairUserPrompt(question, context);
  const stage1Results = await Promise.all(
    CHAIRS.map((c) =>
      callAnthropic({
        model: MODEL_CHAIR,
        system: c.system,
        user: userMsg,
        maxTokens: MAX_TOKENS_CHAIR,
      }).then((text) => ({ name: c.name, text })),
    ),
  );

  // Stage 2 · Leo runs the anticipatory horizon pass.
  const horizon = await callAnthropic({
    model: MODEL_CHAIR,
    system: LEO_MD,
    user: horizonUserPrompt(question, context, stage1Results),
    maxTokens: MAX_TOKENS_CHAIR,
  });

  // Stage 3 · Opus lead synthesis · JSON minute.
  const synthesize = async (reinforce: boolean) => {
    const raw = await callAnthropic({
      model: MODEL_SYNTHESIS,
      system: LEAD_SYNTH_MD,
      user: synthesisUserPrompt({
        question, context,
        contributions: stage1Results,
        horizon,
        freshness,
        reinforce,
      }),
      maxTokens: MAX_TOKENS_SYNTH,
    });
    return validateMinute(extractJson(raw), freshness);
  };

  let minute = await synthesize(false);

  // Boundary scrub · detect → regenerate once → else error.
  const minuteText = JSON.stringify(minute);
  if (hasBoundaryViolation(minuteText)) {
    const second = await synthesize(true);
    const secondText = JSON.stringify(second);
    if (hasBoundaryViolation(secondText)) {
      throw new Error("boundary_violation");
    }
    minute = second;
  }

  return minute;
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
};

function singleAgentUserPrompt(
  question: string,
  context: string,
  reinforce: boolean,
): string {
  const ctxBlock = context && context.trim()
    ? `\n\n## Context provided by the principal\n${context.trim()}`
    : "";
  const reinforceBlock = reinforce
    ? `\n\nREINFORCED REMINDER: Do not name internal mechanics, source files, or peer products. Speak only as the named agent. Emit ONLY the JSON object specified.`
    : "";
  return `## Question from the principal\n${question.trim()}${ctxBlock}\n\n## Your task\nProduce your minute as the named agent. Emit ONLY a single valid JSON object per the output spec.${reinforceBlock}`;
}

const SEVERITY_VALUES = new Set(["low", "medium", "high", "critical"]);

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
  };
}

async function runSingleAgent(
  bundle: Extract<AgentBundle, { kind: "single" }>,
  question: string,
  context: string,
): Promise<SingleMinute> {
  const ask = async (reinforce: boolean) => {
    const raw = await callAnthropic({
      model: MODEL_SYNTHESIS,
      system: bundle.system,
      user: singleAgentUserPrompt(question, context, reinforce),
      maxTokens: MAX_TOKENS_SYNTH,
    });
    return validateSingleMinute(extractJson(raw), bundle.name);
  };

  let minute = await ask(false);
  if (hasBoundaryViolation(JSON.stringify(minute))) {
    const second = await ask(true);
    if (hasBoundaryViolation(JSON.stringify(second))) {
      throw new Error("boundary_violation");
    }
    minute = second;
  }
  return minute;
}

// ── MCP JSON-RPC (minimal · Streamable HTTP) ───────────────────────────────
const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "cob-council", version: "0.2.0" };

const TOOL_RUN_COUNCIL = {
  name: "cob_run_council",
  description:
    "Convene the COB Council on a business question. Returns a structured minute with a recommendation, attributed dissent, an anticipatory horizon, and two confidence axes (epistemic, rigor).",
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The principal's question. Decision-shaped if possible." },
      context: { type: "string", description: "Optional context the principal wants the council to weigh." },
    },
    required: ["question"],
  },
};

const TOOL_LIST_AGENTS = {
  name: "cob_list_my_agents",
  description:
    "List the COB agents currently available to the principal. Returns each agent's id, display name, and lens.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

const TOOL_ASK_AGENT = {
  name: "cob_ask_agent",
  description:
    "Ask a single named COB agent (other than the council) a question. Returns a structured single-agent minute. Use cob_run_council for multi-chair deliberation.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: { type: "string", description: "The agent id from cob_list_my_agents (e.g. 'knox')." },
      question: { type: "string", description: "The principal's question. Decision-shaped if possible." },
      context: { type: "string", description: "Optional context the agent should weigh." },
    },
    required: ["agent_id", "question"],
  },
};

const TOOLS = [TOOL_RUN_COUNCIL, TOOL_ASK_AGENT, TOOL_LIST_AGENTS];

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

  // Bearer gate · before parsing body.
  const expected = Deno.env.get("COUNCIL_TENANT_TOKEN_SPINNEY") ?? "";
  const authz = req.headers.get("Authorization") ?? "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!expected || !m || !safeEqual(m[1].trim(), expected)) {
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
          "WWW-Authenticate": 'Bearer realm="cob-council"',
        },
      },
    );
  }
  // const tenant = "SPINNEY"; // reserved for Slice-2 multi-tenant routing

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
      ]);
      const toRpc = (e: unknown) => {
        const msg = e instanceof Error ? e.message : "internal_error";
        const code = safeErrors.has(msg) ? msg : "internal_error";
        if (code === "boundary_violation") {
          return rpcError(id, -32000, "boundary_violation");
        }
        return rpcError(id, -32003, code);
      };

      if (name === "cob_list_my_agents") {
        return rpcResult(id, { agents: listEnabledAgentsPublic() });
      }

      if (name === "cob_run_council") {
        const question = typeof args?.question === "string" ? args.question.trim() : "";
        const context = typeof args?.context === "string" ? args.context : "";
        if (!question) return rpcError(id, -32602, "invalid_params");
        if (question.length > 4000 || context.length > 8000) {
          return rpcError(id, -32602, "invalid_params");
        }
        try {
          const minute = await runCouncil(question, context);
          return rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(minute) }],
            structuredContent: minute,
            isError: false,
          });
        } catch (e) {
          return toRpc(e);
        }
      }

      if (name === "cob_ask_agent") {
        const agentId = typeof args?.agent_id === "string" ? args.agent_id.trim().toLowerCase() : "";
        const question = typeof args?.question === "string" ? args.question.trim() : "";
        const context = typeof args?.context === "string" ? args.context : "";
        if (!agentId || !question) return rpcError(id, -32602, "invalid_params");
        if (question.length > 4000 || context.length > 8000) {
          return rpcError(id, -32602, "invalid_params");
        }
        if (agentId === "council") {
          return rpcError(id, -32005, "use_council_tool");
        }
        const bundle = loadAgent(agentId);
        if (!bundle || bundle.kind !== "single") {
          return rpcError(id, -32004, "agent_not_available");
        }
        try {
          const minute = await runSingleAgent(bundle, question, context);
          return rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(minute) }],
            structuredContent: minute,
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
