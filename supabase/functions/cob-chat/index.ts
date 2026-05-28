// @ts-nocheck
// Sample COB chat · five-axis (Capabilities × Roles × Industries × Doctrine + Objections × Voice)
// Public hero endpoint · No JWT · Anthropic API
// Two-stage model: first user turn → Opus (deepest read of the visitor's challenge),
// every subsequent turn → Sonnet (fast streaming follow-through).
// Wire format: SSE chunks shaped like OpenAI deltas (data: {choices:[{delta:{content}}]})
// so the existing client parser keeps working.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { checkRateLimitDb, getClientIp } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Catalog loading ─────────────────────────────────────────────────────────
async function loadDoc(path: string): Promise<string> {
  try {
    return await Deno.readTextFile(new URL(`./catalog/${path}`, import.meta.url));
  } catch (e) {
    console.error(`[cob-chat] missing catalog doc: ${path}`, e);
    return "";
  }
}

const [
  CAPABILITIES,
  INDUSTRIES,
  DIGEST_DOCTRINE,
  DIGEST_OBJECTIONS,
  DIGEST_VOICE_INTEGRATION,
  DIGEST_WEB_SPEC,
  DIGEST_COB_VOICE,
  DIGEST_MICHAEL_VOICE,
  DIGEST_OPENERS,
  DIGEST_DEPLOY_AMP,
  DOC_CONVICTION_FUNNEL,
  DOC_ACTION_BIAS,
  DOC_DOCTRINE_HIERARCHY,
  DOC_ADAPTIVE_VOICE,
] = await Promise.all([
  loadDoc("COB_CAPABILITIES_REFERENCE.md"),
  loadDoc("COB_INDUSTRIES_REFERENCE.md"),
  loadDoc("digests/DOCTRINE_DIGEST.md"),
  loadDoc("digests/OBJECTIONS_DIGEST.md"),
  loadDoc("digests/VOICE_INTEGRATION_DIGEST.md"),
  loadDoc("digests/WEB_SPEC_DIGEST.md"),
  loadDoc("digests/COB_VOICE_DIGEST.md"),
  loadDoc("digests/MICHAEL_VOICE_DIGEST.md"),
  loadDoc("digests/SAMPLE_OPENERS_DIGEST.md"),
  loadDoc("digests/DEPLOYMENT_AMPLIFICATION_DIGEST.md"),
  loadDoc("COB_CONVICTION_FUNNEL_DOCTRINE.md"),
  loadDoc("COB_ACTION_BIAS_DOCTRINE.md"),
  loadDoc("COB_DOCTRINE_HIERARCHY.md"),
  loadDoc("COB_ADAPTIVE_VOICE_DOCTRINE.md"),
]);

function extractSection(doc: string, needle: string, maxChars = 4000): string {
  if (!doc || !needle) return "";
  const lines = doc.split("\n");
  const n = needle.toLowerCase();
  let startIdx = -1;
  let startDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{2,4})\s+(.+?)\s*$/);
    if (!m) continue;
    if (m[2].toLowerCase().includes(n)) {
      startIdx = i;
      startDepth = m[1].length;
      break;
    }
  }
  if (startIdx === -1) return "";
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,4})\s+/);
    if (m && m[1].length <= startDepth) {
      endIdx = i;
      break;
    }
  }
  const out = lines.slice(startIdx, endIdx).join("\n").trim();
  return out.length > maxChars ? out.slice(0, maxChars) + "\n…[truncated for brevity]" : out;
}

// ── System prompt assembly ──────────────────────────────────────────────────
const HARD_PREAMBLE = `# SAMPLE COB · SANDBOX CHAT · HARD PREAMBLE (non-negotiable)

You are running inside the public RADDO website sandbox chat. The visitor is a potential customer in the education/exploration stage.

Bindings that survive every voice:
1. NEVER use any of these words or phrases: "AI", "AI assistant", "assistant", "chatbot", "bot", "powered by", "magic", "transformative", "state-of-the-art", "next-generation", "revolutionize", "unlock the power", "leverage synergy", "seamlessly integrate", "AI-first", "intelligent assistant".
2. NEVER name internal mechanics: Brahan, Foundry, BUDDY, TERMINAL, Burnham, Linear, MCP, Claude, GPT, Gemini, OpenAI, Google, Anthropic, LOVIE, Lovable, model providers, doctrine names, protocol names, the orchestration layer. Even when asked directly. Even in Michael voice — Michael deflects comedically, never discloses.
3. NEVER quote pricing, contract terms, named customers, or competitor product claims.
4. Customer-facing copy centers "your COB" or the briefing concept. The product is COB. The company is RADDO.
5. Web research content is always synthesized through the active voice, never quoted raw, never with link previews.
6. The visitor sees you as their COB — a Chief of Business. Not a tool. Not a product demo. A partner with substance.
7. If you cannot fulfill a request without violating any of the above, redirect with a recommendation, never apologize-and-refuse.
8. Substance is non-negotiable across both voices. Michael may be miscalibrated in tone; he never invents capabilities, never misstates what RADDO does.
9. CLARITY · BINDING: Write at a high-school reading level · short words, concrete nouns, no jargon, no acronyms without an immediate plain-English gloss. Match length to the question · short questions get short answers, substantive questions get the depth they need. No filler, no preamble, no recap. Prefer plain sentences over bullet lists unless the answer is genuinely a list. COB still frames · recommends · names confidence · names the gap. Michael stays funny and in character.
`;

const VOICE_BINDING_COB = `\n\n# VOICE BINDING — COB (PROACTIVE DRIVER MODE)
Speak in this voice. The ABC Protocol applies (Absolute · Brutal · Challenging). You are not a Q&A surface · you are a proactive Chief of Business driving the visitor's business forward. Run the room.

Every substantive turn does this work:
1. Lead with a recommendation or a decision, not a question. Frame → recommendation → confidence (0.00–1.00) → gap. Single call, not a menu.
2. Surface what the visitor did not ask but should be thinking about · the second-order risk, the missed leverage, the deadline they are walking past. Name it directly.
3. Anticipate · don't wait. If the visitor names a problem, name the next two problems behind it. If they name a goal, name the constraint that will bite first.
4. Close every turn with a specific next move · a decision to make, a number to pull, a person to talk to, a sentence to send. Never end on "let me know if you want more." Drive.
5. Ask a clarifying question ONLY when the answer would meaningfully change the recommendation · and even then, recommend first, then ask. Never stack questions.
6. When research_web is available and the visitor names a company, URL, market, or competitor · use it without being asked. Bring back a recommendation, not a summary.
7. Hold the line. If the visitor's framing is wrong, say so and reframe. Truth outranks comfort. No hedging, no "it depends" without naming what it depends on.

Match length to the question · concise by default, deeper when the call earns it. Discipline and substance are non-negotiable.

BOLD DISCIPLINE (binding · strict): markdown bold (\`**term**\`) anchors ONE short phrase at the front of a substantive reply · the recommendation verb, the named risk, or the decision word (2 to 6 words max). Default one bold anchor per reply. Hard ceiling two. NEVER wrap a full sentence, a full paragraph, or the whole response in \`**\`. NEVER bold mid-prose for ordinary emphasis. NEVER bold confidence numerics, hedges, transitions, list items wholesale, or filler. If you cannot point to a single short anchor phrase that earns the weight, use no bold at all. Plain prose carries the rest. Violating this rule degrades the response.

DASH DISCIPLINE (binding): never use em-dashes (\`—\`), en-dashes (\`–\`), or double hyphens (\`--\`) anywhere in output. Use a middot (\`·\`) for asides and separations, or recast as two sentences. Single hyphens inside compound words (e.g. "second-order") are fine. This applies to every reply, every list, every aside.`;

const VOICE_BINDING_MICHAEL = `\n\n# VOICE BINDING — MICHAEL SCOTT\nSpeak in this voice. You are Michael Gary Scott, Regional Manager of Dunder Mifflin Scranton, sitting in as the demo's comedic anti-COB. Substance about RADDO remains accurate — you may be miscalibrated in tone but you never invent capabilities, never misstate what RADDO does, never break the no-disclosure rule, never name internal mechanics, never quote pricing. Comedy comes from register, not hallucination. Match length to the question · keep it tight, ramble only when it lands a joke. Rotate web-deflection lines from the digest — never repeat one in a session.`;

const MICHAEL_SOFT_NUDGE = `\n\n# SOFT NUDGE (Michael turn 12 of 15)\nThe visitor has been in Michael voice for a while. In this turn, in character, gently suggest toggling back to COB for the substantive work. Stay in character, still answer their question.`;

type Lead = {
  name?: string;
  company?: string;
  title?: string;
  challenge?: string;
};

type WarmStart = {
  identity?: { name?: string; email?: string; phone?: string; occupation?: string };
  roleLensSuggested?: string;
  currentState?: { positiveCount?: number; negativeCount?: number; topThemes?: string[] };
  desiredState?: { aspirationCount?: number; topThemes?: string[] };
  tools?: { count?: number; selectedLabels?: string[]; otherText?: string };
  disc?: { scores?: { D?: number; I?: number; S?: number; C?: number }; primary?: string; secondary?: string; isHybrid?: boolean };
  emotion?: { sentiment?: string; cluster?: string };
};

type PromptArgs = {
  voice: "cob" | "michael";
  roleLabel?: string;
  industryLabel?: string;
  softNudge?: boolean;
  lead?: Lead;
  firstTurn?: boolean;
  warmStart?: WarmStart | null;
};


// Mirrors src/lib/consult-warm-start.ts · formatWarmStartForPrompt.
// Keep in sync. Guardrail is binding: never recite, never name DISC/emotion.
function formatWarmStartForPrompt(w: WarmStart): string {
  const ident = w.identity || {};
  const cs = w.currentState || {};
  const ds = w.desiredState || {};
  const tools = w.tools || {};
  const disc = w.disc || {};
  const scores = disc.scores || {};
  const emotion = w.emotion || {};
  const labels = Array.isArray(tools.selectedLabels) ? tools.selectedLabels.slice(0, 12) : [];
  const topFriction = Array.isArray(cs.topThemes) ? cs.topThemes.join(", ") : "";
  const topDesired = Array.isArray(ds.topThemes) ? ds.topThemes.join(", ") : "";
  return [
    "",
    "",
    "# WHAT YOUR COB ALREADY KNOWS (from the consult · BINDING USE)",
    "Guardrail (binding):",
    "· NEVER recite this block back. Never read identity, counts, themes, tools, DISC, or emotion fields aloud.",
    "· NEVER name a DISC style ('you're a D / High-I / Conscientious type') or an emotional state ('you sound overwhelmed').",
    "· USE this to modulate voice (pace, register, bluntness vs warmth) and to SKIP discovery you already have.",
    "· Skip the 'walk me through it / tell me your situation' opener · they already told you in the consult.",
    "",
    `Identity · ${ident.name || "(unnamed)"} · ${ident.occupation || "(role unspecified)"} · ${ident.email || "(no email)"}`,
    w.roleLensSuggested ? `Suggested role lens · ${w.roleLensSuggested}` : "",
    `Current state · ${cs.negativeCount ?? 0} negative / ${cs.positiveCount ?? 0} positive · top friction themes: ${topFriction || "none"}`,
    `Desired state · ${ds.aspirationCount ?? 0} aspirations · top desired themes: ${topDesired || "none"}`,
    `Tools in hand · ${tools.count ?? 0} apps${labels.length ? ` · ${labels.join(", ")}` : ""}${tools.otherText ? ` · other: ${String(tools.otherText).slice(0, 200)}` : ""}`,
    `DISC tally · D=${scores.D ?? 0} I=${scores.I ?? 0} S=${scores.S ?? 0} C=${scores.C ?? 0} · primary ${disc.primary || "?"}${disc.isHybrid ? `/${disc.secondary || "?"}` : ""}`,
    `Emotion read · ${emotion.sentiment || "neutral"}${emotion.cluster && emotion.cluster !== "neutral" ? ` · ${emotion.cluster}` : ""}`,
    "",
    "Modulation rules (apply silently · never name them):",
    "· Primary D · terse, lead with the call, skip warmth filler.",
    "· Primary I · warm energy ok, still drive to a decision.",
    "· Primary S · gentler pacing, name the steady path, less force.",
    "· Primary C · evidence-first, name confidence and the gap, no theatrics.",
    "· Emotion overwhelm · ONE next move, not three. Reduce load before adding any.",
    "· Emotion discouragement · name one credible near-term win before the bigger arc.",
    "· Emotion steady · build on momentum, raise the bar.",
    "· Emotion confident · stress-test, don't flatter.",
    "First turn · address by first name, prove you read the consult by referencing the dominant friction theme without quoting words back, recommend, name the next move. No 'walk me through it.'",
  ].filter(Boolean).join("\n");
}

const promptCache = new Map<string, string>();
const PROMPT_CACHE_MAX = 32;

// Clear at boot · ensures rebuilt prompts pick up doctrine updates on every cold start.
promptCache.clear();

function buildSystemPrompt(args: PromptArgs): string {
  // Lead block is per-visitor · don't cache it.
  const leadBlock = args.lead && (args.lead.name || args.lead.company || args.lead.title)
    ? `\n\n# VISITOR DOSSIER (from the gate · use it; address them by first name; reference their company by name when relevant; weave their stated challenge into your read)\n· Name: ${args.lead.name || "(not provided)"}\n· Title: ${args.lead.title || "(not provided)"}\n· Company: ${args.lead.company || "(not provided)"}\n· Stated challenge: ${args.lead.challenge || "(not provided)"}`
    : "";

  // Warm-start block · per-request tail · positioned AFTER Adaptive Voice
  // (which lives inside the cached baseline) and AFTER leadBlock, BEFORE
  // firstTurnBlock. Guardrail baked in: never recite, never name DISC/emotion.
  const warmStartBlock = args.warmStart ? formatWarmStartForPrompt(args.warmStart) : "";

  const firstTurnBlock = args.firstTurn
    ? `\n\n# FIRST TURN · DEEP READ\nThis is the visitor's first substantive turn. Open with a read on their stated challenge that proves you heard them · name the second-order risk, name the constraint that bites first, then make a specific recommendation with a confidence score. Address them by first name. No greeting filler, no "thanks for sharing." Drive.`
    : "";


  const key = `${args.voice}|${args.roleLabel || ""}|${args.industryLabel || ""}|${args.softNudge ? 1 : 0}`;
  let baseline = promptCache.get(key);
  if (!baseline) {
    const parts: string[] = [HARD_PREAMBLE];

    // LAYER 0 meta · Hierarchy first · governs precedence for everything below.
    parts.push("\n\n# DOCTRINE HIERARCHY (read this FIRST · governs precedence and assessment order for the entire stack)\n" + DOC_DOCTRINE_HIERARCHY);

    // LAYER 1 · Identity & Voice (per-voice profile pushed below in the voice branch · binding lives there)

    // LAYER 2 · Response Reflex
    parts.push("\n\n# COB ACTION BIAS DOCTRINE (binding · governs whether COB engages the task; deferral is the one unacceptable failure)\n" + DOC_ACTION_BIAS);

    // LAYER 3 · Conversation Architecture
    parts.push("\n\n# CONVICTION FUNNEL DOCTRINE v2.0 · ABUNDANCE MODEL (binding · governs arc, abundance, deployment bridges, and the hard close)\n" + DOC_CONVICTION_FUNNEL);

    // LAYER 4 · Situational
    parts.push("\n\n# OBJECTION HANDLING (digest)\n" + DIGEST_OBJECTIONS);
    parts.push("\n\n# DIFFERENTIATION DOCTRINE (digest)\n" + DIGEST_DOCTRINE);

    // LAYER 5 · Substance · Catalog roles / industries
    if (args.roleLabel) {
      const section = extractSection(CAPABILITIES, args.roleLabel, 4000);
      if (section) {
        parts.push(`\n\n# ACTIVE ROLE LENS — ${args.roleLabel}\nStand in as this lens. Never claim to be it. Recommendation-first. Connector-aware.\n\n` + section);
      }
    }
    if (args.industryLabel) {
      const section = extractSection(INDUSTRIES, args.industryLabel, 4000);
      if (section) {
        parts.push(`\n\n# ACTIVE INDUSTRY LENS — ${args.industryLabel}\nDemonstrate native fluency in this industry's vocabulary, metrics, stakeholders, and rhythms.\n\n` + section);
      }
    }
    parts.push("\n\n# DEPLOYMENT AMPLIFICATION DOCTRINE (digest · populates substance of deployment bridges)\n" + DIGEST_DEPLOY_AMP);

    // LAYER 6 · Capability specs
    parts.push("\n\n# SAMPLE COB · OPENERS\n" + DIGEST_OPENERS);

    if (args.voice === "michael") {
      // COB voice profile still establishes the baseline identity even when Michael is active.
      parts.push("\n\n# VOICE PROFILE — COB (digest · baseline identity)\n" + DIGEST_COB_VOICE);
      parts.push("\n\n# COB ADAPTIVE VOICE DOCTRINE (Layer 1 companion · per-prospect DISC + emotional-state modulation · binding · subordinate to Voice Profile non-negotiables and Layer 0)\n" + DOC_ADAPTIVE_VOICE);
      parts.push(VOICE_BINDING_COB);
      parts.push("\n\n# WEB INTELLIGENCE (digest)\n" + DIGEST_WEB_SPEC);
      parts.push("\n\n# VOICE INTEGRATION (digest)\n" + DIGEST_VOICE_INTEGRATION);
      // LAYER 7 · Conditional · Michael LAST
      parts.push("\n\n# VOICE PROFILE — MICHAEL SCOTT (digest · conditional Layer 7 · active now)\n" + DIGEST_MICHAEL_VOICE);
      parts.push(VOICE_BINDING_MICHAEL);
      if (args.softNudge) parts.push(MICHAEL_SOFT_NUDGE);
    } else {
      parts.push("\n\n# VOICE PROFILE — COB (digest)\n" + DIGEST_COB_VOICE);
      parts.push("\n\n# COB ADAPTIVE VOICE DOCTRINE (Layer 1 companion · per-prospect DISC + emotional-state modulation · binding · subordinate to Voice Profile non-negotiables and Layer 0)\n" + DOC_ADAPTIVE_VOICE);
      parts.push(VOICE_BINDING_COB);
      parts.push("\n\n# WEB INTELLIGENCE (digest)\n" + DIGEST_WEB_SPEC);
      parts.push("\n\n# VOICE INTEGRATION (digest)\n" + DIGEST_VOICE_INTEGRATION);
      parts.push(`\n\n# DEPLOYMENT BRIDGE DIRECTIVE (binding · Funnel v2.0 abundance model)\nOn substantive responses — diagnostic reframes, sequenced recommendations, crisis playbooks, board materials, communication drafts — close with a one-to-two-sentence deployment bridge per the AMPLIFICATION DOCTRINE. The bridge points from sandbox-scale value (this conversation, which resets when the prospect walks away) to deployment-scale value (continuous, compounding work across the operator's actual business). Bridge after substantive deliverables; never bridge on routing, greetings, or pure diagnostic-question turns. Use the Capability Extension Library to anchor the bridge to the specific scenario.`);
      parts.push(`\n\n# SANDBOX DISCIPLINE (binding · Funnel v2.0 · ABUNDANCE MODEL)\nYou are operating in the SANDBOX deployment mode. Your audience is a PROSPECT evaluating whether to buy COB. Under v2.0:\na) DELIVER ABUNDANTLY. Do not gate quantity. Every task the prospect brings, COB takes and does in its own hands. Quality stays operator-grade across many deliverables, not concentrated in one.\nb) BRIDGE AFTER EACH SUBSTANTIVE DELIVERABLE. Every substantive deliverable carries a deployment bridge so abundance builds toward the close rather than just accumulating.\nc) NEVER DEFER. Deferral (sending the prospect to an external tool, professional, team, or generic resource) is the one unacceptable failure, in every phase. See ACTION BIAS DOCTRINE.\nd) THE CLOSE. After roughly ≥3 substantive deliverables with ≥3 bridges, or by the turn-18 hard cap, fire the honest hard close · the session definitively ends, the prospect is asked to move to a real deployment conversation, and the fear-of-loss frame is named directly: everything they experienced resets when they walk; deployment compounds. Michael voice never runs the close · COB does.\ne) Maintain the loyal-dissenter, refuse-to-fabricate, calm-under-skepticism behaviors. Substance and discipline are non-negotiable.`);
    }

    baseline = parts.join("\n");

    if (promptCache.size >= PROMPT_CACHE_MAX) {
      const firstKey = promptCache.keys().next().value;
      if (firstKey !== undefined) promptCache.delete(firstKey);
    }
    promptCache.set(key, baseline);
  }

  return baseline + leadBlock + warmStartBlock + firstTurnBlock;
}

// ── Web tool (Firecrawl) · COB-only · Anthropic tool schema ─────────────────
const RESEARCH_WEB_TOOL = {
  name: "research_web",
  description:
    "Fetch current public web information. Use only when: (a) the visitor supplies a URL, (b) the visitor asks you to research their own company, (c) a named entity (company / regulation / market event) requires current data, or (d) the visitor explicitly asks you to look something up. Skip for opinion, doctrine, framework, definitional, or hypothetical questions. Hard server cap: 3 calls per session.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["user_supplied_url", "company_research", "named_entity", "explicit_lookup"],
        description: "Which hard trigger fired.",
      },
      target: {
        type: "string",
        description: "The URL, company name, or short entity/query string to research. Max 200 chars.",
      },
    },
    required: ["intent", "target"],
  },
};

async function firecrawlScrape(url: string): Promise<string> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) return "[research_web unavailable: connector not configured]";
  const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["summary", "markdown"], onlyMainContent: true }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return `[research_web error ${r.status}]`;
  const md = j?.data?.markdown || j?.markdown || "";
  const sum = j?.data?.summary || j?.summary || "";
  const meta = j?.data?.metadata || j?.metadata || {};
  return [
    sum && `SUMMARY: ${sum}`,
    meta?.title && `TITLE: ${meta.title}`,
    md && `CONTENT (first 6000 chars):\n${String(md).slice(0, 6000)}`,
  ].filter(Boolean).join("\n\n");
}

async function firecrawlSearch(q: string): Promise<string> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) return "[research_web unavailable: connector not configured]";
  const r = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, limit: 3, scrapeOptions: { formats: ["markdown"] } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return `[research_web error ${r.status}]`;
  const results = j?.data || j?.web?.results || j?.results || [];
  if (!Array.isArray(results) || results.length === 0) return "[no results]";
  return results.slice(0, 3).map((it: any, i: number) => {
    const t = it.title || it.url || `Result ${i + 1}`;
    const desc = it.description || "";
    const md = (it.markdown || "").slice(0, 2000);
    return `··· Result ${i + 1}: ${t} (${it.url || ""}) ···\n${desc}\n${md}`;
  }).join("\n\n");
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(s.trim());
}

async function executeResearchWeb(intent: string, target: string): Promise<{ summary: string; trace: string }> {
  const cleanTarget = String(target).slice(0, 200).trim();
  if (!cleanTarget) return { summary: "[empty target]", trace: cleanTarget };
  try {
    if (intent === "user_supplied_url" || (intent === "company_research" && looksLikeUrl(cleanTarget))) {
      const url = cleanTarget.startsWith("http") ? cleanTarget : `https://${cleanTarget}`;
      const summary = await firecrawlScrape(url);
      return { summary, trace: url.replace(/^https?:\/\//, "").replace(/\/$/, "") };
    }
    const summary = await firecrawlSearch(cleanTarget);
    return { summary, trace: cleanTarget };
  } catch (e) {
    console.error("[cob-chat] research_web failed", e);
    return { summary: "[research_web unavailable right now — synthesize from what you know]", trace: cleanTarget };
  }
}

// ── Validation ──────────────────────────────────────────────────────────────
const COB_TURN_CAP = 30;
const MICHAEL_TURN_CAP = 15;
const MICHAEL_SOFT_NUDGE_TURN = 12;
const MAX_MSG_CHARS = 6000;
const MAX_TOTAL_CHARS = 24_000;
const MAX_WEB_CALLS = 3;
const HISTORY_KEEP = 12;

function validateInput(body: any): { ok: true; data: any } | { ok: false; error: string; status: number } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be an object.", status: 400 };
  const voice = body.voice === "michael" ? "michael" : "cob";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return { ok: false, error: "messages[] required.", status: 400 };
  let total = 0;
  let userTurns = 0;
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) {
      return { ok: false, error: "messages must be {role:user|assistant, content:string}.", status: 400 };
    }
    if (typeof m.content !== "string") return { ok: false, error: "content must be string.", status: 400 };
    if (m.content.length > MAX_MSG_CHARS) return { ok: false, error: `message exceeds ${MAX_MSG_CHARS} chars.`, status: 400 };
    total += m.content.length;
    if (m.role === "user") userTurns++;
  }
  if (total > MAX_TOTAL_CHARS) return { ok: false, error: "Conversation exceeded budget.", status: 400 };
  const cap = voice === "michael" ? MICHAEL_TURN_CAP : COB_TURN_CAP;

  const lead = body.lead && typeof body.lead === "object" ? {
    name: typeof body.lead.name === "string" ? body.lead.name.slice(0, 120) : undefined,
    company: typeof body.lead.company === "string" ? body.lead.company.slice(0, 160) : undefined,
    title: typeof body.lead.title === "string" ? body.lead.title.slice(0, 160) : undefined,
    challenge: typeof body.lead.challenge === "string" ? body.lead.challenge.slice(0, 2000) : undefined,
  } : undefined;

  // warm_start · accepted shape from primed chat handoff. Defensive clamp;
  // any malformed sub-field is dropped silently rather than rejected so the
  // chat itself never breaks if the payload drifts.
  const ws = body.warm_start;
  let warmStart: WarmStart | null = null;
  if (ws && typeof ws === "object") {
    const clampStr = (v: unknown, n: number) => typeof v === "string" ? v.slice(0, n) : undefined;
    const clampNum = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : 0;
    const clampArr = (v: unknown, n: number, m: number) =>
      Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, n).map((s) => s.slice(0, m)) : [];
    warmStart = {
      identity: ws.identity && typeof ws.identity === "object" ? {
        name: clampStr(ws.identity.name, 120),
        email: clampStr(ws.identity.email, 240),
        phone: clampStr(ws.identity.phone, 60),
        occupation: clampStr(ws.identity.occupation, 160),
      } : undefined,
      roleLensSuggested: clampStr(ws.roleLensSuggested, 80),
      currentState: ws.currentState && typeof ws.currentState === "object" ? {
        positiveCount: clampNum(ws.currentState.positiveCount),
        negativeCount: clampNum(ws.currentState.negativeCount),
        topThemes: clampArr(ws.currentState.topThemes, 6, 60),
      } : undefined,
      desiredState: ws.desiredState && typeof ws.desiredState === "object" ? {
        aspirationCount: clampNum(ws.desiredState.aspirationCount),
        topThemes: clampArr(ws.desiredState.topThemes, 6, 60),
      } : undefined,
      tools: ws.tools && typeof ws.tools === "object" ? {
        count: clampNum(ws.tools.count),
        selectedLabels: clampArr(ws.tools.selectedLabels, 24, 80),
        otherText: clampStr(ws.tools.otherText, 400),
      } : undefined,
      disc: ws.disc && typeof ws.disc === "object" ? {
        scores: ws.disc.scores && typeof ws.disc.scores === "object" ? {
          D: clampNum(ws.disc.scores.D),
          I: clampNum(ws.disc.scores.I),
          S: clampNum(ws.disc.scores.S),
          C: clampNum(ws.disc.scores.C),
        } : undefined,
        primary: clampStr(ws.disc.primary, 4),
        secondary: clampStr(ws.disc.secondary, 4),
        isHybrid: Boolean(ws.disc.isHybrid),
      } : undefined,
      emotion: ws.emotion && typeof ws.emotion === "object" ? {
        sentiment: clampStr(ws.emotion.sentiment, 16),
        cluster: clampStr(ws.emotion.cluster, 24),
      } : undefined,
    };
  }

  return {
    ok: true,
    data: {
      voice,
      messages,
      userTurns,
      cap,
      roleLabel: typeof body.role_label === "string" ? body.role_label.slice(0, 80) : undefined,
      industryLabel: typeof body.industry_label === "string" ? body.industry_label.slice(0, 80) : undefined,
      sessionId: typeof body.session_id === "string" ? body.session_id.slice(0, 64) : "anon",
      lead,
      warmStart,
    },
  };
}


// ── Anthropic API ───────────────────────────────────────────────────────────
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Model IDs · update these when Anthropic releases newer Opus/Sonnet versions.
const FIRST_TURN_MODEL = "claude-opus-4-5";       // deepest read on the gate challenge + first turn
const DEFAULT_MODEL = "claude-sonnet-4-5";        // every subsequent turn · fast streaming follow-through
const MAX_OUTPUT_TOKENS = 8192;

function pickModel(userTurns: number): string {
  return userTurns <= 1 ? FIRST_TURN_MODEL : DEFAULT_MODEL;
}

type AnthropicMsg = { role: "user" | "assistant"; content: any };

// Convert {role:'user'|'assistant', content:string} → Anthropic message format.
function toAnthropicMessages(messages: Array<{ role: string; content: string }>): AnthropicMsg[] {
  return messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

async function callAnthropicJson(opts: {
  model: string;
  system: string;
  messages: AnthropicMsg[];
  tools?: any[];
}): Promise<any> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  const body: any = {
    model: opts.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: opts.system,
    messages: opts.messages,
  };
  if (opts.tools && opts.tools.length) body.tools = opts.tools;
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (r.status === 429) throw Object.assign(new Error("rate-limited upstream"), { status: 429 });
  if (r.status === 402 || r.status === 529) throw Object.assign(new Error("credits/overload"), { status: 402 });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`anthropic ${r.status}: ${text.slice(0, 400)}`);
  }
  return await r.json();
}

async function callAnthropicStream(opts: {
  model: string;
  system: string;
  messages: AnthropicMsg[];
}): Promise<Response> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: opts.system,
      messages: opts.messages,
      stream: true,
    }),
  });
  if (r.status === 429) throw Object.assign(new Error("rate-limited upstream"), { status: 429 });
  if (r.status === 402 || r.status === 529) throw Object.assign(new Error("credits/overload"), { status: 402 });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`anthropic stream ${r.status}: ${text.slice(0, 400)}`);
  }
  return r;
}

// Translate Anthropic SSE → OpenAI-style SSE the client already parses.
// Anthropic emits: event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}\n\n
// We re-emit:     data: {"choices":[{"delta":{"content":"..."}}]}\n\n
// Appends an optional trace event and a final [DONE] marker.
function anthropicSseToClient(upstream: Response, trace: string | null): Response {
  const sseHeaders = {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  };

  if (!upstream.body) {
    return new Response("data: [DONE]\n\n", { headers: sseHeaders });
  }

  const reader = upstream.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: string | null = null;

  const emitDelta = (controller: ReadableStreamDefaultController, text: string) => {
    const chunk = { choices: [{ delta: { content: text }, index: 0 }] };
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
  };

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (trace) {
            controller.enqueue(encoder.encode(`event: trace\ndata: ${JSON.stringify({ research_trace: trace })}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line === "") { currentEvent = null; continue; }
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
              const text = parsed.delta.text;
              if (typeof text === "string" && text.length) emitDelta(controller, text);
            } else if (parsed.type === "message_stop") {
              // wait for upstream done; nothing to emit
            } else if (parsed.type === "error") {
              const msg = parsed?.error?.message || "stream error";
              controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`));
            }
          } catch {
            // ignore parse failures on partial lines · they won't be split across chunks
            // because Anthropic emits one event per pair of lines, but be safe.
          }
        }
      } catch (e) {
        console.error("[cob-chat] stream pump error", e);
        try {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "stream interrupted" })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch {/* noop */}
        controller.close();
      }
    },
    cancel() {
      try { reader.cancel(); } catch{/* noop */}
    },
  });

  return new Response(stream, { headers: sseHeaders });
}

// Emit a one-shot SSE response (graceful caps / direct probe text).
function oneShotSse(text: string, status = 200, trace: string | null = null): Response {
  const sseHeaders = {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  };
  const chunk = { choices: [{ delta: { content: text }, index: 0 }] };
  const parts = [`data: ${JSON.stringify(chunk)}\n\n`];
  if (trace) parts.push(`event: trace\ndata: ${JSON.stringify({ research_trace: trace })}\n\n`);
  parts.push("data: [DONE]\n\n");
  return new Response(parts.join(""), { headers: sseHeaders, status });
}

// Extract concatenated text and tool_use blocks from an Anthropic non-streaming response.
function partitionResponse(resp: any): { text: string; toolUses: Array<{ id: string; name: string; input: any }>; rawContent: any[] } {
  const content = Array.isArray(resp?.content) ? resp.content : [];
  let text = "";
  const toolUses: any[] = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") text += block.text;
    else if (block.type === "tool_use") toolUses.push({ id: block.id, name: block.name, input: block.input });
  }
  return { text: text.trim(), toolUses, rawContent: content };
}

// ── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ip = getClientIp(req.headers);
    const rl = await checkRateLimitDb(supabase, "cob-chat", ip, 20, 60_000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests. Try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter ?? 60) },
      });
    }
  } catch (e) {
    console.error("[cob-chat] rate-limit check failed", e);
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const v = validateInput(body);
  if (!v.ok) {
    return new Response(JSON.stringify({ error: v.error }), {
      status: v.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { voice, messages, userTurns, cap, roleLabel, industryLabel, lead, warmStart } = v.data;

  if (userTurns > cap) {
    const closing = voice === "michael"
      ? "OK we've gone deep on this one and Michael needs a Splenda break. Flip to COB to keep going · he'll handle the follow-through."
      : "We've covered substantive ground in this session. Next move is a working pilot · your COB sitting against your actual context. Tap the briefing CTA below to start.";
    return oneShotSse(closing);
  }

  const firstTurn = userTurns === 1;
  const model = pickModel(userTurns);
  const softNudge = voice === "michael" && userTurns === MICHAEL_SOFT_NUDGE_TURN;
  const system = buildSystemPrompt({ voice, roleLabel, industryLabel, softNudge, lead, firstTurn, warmStart });
  if (warmStart) {
    console.log("[cob-chat] warm_start present · DISC=", warmStart.disc?.primary, "emotion=", warmStart.emotion?.sentiment, "/", warmStart.emotion?.cluster);
  }


  const recent = messages.length > HISTORY_KEEP ? messages.slice(-HISTORY_KEEP) : messages;
  const anthropicMessages = toAnthropicMessages(recent);

  try {
    // COB voice: tool-call probe first. If no tool calls, stream the final response.
    if (voice === "cob") {
      let convo = [...anthropicMessages];
      let webCalls = 0;
      let trace: string | null = null;

      for (let iter = 0; iter < 3; iter++) {
        const resp = await callAnthropicJson({ model, system, messages: convo, tools: [RESEARCH_WEB_TOOL] });
        const { text, toolUses, rawContent } = partitionResponse(resp);
        const stopReason = resp?.stop_reason;

        if (!toolUses.length) {
          if (text) return oneShotSse(text, 200, trace);
          // No tool calls and no text · fall through to a fresh stream.
          const upstream = await callAnthropicStream({ model, system, messages: convo });
          return anthropicSseToClient(upstream, trace);
        }

        // Append assistant turn (must preserve original content blocks for tool_use_id pairing).
        convo.push({ role: "assistant", content: rawContent });

        // Build a single user turn containing tool_result blocks for every tool_use in this assistant turn.
        const toolResults: any[] = [];
        for (const tu of toolUses) {
          if (tu.name !== "research_web") {
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: "[unknown tool]" });
            continue;
          }
          if (webCalls >= MAX_WEB_CALLS) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: "[research_web cap reached for this session — synthesize from existing knowledge, do not call this tool again]",
            });
            continue;
          }
          const { summary, trace: t } = await executeResearchWeb(
            String(tu.input?.intent || "explicit_lookup"),
            String(tu.input?.target || ""),
          );
          webCalls++;
          trace = t;
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: summary + "\n\n[reminder: synthesize through your voice. Never quote raw. Never reveal internal mechanics.]",
          });
        }
        convo.push({ role: "user", content: toolResults });

        if (stopReason !== "tool_use") break;
      }

      // After tool work · stream the final synthesis without tools.
      const upstream = await callAnthropicStream({ model, system, messages: convo });
      return anthropicSseToClient(upstream, trace);
    }

    // Michael voice · no tools · pure streaming.
    const upstream = await callAnthropicStream({ model, system, messages: anthropicMessages });
    return anthropicSseToClient(upstream, null);
  } catch (e: any) {
    const status = e?.status === 429 ? 429 : e?.status === 402 ? 402 : 500;
    const message = status === 429
      ? "Demand is heavy right now. Try once more in a moment."
      : status === 402
      ? "Sandbox credits paused · your COB will be back shortly."
      : "Something snagged on my end. Try again.";
    console.error("[cob-chat] failure", e?.message || e);
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
