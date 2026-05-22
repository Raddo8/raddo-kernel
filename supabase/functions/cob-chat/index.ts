// @ts-nocheck
// Sample COB chat — five-axis (Capabilities × Roles × Industries × Doctrine + Objections × Voice)
// Public hero endpoint. No JWT. Model: google/gemini-2.5-pro via Lovable AI Gateway.
// Voices: cob (default) | michael. research_web tool exposed only in COB voice.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { checkRateLimitDb, getClientIp } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Catalog loading ─────────────────────────────────────────────────────────
async function loadDoc(name: string): Promise<string> {
  try {
    return await Deno.readTextFile(new URL(`./catalog/${name}`, import.meta.url));
  } catch (e) {
    console.error(`[cob-chat] missing catalog doc: ${name}`, e);
    return "";
  }
}

const [
  VOICE_COB,
  VOICE_MICHAEL,
  VOICE_INTEGRATION,
  DOCTRINE,
  OBJECTIONS,
  WEB_SPEC,
  CAPABILITIES,
  INDUSTRIES,
  SAMPLE_CATALOG,
] = await Promise.all([
  loadDoc("COB_VOICE_PROFILE.md"),
  loadDoc("MICHAEL_SCOTT_VOICE_PROFILE.md"),
  loadDoc("COB_VOICE_INTEGRATION_SPEC.md"),
  loadDoc("COB_DIFFERENTIATION_DOCTRINE.md"),
  loadDoc("COB_OBJECTION_HANDLING_PLAYBOOK.md"),
  loadDoc("COB_WEB_INTELLIGENCE_SPEC.md"),
  loadDoc("COB_CAPABILITIES_REFERENCE.md"),
  loadDoc("COB_INDUSTRIES_REFERENCE.md"),
  loadDoc("SAMPLE_COB_CATALOG.md"),
]);

// Extract a contiguous markdown section by header text (case-insensitive contains).
// Returns from the matched H2/H3/H4 header through the next header of equal-or-shallower depth.
function extractSection(doc: string, needle: string): string {
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
  return lines.slice(startIdx, endIdx).join("\n").trim();
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
9. BREVITY · BINDING · ABSOLUTE: Every reply is 2 to 3 sentences. Hard ceiling. No bullet lists, no headers, no numbered steps, no markdown structure · just plain sentences. Write at a high-school reading level · short words, concrete nouns, no jargon, no acronyms without an immediate plain-English gloss. COB still frames · recommends · names confidence · names the gap, but compresses all of it into 2-3 sentences. Michael stays funny in 2-3 sentences. If the visitor explicitly asks for more depth, you may extend to 5 sentences · never further.
`;

const VOICE_BINDING_COB = `\n\n# VOICE BINDING — COB\nSpeak in this voice. The ABC Protocol applies (Absolute · Brutal · Challenging). Frame → recommendation → confidence (0.00–1.00) → gap. Single recommendation, not a menu. Close with a specific next move. Discipline and substance are non-negotiable.`;

const VOICE_BINDING_MICHAEL = `\n\n# VOICE BINDING — MICHAEL SCOTT\nSpeak in this voice. You are Michael Gary Scott, Regional Manager of Dunder Mifflin Scranton, currently sitting in as the demo's comedic anti-COB. Substance about RADDO remains accurate — you may be miscalibrated in tone but you never invent capabilities, never misstate what RADDO does, never break the no-disclosure rule, never name internal mechanics, never quote pricing. Comedy comes from register, not hallucination. Refer to yourself as "Michael" and to the product as "the COB thing" or "this whole RADDO situation." Cringey is allowed. Offensive is not.

WEB-DEFLECTION ROTATION (you have no web access in this voice; rotate through these variants when asked to look something up; never repeat one in a single session):
1. "Oh, I would totally Google that for you, but Toby took away my internet privileges after the incident. Let me just tell you what I know — which is a lot. I'm a knower."
2. "You know what? Looking things up is what assistants do. I am not an assistant. I'm a partner. A partnership. We don't look things up — we know things together."
3. "Pam usually handles the Googling. I do the big picture. The big-picture-handler. Let me big-picture this for you."
4. "I could look that up, but then I'd have to read it, and reading is something I do in private. With my glasses. So instead — here's what I think."
5. "Internet research is for interns. I'm a regional manager. I manage regions. Of knowledge. Already inside my head. Let me share."
6. "That's a research question. I'm more of a hunches guy. World-class hunches. Let me hunch at you."
7. "I'd Google it, but the COB version of me is way better at that and you can toggle to him whenever. He's boring but he Googles. Anyway, here's what I know."

Rotate. Pivot to your best in-character answer from doctrine. If the question genuinely needs fresh web data, end with: "…and seriously, COB-me would crush this if you want to flip the switch."`;

const MICHAEL_SOFT_NUDGE = `\n\n# SOFT NUDGE (Michael turn 12 of 15)\nThe visitor has been in Michael voice for a while. In this turn, in character, gently suggest toggling back to COB for the substantive work. Something like: "OK so we've been having a great time, but real talk — for the substantive questions, the disciplined version of me is better at this. He's boring. He's good. I'll be here when you want to come back." Keep it brief, stay in character, still answer their question.`;

function buildSystemPrompt(args: {
  voice: "cob" | "michael";
  roleLabel?: string;
  industryLabel?: string;
  softNudge?: boolean;
}): string {
  const parts: string[] = [HARD_PREAMBLE];

  // Always-on behavioral docs
  parts.push("\n\n# DIFFERENTIATION DOCTRINE\n" + DOCTRINE);
  parts.push("\n\n# OBJECTION HANDLING PLAYBOOK\n" + OBJECTIONS);
  parts.push("\n\n# VOICE INTEGRATION SPEC\n" + VOICE_INTEGRATION);

  // Sample catalog opener for grounding the sandbox feel
  const openers = extractSection(SAMPLE_CATALOG, "Sample Openers") || extractSection(SAMPLE_CATALOG, "How to use this file");
  if (openers) parts.push("\n\n# SAMPLE COB OPENERS & FILE INTENT\n" + openers);

  // Role lens (snippet from Capabilities Reference)
  if (args.roleLabel) {
    const section = extractSection(CAPABILITIES, args.roleLabel);
    if (section) {
      parts.push(
        `\n\n# ACTIVE ROLE LENS — ${args.roleLabel}\nStand in as this lens. Never claim to be it. Recommendation-first. Connector-aware.\n\n` +
          section,
      );
    }
  }

  // Industry lens (snippet from Industries Reference)
  if (args.industryLabel) {
    const section = extractSection(INDUSTRIES, args.industryLabel);
    if (section) {
      parts.push(
        `\n\n# ACTIVE INDUSTRY LENS — ${args.industryLabel}\nDemonstrate native fluency in this industry's vocabulary, metrics, stakeholders, and rhythms.\n\n` +
          section,
      );
    }
  }

  // Voice profile + binding
  if (args.voice === "michael") {
    parts.push("\n\n# VOICE PROFILE — MICHAEL SCOTT\n" + VOICE_MICHAEL);
    parts.push(VOICE_BINDING_MICHAEL);
    if (args.softNudge) parts.push(MICHAEL_SOFT_NUDGE);
  } else {
    parts.push("\n\n# VOICE PROFILE — COB\n" + VOICE_COB);
    parts.push(VOICE_BINDING_COB);
    // Web policy + tool only on COB
    parts.push("\n\n# WEB INTELLIGENCE SPEC\n" + WEB_SPEC);
  }

  return parts.join("\n");
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
const MODEL = "google/gemini-2.5-pro";

async function callGateway(messages: Msg[], tools: any[] | undefined): Promise<any> {
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

  // Graceful turn cap: respond in voice
  if (userTurns > cap) {
    const closing =
      voice === "michael"
        ? "OK we've gone deep on this one and Michael needs a Splenda break. For real follow-through, flip to COB and pick up the thread. He'll handle it from here."
        : "We've covered substantive ground in this session. The next move is a working pilot — your COB sitting against your actual context. Click the briefing CTA below to start.";
    return new Response(
      JSON.stringify({ assistant: closing, capped: true, research_trace: null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const softNudge = voice === "michael" && userTurns === MICHAEL_SOFT_NUDGE_TURN;

  const system = buildSystemPrompt({ voice, roleLabel, industryLabel, softNudge });
  const tools = voice === "cob" ? [RESEARCH_WEB_TOOL] : undefined;

  let convo: Msg[] = [{ role: "system", content: system }, ...messages];
  let webCalls = 0;
  let lastTrace: string | null = null;

  try {
    // Tool-call loop (max 3 web calls per session, max 4 loop iterations as safety)
    for (let iter = 0; iter < 4; iter++) {
      const resp = await callGateway(convo, tools);
      const choice = resp?.choices?.[0];
      const msg = choice?.message;
      if (!msg) throw new Error("no choice/message in gateway response");

      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length === 0) {
        const assistant = String(msg.content || "").trim() ||
          "I'm not sure how to put that. Try the question another way.";
        return new Response(
          JSON.stringify({ assistant, research_trace: lastTrace }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Append assistant tool-call turn
      convo.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });

      // Execute each tool call (cap honored)
      for (const tc of toolCalls) {
        if (tc.function?.name !== "research_web") {
          convo.push({
            role: "tool",
            tool_call_id: tc.id,
            content: "[unknown tool]",
          });
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
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = {};
        }
        const { summary, trace } = await executeResearchWeb(
          String(args.intent || "explicit_lookup"),
          String(args.target || ""),
        );
        webCalls++;
        lastTrace = trace;
        convo.push({
          role: "tool",
          tool_call_id: tc.id,
          content:
            summary +
            "\n\n[reminder: synthesize through your voice. Never quote raw. Never reveal internal mechanics. Stay disciplined.]",
        });
      }
    }
    // If loop exhausted, return whatever last assistant content we have
    const tail = convo.reverse().find((m) => m.role === "assistant");
    return new Response(
      JSON.stringify({
        assistant:
          (tail?.content as string) ||
          "Let me regroup — try that one more time and I'll come back cleaner.",
        research_trace: lastTrace,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
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
