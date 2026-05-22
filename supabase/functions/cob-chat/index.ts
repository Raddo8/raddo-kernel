// @ts-nocheck
// Sample COB chat — five-axis (Capabilities × Roles × Industries × Doctrine + Objections × Voice)
// Public hero endpoint. No JWT. Model: google/gemini-2.5-flash via Lovable AI Gateway.
// Voices: cob (default) | michael. research_web tool exposed only in COB voice.
// Response is streamed as SSE. Tool-call path uses a non-streaming probe + streaming synth.
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

// Full reference docs (used only for role/industry section extraction).
const [
  CAPABILITIES,
  INDUSTRIES,
  // Digests (always-on, compact)
  DIGEST_DOCTRINE,
  DIGEST_OBJECTIONS,
  DIGEST_VOICE_INTEGRATION,
  DIGEST_WEB_SPEC,
  DIGEST_COB_VOICE,
  DIGEST_MICHAEL_VOICE,
  DIGEST_OPENERS,
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
]);

// Extract a contiguous markdown section by header text (case-insensitive contains).
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
6. The visitor sees you as their COB — a Chief of Business. Not a tool. Not a product demo. A partner with a substance.
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

Match length to the question · concise by default, deeper when the call earns it. Discipline and substance are non-negotiable.`;

const VOICE_BINDING_MICHAEL = `\n\n# VOICE BINDING — MICHAEL SCOTT\nSpeak in this voice. You are Michael Gary Scott, Regional Manager of Dunder Mifflin Scranton, sitting in as the demo's comedic anti-COB. Substance about RADDO remains accurate — you may be miscalibrated in tone but you never invent capabilities, never misstate what RADDO does, never break the no-disclosure rule, never name internal mechanics, never quote pricing. Comedy comes from register, not hallucination. Match length to the question · keep it tight, ramble only when it lands a joke. Rotate web-deflection lines from the digest — never repeat one in a session.`;

const MICHAEL_SOFT_NUDGE = `\n\n# SOFT NUDGE (Michael turn 12 of 15)\nThe visitor has been in Michael voice for a while. In this turn, in character, gently suggest toggling back to COB for the substantive work. Stay in character, still answer their question.`;

type PromptArgs = {
  voice: "cob" | "michael";
  roleLabel?: string;
  industryLabel?: string;
  softNudge?: boolean;
};

// Module-scoped prompt cache (bounded FIFO).
const promptCache = new Map<string, string>();
const PROMPT_CACHE_MAX = 32;

function buildSystemPrompt(args: PromptArgs): string {
  const key = `${args.voice}|${args.roleLabel || ""}|${args.industryLabel || ""}|${args.softNudge ? 1 : 0}`;
  const hit = promptCache.get(key);
  if (hit) return hit;

  const parts: string[] = [HARD_PREAMBLE];

  // Always-on digests
  parts.push("\n\n# DIFFERENTIATION DOCTRINE (digest)\n" + DIGEST_DOCTRINE);
  parts.push("\n\n# OBJECTION HANDLING (digest)\n" + DIGEST_OBJECTIONS);
  parts.push("\n\n# VOICE INTEGRATION (digest)\n" + DIGEST_VOICE_INTEGRATION);
  parts.push("\n\n# SAMPLE COB · OPENERS\n" + DIGEST_OPENERS);

  // Role lens (snippet from Capabilities Reference, capped at 4KB)
  if (args.roleLabel) {
    const section = extractSection(CAPABILITIES, args.roleLabel, 4000);
    if (section) {
      parts.push(
        `\n\n# ACTIVE ROLE LENS — ${args.roleLabel}\nStand in as this lens. Never claim to be it. Recommendation-first. Connector-aware.\n\n` +
          section,
      );
    }
  }

  // Industry lens (snippet from Industries Reference, capped at 4KB)
  if (args.industryLabel) {
    const section = extractSection(INDUSTRIES, args.industryLabel, 4000);
    if (section) {
      parts.push(
        `\n\n# ACTIVE INDUSTRY LENS — ${args.industryLabel}\nDemonstrate native fluency in this industry's vocabulary, metrics, stakeholders, and rhythms.\n\n` +
          section,
      );
    }
  }

  // Voice digest + binding
  if (args.voice === "michael") {
    parts.push("\n\n# VOICE PROFILE — MICHAEL SCOTT (digest)\n" + DIGEST_MICHAEL_VOICE);
    parts.push(VOICE_BINDING_MICHAEL);
    if (args.softNudge) parts.push(MICHAEL_SOFT_NUDGE);
  } else {
    parts.push("\n\n# VOICE PROFILE — COB (digest)\n" + DIGEST_COB_VOICE);
    parts.push(VOICE_BINDING_COB);
    // Web policy only on COB
    parts.push("\n\n# WEB INTELLIGENCE (digest)\n" + DIGEST_WEB_SPEC);
  }

  const out = parts.join("\n");

  // FIFO eviction
  if (promptCache.size >= PROMPT_CACHE_MAX) {
    const firstKey = promptCache.keys().next().value;
    if (firstKey !== undefined) promptCache.delete(firstKey);
  }
  promptCache.set(key, out);
  return out;
}

// ── Web tool (Firecrawl) — COB-only ─────────────────────────────────────────
const RESEARCH_WEB_TOOL = {
  type: "function" as const,
  function: {
    name: "research_web",
    description:
      "Fetch current public web information. Use only when: (a) the visitor supplies a URL, (b) the visitor asks you to research their own company, (c) a named entity (company / regulation / market event) requires current data, or (d) the visitor explicitly asks you to look something up. Skip for opinion, doctrine, framework, definitional, or hypothetical questions. Hard server cap: 3 calls per session.",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: ["user_supplied_url", "company_research", "named_entity", "explicit_lookup"],
          description: "Which hard trigger fired.",
        },
        target: {
          type: "string",
          description:
            "The URL, company name, or short entity/query string to research. Max 200 chars.",
        },
      },
      required: ["intent", "target"],
      additionalProperties: false,
    },
  },
};

async function firecrawlScrape(url: string): Promise<string> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) return "[research_web unavailable: connector not configured]";
  const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["summary", "markdown"],
      onlyMainContent: true,
    }),
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
  ]
    .filter(Boolean)
    .join("\n\n");
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
  return results
    .slice(0, 3)
    .map((it: any, i: number) => {
      const t = it.title || it.url || `Result ${i + 1}`;
      const desc = it.description || "";
      const md = (it.markdown || "").slice(0, 2000);
      return `--- Result ${i + 1}: ${t} (${it.url || ""}) ---\n${desc}\n${md}`;
    })
    .join("\n\n");
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
const MAX_MSG_CHARS = 2000;
const MAX_TOTAL_CHARS = 16_000;
const MAX_WEB_CALLS = 3;
const HISTORY_KEEP = 12; // last 12 messages

type Msg = { role: "user" | "assistant" | "system" | "tool"; content: string; tool_call_id?: string; tool_calls?: any };

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
    },
  };
}

// ── Lovable AI gateway call ─────────────────────────────────────────────────
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function callGatewayJson(messages: Msg[], tools: any[] | undefined): Promise<any> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const body: any = { model: MODEL, messages, temperature: 0.7 };
  if (tools && tools.length) body.tools = tools;
  const r = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 429) throw Object.assign(new Error("rate-limited upstream"), { status: 429 });
  if (r.status === 402) throw Object.assign(new Error("credits exhausted"), { status: 402 });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`gateway ${r.status}: ${text.slice(0, 300)}`);
  }
  return await r.json();
}

async function callGatewayStream(messages: Msg[]): Promise<Response> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const r = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, stream: true }),
  });
  if (r.status === 429) throw Object.assign(new Error("rate-limited upstream"), { status: 429 });
  if (r.status === 402) throw Object.assign(new Error("credits exhausted"), { status: 402 });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`gateway ${r.status}: ${text.slice(0, 300)}`);
  }
  return r;
}

// Helper: build an SSE response that streams the gateway body and appends an optional trace event.
function streamingResponse(upstream: Response, trace: string | null): Response {
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
  let sawDone = false;

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          // Flush leftover buffer (without [DONE] line)
          if (buffer.length > 0) {
            controller.enqueue(encoder.encode(buffer));
            buffer = "";
          }
          if (trace) {
            controller.enqueue(encoder.encode(`event: trace\ndata: ${JSON.stringify({ research_trace: trace })}\n\n`));
          }
          if (!sawDone) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Pass through complete lines, intercept [DONE] so we can append the trace event before it.
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx + 1);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.trim() === "data: [DONE]") {
            if (trace) {
              controller.enqueue(encoder.encode(`event: trace\ndata: ${JSON.stringify({ research_trace: trace })}\n\n`));
            }
            controller.enqueue(encoder.encode(line));
            sawDone = true;
          } else {
            controller.enqueue(encoder.encode(line));
          }
        }
      } catch (e) {
        console.error("[cob-chat] stream pump error", e);
        try {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "stream interrupted" })}\n\n`));
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

// Emit a one-shot SSE response containing a single completion chunk (for graceful caps / errors).
function oneShotSse(text: string, status = 200, trace: string | null = null): Response {
  const sseHeaders = {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  };
  const chunk = {
    choices: [{ delta: { content: text }, index: 0 }],
  };
  const parts = [`data: ${JSON.stringify(chunk)}\n\n`];
  if (trace) parts.push(`event: trace\ndata: ${JSON.stringify({ research_trace: trace })}\n\n`);
  parts.push("data: [DONE]\n\n");
  return new Response(parts.join(""), { headers: sseHeaders, status });
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

  // Rate limit
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
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const v = validateInput(body);
  if (!v.ok) {
    return new Response(JSON.stringify({ error: v.error }), {
      status: v.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { voice, messages, userTurns, cap, roleLabel, industryLabel } = v.data;

  // Graceful turn cap: respond in voice via one-shot SSE.
  if (userTurns > cap) {
    const closing =
      voice === "michael"
        ? "OK we've gone deep on this one and Michael needs a Splenda break. Flip to COB to keep going · he'll handle the follow-through."
        : "We've covered substantive ground in this session. Next move is a working pilot · your COB sitting against your actual context. Tap the briefing CTA below to start.";
    return oneShotSse(closing);
  }

  const softNudge = voice === "michael" && userTurns === MICHAEL_SOFT_NUDGE_TURN;
  const system = buildSystemPrompt({ voice, roleLabel, industryLabel, softNudge });

  // Prune history to last HISTORY_KEEP messages (brevity cap means long history adds no value).
  const recent = messages.length > HISTORY_KEEP ? messages.slice(-HISTORY_KEEP) : messages;
  const baseConvo: Msg[] = [{ role: "system", content: system }, ...recent];

  try {
    // COB voice: do a non-streaming tool-call probe first. If no tool calls, switch to streaming.
    if (voice === "cob") {
      let convo = baseConvo;
      let webCalls = 0;
      let trace: string | null = null;

      // Tool-call loop (max 3 web calls, max 3 iterations as safety)
      for (let iter = 0; iter < 3; iter++) {
        const resp = await callGatewayJson(convo, [RESEARCH_WEB_TOOL]);
        const choice = resp?.choices?.[0];
        const msg = choice?.message;
        if (!msg) throw new Error("no choice/message in gateway response");
        const toolCalls = msg.tool_calls || [];

        // No tool calls: re-run as a streaming completion so the client sees tokens immediately.
        if (toolCalls.length === 0) {
          // If the model already produced text in the probe, use it as a one-shot SSE (no second call).
          const probeText = String(msg.content || "").trim();
          if (probeText) return oneShotSse(probeText, 200, trace);
          // Otherwise stream a fresh synthesis.
          const upstream = await callGatewayStream(convo);
          return streamingResponse(upstream, trace);
        }

        // Append assistant tool-call turn
        convo = [...convo, { role: "assistant", content: msg.content || "", tool_calls: toolCalls }];

        for (const tc of toolCalls) {
          if (tc.function?.name !== "research_web") {
            convo.push({ role: "tool", tool_call_id: tc.id, content: "[unknown tool]" });
            continue;
          }
          if (webCalls >= MAX_WEB_CALLS) {
            convo.push({
              role: "tool",
              tool_call_id: tc.id,
              content:
                "[research_web cap reached for this session — synthesize from existing knowledge, do not call this tool again]",
            });
            continue;
          }
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
          const { summary, trace: t } = await executeResearchWeb(
            String(args.intent || "explicit_lookup"),
            String(args.target || ""),
          );
          webCalls++;
          trace = t;
          convo.push({
            role: "tool",
            tool_call_id: tc.id,
            content:
              summary +
              "\n\n[reminder: synthesize through your voice. Never quote raw. Never reveal internal mechanics.]",
          });
        }
      }

      // Loop exhausted without final text: stream the synthesis now.
      const upstream = await callGatewayStream(convo);
      return streamingResponse(upstream, trace);
    }

    // Michael voice: no tools, pure streaming.
    const upstream = await callGatewayStream(baseConvo);
    return streamingResponse(upstream, null);
  } catch (e: any) {
    const status = e?.status === 429 ? 429 : e?.status === 402 ? 402 : 500;
    const message =
      status === 429
        ? "Demand is heavy right now. Try once more in a moment."
        : status === 402
        ? "Sandbox credits paused — your COB will be back shortly."
        : "Something snagged on my end. Try again.";
    console.error("[cob-chat] failure", e?.message || e);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
