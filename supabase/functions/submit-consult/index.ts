// @ts-nocheck
// Consult form submission · records to DB then dual-sends through `send-email`:
//   EMAIL A · visitor confirmation  · cob@chiefofbusiness.ai · "Your COB"
//   EMAIL B · pipeline notification · noreply@chiefofbusiness.ai · "COB Pipeline"
// No direct Resend usage. Sender whitelist + key handling lives in `send-email`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type DiscStyle = "D" | "I" | "S" | "C";

type DiscResponse = {
  rowId: string;
  selections: string[];
};

type ToolsSelected = Record<string, { slugs?: string[]; custom?: string[] }>;

type ResearchBriefPublic = {
  company?: string;
  sector?: string;
  sizeSignal?: string;
  recentEvent?: string;
  anchor?: string;
  skippedReason?: "free_mail" | "no_domain" | "all_calls_failed" | "timeout" | "synthesis_failed" | null;
};

type ResearchBriefInternal = ResearchBriefPublic & {
  sources?: string[]; // server-side only, never returned to client
  rawSnippetsLength?: number;
  elapsedMs?: number;
};

type ConsultSubmissionPayload = {
  email: string;
  name: string;
  phone?: string;
  occupation?: string;
  challenge?: string;
  currentStateWordIds: string[];
  aspirationWordIds: string[];
  appSelections: string[];
  otherAppsText?: string;
  toolsSelected?: ToolsSelected;
  toolsByCategory?: Array<{ label: string; items: string[] }>;
  bucketNotes?: Array<{ category: string; label: string; note: string }>;
  discResponses: DiscResponse[];
  discAllowMultiSelect: boolean;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PIPELINE_RECIPIENT = "pipeline@chiefofbusiness.ai";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const themePrefixMap = [
  "clarity",
  "cash",
  "delivery",
  "sales",
  "people",
  "systems",
  "leadership",
  "capacity",
  "visibility",
  "strategy",
] as const;

function analyzeThemeGap(payload: ConsultSubmissionPayload) {
  return themePrefixMap.map((theme) => {
    const currentSelections = payload.currentStateWordIds.filter((id) => id.startsWith(`${theme}-`));
    const aspirationSelections = payload.aspirationWordIds.filter((id) => id.startsWith(`${theme}-`));
    const currentPositive = currentSelections.filter((id) => id.includes("-positive-")).length;
    const currentNegative = currentSelections.filter((id) => id.includes("-negative-")).length;

    return {
      theme,
      currentPositive,
      currentNegative,
      aspiration: aspirationSelections.length,
      growthGap: aspirationSelections.length - currentPositive,
      frictionLoad: currentNegative,
    };
  });
}

function analyzeDisc(payload: ConsultSubmissionPayload) {
  const scores: Record<DiscStyle, number> = { D: 0, I: 0, S: 0, C: 0 };
  for (const response of payload.discResponses) {
    for (const selection of response.selections) {
      const style = selection.slice(-1).toUpperCase() as DiscStyle;
      if (style in scores) {
        scores[style] += 1;
      }
    }
  }

  const ranked = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([style]) => style as DiscStyle);
  const primaryStyle = ranked[0] ?? "C";
  const secondaryStyle = ranked[1] ?? primaryStyle;
  const isHybrid = Math.abs(scores[primaryStyle] - scores[secondaryStyle]) <= 2;

  return {
    scores,
    primaryStyle,
    secondaryStyle,
    isHybrid,
    personaNameCandidates: [
      `${primaryStyle}-${secondaryStyle}`,
      `${primaryStyle} lead`,
      `${secondaryStyle} support`,
    ],
  };
}

// ──────────────────────────────────────────────────────────────────────────
// INTAKE RESEARCH · 3 parallel Firecrawl calls + LLM synthesis, hard 6s budget.
// Fail-open: any failure or timeout returns a brief with skippedReason set.
// Never blocks the consult submission or visitor experience.
// ──────────────────────────────────────────────────────────────────────────
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "proton.me", "protonmail.com", "aol.com", "live.com", "msn.com",
  "fastmail.com", "pm.me", "mac.com", "me.com", "duck.com",
  "yandex.com", "gmx.com", "zoho.com", "tutanota.com", "mail.com",
]);

const INTAKE_RESEARCH_BUDGET_MS = 6000;
const FIRECRAWL_PER_CALL_TIMEOUT_MS = 3500;

function parseEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return domain;
}

async function firecrawlScrapeBounded(url: string, signal: AbortSignal): Promise<string> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) return "";
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["summary", "markdown"], onlyMainContent: true }),
      signal,
    });
    if (!r.ok) return "";
    const j = await r.json().catch(() => ({} as any));
    const md = j?.data?.markdown || j?.markdown || "";
    const sum = j?.data?.summary || j?.summary || "";
    const meta = j?.data?.metadata || j?.metadata || {};
    return [
      meta?.title && `TITLE: ${meta.title}`,
      sum && `SUMMARY: ${sum}`,
      md && `EXCERPT: ${String(md).slice(0, 3000)}`,
    ].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

async function firecrawlSearchBounded(q: string, signal: AbortSignal): Promise<string> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) return "";
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, limit: 3 }),
      signal,
    });
    if (!r.ok) return "";
    const j = await r.json().catch(() => ({} as any));
    const results = j?.data || j?.web?.results || j?.results || [];
    if (!Array.isArray(results) || !results.length) return "";
    return results.slice(0, 3).map((it: any, i: number) => {
      const t = it.title || it.url || `Result ${i + 1}`;
      const desc = it.description || "";
      return `RESULT ${i + 1}: ${t} (${it.url || ""}) · ${desc}`;
    }).join("\n");
  } catch {
    return "";
  }
}

async function synthesizeBrief(opts: {
  name: string;
  domain: string;
  snippets: string;
  signal: AbortSignal;
}): Promise<ResearchBriefInternal | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key || !opts.snippets.trim()) return null;
  const system = `You are an executive-prep researcher. Given raw web snippets about a company and its operator, extract ONE sharp, current anchor a fractional CFO/COO/CEO would use to start a conversation. Be concrete; never invent.

Return STRICT JSON ONLY (no markdown, no prose) with this exact shape:
{"company": string, "sector": string, "sizeSignal": string, "recentEvent": string, "anchor": string}

Rules:
· company · the company's name as it appears publicly (not the domain).
· sector · one short noun phrase (e.g. "Series B fintech", "PE-backed manufacturer", "boutique law firm").
· sizeSignal · employee band, revenue stage, or growth signal if visible. Empty string if unknown.
· recentEvent · ONE specific recent material event in the last ~6 months (funding, acquisition, launch, exec change, regulatory, layoffs, press). Empty string if none visible.
· anchor · ONE sentence a senior advisor would say at the open. Concrete, weave together sector + recent event. NO advice, NO question, NO greeting. Max 30 words.

If snippets are too thin to extract anything real, return {"company": "", "sector": "", "sizeSignal": "", "recentEvent": "", "anchor": ""}.`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "submit-consult-intake-research",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Operator: ${opts.name}\nDomain: ${opts.domain}\n\nSnippets:\n${opts.snippets.slice(0, 12000)}` },
        ],
        response_format: { type: "json_object" },
      }),
      signal: opts.signal,
    });
    if (!r.ok) {
      console.error("[intake-research] synthesis failed", r.status);
      return null;
    }
    const j = await r.json().catch(() => null) as any;
    const text = j?.choices?.[0]?.message?.content;
    if (!text) return null;
    const parsed = JSON.parse(text) as Partial<ResearchBriefInternal>;
    if (!parsed.anchor || !parsed.anchor.trim()) return null;
    return {
      company: String(parsed.company || "").slice(0, 160) || undefined,
      sector: String(parsed.sector || "").slice(0, 120) || undefined,
      sizeSignal: String(parsed.sizeSignal || "").slice(0, 120) || undefined,
      recentEvent: String(parsed.recentEvent || "").slice(0, 280) || undefined,
      anchor: String(parsed.anchor).slice(0, 400),
    };
  } catch {
    return null;
  }
}

async function runIntakeResearch(opts: {
  email: string;
  name: string;
}): Promise<ResearchBriefInternal> {
  const started = Date.now();
  const domain = parseEmailDomain(opts.email);
  if (!domain) {
    return { skippedReason: "no_domain", elapsedMs: Date.now() - started };
  }
  if (FREE_MAIL_DOMAINS.has(domain)) {
    return { skippedReason: "free_mail", elapsedMs: Date.now() - started };
  }

  // Wrap everything in a single overall budget. If any step blows past it,
  // the brief is null and the consult opens clean.
  const overall = new AbortController();
  const overallTimer = setTimeout(() => overall.abort(), INTAKE_RESEARCH_BUDGET_MS);
  const year = new Date().getUTCFullYear();

  try {
    const perCall = (parent: AbortSignal) => {
      const c = new AbortController();
      const onAbort = () => c.abort();
      parent.addEventListener("abort", onAbort, { once: true });
      const t = setTimeout(() => c.abort(), FIRECRAWL_PER_CALL_TIMEOUT_MS);
      return { signal: c.signal, cleanup: () => { clearTimeout(t); parent.removeEventListener("abort", onAbort); } };
    };

    const homepage = perCall(overall.signal);
    const news = perCall(overall.signal);
    const operator = perCall(overall.signal);

    const [homeRes, newsRes, opRes] = await Promise.allSettled([
      firecrawlScrapeBounded(`https://${domain}`, homepage.signal),
      firecrawlSearchBounded(`${domain} news ${year}`, news.signal),
      firecrawlSearchBounded(`${opts.name} ${domain}`, operator.signal),
    ]);
    homepage.cleanup(); news.cleanup(); operator.cleanup();

    const parts: string[] = [];
    const sources: string[] = [];
    if (homeRes.status === "fulfilled" && homeRes.value) {
      parts.push("# HOMEPAGE\n" + homeRes.value);
      sources.push(`https://${domain}`);
    }
    if (newsRes.status === "fulfilled" && newsRes.value) {
      parts.push("# RECENT NEWS\n" + newsRes.value);
      sources.push(`search:${domain} news ${year}`);
    }
    if (opRes.status === "fulfilled" && opRes.value) {
      parts.push("# OPERATOR\n" + opRes.value);
      sources.push(`search:${opts.name} ${domain}`);
    }

    if (!parts.length) {
      return { skippedReason: "all_calls_failed", elapsedMs: Date.now() - started };
    }
    if (overall.signal.aborted) {
      return { skippedReason: "timeout", elapsedMs: Date.now() - started, sources, rawSnippetsLength: parts.join("\n\n").length };
    }

    const snippets = parts.join("\n\n");
    const brief = await synthesizeBrief({
      name: opts.name,
      domain,
      snippets,
      signal: overall.signal,
    });
    if (!brief) {
      return {
        skippedReason: overall.signal.aborted ? "timeout" : "synthesis_failed",
        elapsedMs: Date.now() - started,
        sources,
        rawSnippetsLength: snippets.length,
      };
    }
    return { ...brief, sources, rawSnippetsLength: snippets.length, elapsedMs: Date.now() - started };
  } catch (e) {
    console.error("[intake-research] unexpected failure", (e as Error)?.message);
    return { skippedReason: "all_calls_failed", elapsedMs: Date.now() - started };
  } finally {
    clearTimeout(overallTimer);
  }
}

function stripBriefForClient(b: ResearchBriefInternal | null | undefined): ResearchBriefPublic | null {
  if (!b) return null;
  // Drop sources, rawSnippetsLength, elapsedMs · client/model only see facts.
  const { sources: _s, rawSnippetsLength: _r, elapsedMs: _e, ...publicBrief } = b;
  return publicBrief;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ──────────────────────────────────────────────────────────────────────────
// EMAIL A · visitor confirmation · cream paper · brand-correct · measured
// ──────────────────────────────────────────────────────────────────────────
function buildVisitorHtml(opts: { name: string }): string {
  const openingName = opts.name.trim() ? esc(opts.name.trim()) : "there";
  return `<!doctype html><html><head><meta charset="utf-8"/>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  </head><body style="margin:0;padding:0;background:#FAF8F4;">
    <div style="max-width:680px;margin:0 auto;padding:44px 28px;background:#FAF8F4;">
      <div style="font-family:Inter,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#854F0B;font-weight:600;margin:0 0 18px;">Clarity &middot; Origin &middot; Decision</div>

      <div style="font-family:'Fraunces',Georgia,serif;font-size:34px;font-weight:800;color:#042C53;line-height:1.15;margin:0 0 28px;">Your conversation with COB has been received</div>

      <div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#2C2C2A;line-height:1.65;margin:0 0 18px;">Hi ${openingName},</div>

      <div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#2C2C2A;line-height:1.65;margin:0 0 18px;">Your answers are in. What you shared &mdash; the words you picked for where things stand today, where you'd like them to land, the systems already in your hands, and the way you tend to move &mdash; is the raw material COB needs to begin reading your business.</div>

      <div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#2C2C2A;line-height:1.65;margin:0 0 28px;">A member of the team will be in touch shortly to schedule the next conversation. Until then, this record lives with us &mdash; nothing to chase, nothing to forward.</div>

      <div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#2C2C2A;line-height:1.65;margin:0 0 0;padding:22px 24px;background:#FFFFFF;border:1px solid #E5E3DE;border-radius:4px;">If anything else surfaces between now and then, reply to this email. We read every reply.</div>

      <div style="font-family:Inter,Arial,sans-serif;font-size:11px;color:#5F5E5A;margin-top:36px;padding-top:16px;border-top:1px solid #E5E3DE;line-height:1.6;">
        COB &middot; chiefofbusiness.ai
      </div>
    </div>
  </body></html>`;
}

// ──────────────────────────────────────────────────────────────────────────
// EMAIL B · internal pipeline · functional · metadata-dense
// ──────────────────────────────────────────────────────────────────────────
function buildPipelineHtml(opts: {
  payload: ConsultSubmissionPayload;
  submissionId: string | null;
  disc: ReturnType<typeof analyzeDisc>;
  themeGap: ReturnType<typeof analyzeThemeGap>;
  visitorEmailStatus: string;
  visitorMessageId: string | null;
  mode: string;
  warmStart: any | null;
}): string {
  const { payload, submissionId, disc, themeGap, visitorEmailStatus, visitorMessageId, mode, warmStart } = opts;

  // COMPUTED READ block · only rendered for launch_to_chat mode where the
  // warm-start payload was computed client-side and forwarded with the submission.
  const computedReadBlock = (mode === "launch_to_chat" && warmStart) ? `
      <div style="font-family:'Fraunces',Georgia,serif;font-size:16px;font-weight:700;color:#854F0B;margin:0 0 10px;border-bottom:1px solid #E5E3DE;padding-bottom:6px;">Computed read &middot; launch_to_chat</div>
      <table cellpadding="0" cellspacing="0" border="0" style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#2C2C2A;line-height:1.6;margin:0 0 24px;">
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;width:160px;">Mode</td><td>launch_to_chat (visitor email skipped &middot; chat is the confirmation surface)</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">DISC tally</td><td>D=${esc(warmStart?.disc?.scores?.D ?? 0)} &middot; I=${esc(warmStart?.disc?.scores?.I ?? 0)} &middot; S=${esc(warmStart?.disc?.scores?.S ?? 0)} &middot; C=${esc(warmStart?.disc?.scores?.C ?? 0)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">DISC primary</td><td>${esc(warmStart?.disc?.primary ?? "&mdash;")}${warmStart?.disc?.isHybrid ? ` / ${esc(warmStart?.disc?.secondary)} (hybrid)` : ""}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Emotion sentiment</td><td>${esc(warmStart?.emotion?.sentiment ?? "&mdash;")}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Emotion cluster</td><td>${esc(warmStart?.emotion?.cluster ?? "&mdash;")}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Top friction themes</td><td>${esc((warmStart?.currentState?.topThemes ?? []).join(", ") || "&mdash;")}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Top desired themes</td><td>${esc((warmStart?.desiredState?.topThemes ?? []).join(", ") || "&mdash;")}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Suggested role lens</td><td>${esc(warmStart?.roleLensSuggested ?? "&mdash;")}</td></tr>
      </table>` : "";


  const themeRows = themeGap
    .map(
      (t) => `
      <tr>
        <td style="padding:3px 12px 3px 0;color:#5F5E5A;text-transform:capitalize;">${esc(t.theme)}</td>
        <td style="padding:3px 12px 3px 0;">now +${t.currentPositive} / &minus;${t.currentNegative}</td>
        <td style="padding:3px 12px 3px 0;">next ${t.aspiration}</td>
        <td style="padding:3px 3px 3px 0;">gap ${t.growthGap}</td>
        <td style="padding:3px 0;">friction ${t.frictionLoad}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:#FFFFFF;">
    <div style="max-width:720px;margin:0 auto;padding:28px 24px;">
      <div style="font-family:'Fraunces',Georgia,serif;font-size:24px;font-weight:800;color:#042C53;margin:0 0 4px;">Consult submission</div>
      <div style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#5F5E5A;margin:0 0 24px;">${esc(payload.email)} &middot; submission ${esc(submissionId ?? "n/a")}</div>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#FAF8F4;border:1px solid #E5E3DE;border-radius:4px;margin:0 0 24px;">
        <tr><td style="padding:18px 20px;">
          <div style="font-family:'Fraunces',Georgia,serif;font-size:18px;font-weight:700;color:#0C447C;margin:0 0 12px;">Lead</div>
          <table cellpadding="0" cellspacing="0" border="0" style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#2C2C2A;line-height:1.6;">
            <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;width:110px;">Name</td><td>${esc(payload.name)}</td></tr>
            <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Email</td><td><a href="mailto:${esc(payload.email)}" style="color:#0C447C;text-decoration:none;">${esc(payload.email)}</a></td></tr>
            <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Phone</td><td>${esc(payload.phone || "&mdash;")}</td></tr>
            <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Occupation</td><td>${esc(payload.occupation || "&mdash;")}</td></tr>
          </table>
        </td></tr>
      </table>

      <div style="font-family:'Fraunces',Georgia,serif;font-size:16px;font-weight:700;color:#0C447C;margin:0 0 10px;border-bottom:1px solid #E5E3DE;padding-bottom:6px;">DISC</div>
      <div style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#2C2C2A;line-height:1.6;margin:0 0 24px;">
        Primary <strong>${esc(disc.primaryStyle)}</strong> &middot; Secondary <strong>${esc(disc.secondaryStyle)}</strong> &middot; Hybrid ${disc.isHybrid ? "yes" : "no"}<br/>
        Scores &middot; D=${disc.scores.D} &middot; I=${disc.scores.I} &middot; S=${disc.scores.S} &middot; C=${disc.scores.C}
      </div>

      <div style="font-family:'Fraunces',Georgia,serif;font-size:16px;font-weight:700;color:#0C447C;margin:0 0 10px;border-bottom:1px solid #E5E3DE;padding-bottom:6px;">Theme gap analysis</div>
      <table cellpadding="0" cellspacing="0" border="0" style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#2C2C2A;line-height:1.5;margin:0 0 24px;">
        ${themeRows}
      </table>

      <div style="font-family:'Fraunces',Georgia,serif;font-size:16px;font-weight:700;color:#0C447C;margin:0 0 10px;border-bottom:1px solid #E5E3DE;padding-bottom:6px;">Inventory</div>
      <div style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#2C2C2A;line-height:1.6;margin:0 0 24px;">
        Current-state words: ${payload.currentStateWordIds.length} &middot; Aspiration words: ${payload.aspirationWordIds.length} &middot; Apps tagged: ${payload.appSelections.length}
        ${Array.isArray(payload.toolsByCategory) && payload.toolsByCategory.length ? `
          <table cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;font-family:Inter,Arial,sans-serif;font-size:13px;color:#2C2C2A;line-height:1.6;">
            ${payload.toolsByCategory.map((g) => `
              <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;vertical-align:top;white-space:nowrap;">${esc(g.label)}</td><td style="padding:2px 0;">${esc((g.items || []).join(", "))}</td></tr>
            `).join("")}
          </table>` : (payload.otherAppsText ? `<br/>Other apps: ${esc(payload.otherAppsText)}` : "")}
      </div>

      ${Array.isArray(payload.bucketNotes) && payload.bucketNotes.length ? `
        <div style="font-family:'Fraunces',Georgia,serif;font-size:16px;font-weight:700;color:#0C447C;margin:0 0 10px;border-bottom:1px solid #E5E3DE;padding-bottom:6px;">In their words &middot; per area</div>
        <table cellpadding="0" cellspacing="0" border="0" style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#2C2C2A;line-height:1.6;margin:0 0 24px;width:100%;">
          ${payload.bucketNotes.map((b) => `
            <tr>
              <td style="padding:4px 12px 4px 0;color:#5F5E5A;vertical-align:top;white-space:nowrap;width:160px;">${esc(b.label)}</td>
              <td style="padding:4px 0;white-space:pre-wrap;">${esc(b.note)}</td>
            </tr>
          `).join("")}
        </table>` : ""}

      ${computedReadBlock}

      <div style="font-family:'Fraunces',Georgia,serif;font-size:14px;font-weight:700;color:#0C447C;margin:0 0 10px;border-bottom:1px solid #E5E3DE;padding-bottom:6px;">Delivery</div>
      <table cellpadding="0" cellspacing="0" border="0" style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#2C2C2A;line-height:1.6;">
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;width:160px;">Visitor email status</td><td>${esc(visitorEmailStatus)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Visitor message id</td><td>${esc(visitorMessageId ?? "&mdash;")}</td></tr>
      </table>
    </div>
  </body></html>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Helper · invoke send-email (verify_jwt=false on send-email)
// ──────────────────────────────────────────────────────────────────────────
async function sendViaSendEmail(opts: {
  fromAddress: string;
  fromDisplayName: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ ok: boolean; messageId?: string | null; error?: string; status?: number }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const url = `${SUPABASE_URL}/functions/v1/send-email`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(opts),
    });
    const payload = await resp.json().catch(() => ({} as Record<string, unknown>));
    if (!resp.ok || !(payload as any)?.success) {
      const err = (payload as any)?.error || `status_${resp.status}`;
      console.error("[submit-consult] send-email rejected", resp.status, err);
      return { ok: false, error: String(err), status: resp.status };
    }
    return { ok: true, messageId: (payload as any)?.messageId ?? null, status: resp.status };
  } catch (e: any) {
    console.error("[submit-consult] send-email threw", e?.message || e);
    return { ok: false, error: "fetch_threw" };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const payload = (await request.json().catch(() => null)) as ConsultSubmissionPayload | null;

  if (!payload?.email || typeof payload.email !== "string") {
    return jsonResponse({ error: "A valid email is required." }, 400);
  }

  if (!payload.name || typeof payload.name !== "string" || payload.name.trim().length === 0) {
    return jsonResponse({ error: "Name is required." }, 400);
  }

  // Defensive shape checks
  payload.currentStateWordIds = Array.isArray(payload.currentStateWordIds) ? payload.currentStateWordIds : [];
  payload.aspirationWordIds = Array.isArray(payload.aspirationWordIds) ? payload.aspirationWordIds : [];
  payload.appSelections = Array.isArray(payload.appSelections) ? payload.appSelections : [];
  payload.discResponses = Array.isArray(payload.discResponses) ? payload.discResponses : [];

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Backend not configured." }, 500);
  }

  const themeGapAnalysis = analyzeThemeGap(payload);
  const disc = analyzeDisc(payload);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const mode = typeof (payload as any).mode === "string" ? (payload as any).mode : "default";
  const isLaunchToChat = mode === "launch_to_chat";

  // ──── INTAKE RESEARCH · runs in parallel with the DB insert ──────────────
  // Only fires for launch_to_chat mode (the chat-open flow). Hard 6s budget
  // inside runIntakeResearch; the consult opens clean if it doesn't return.
  const researchPromise: Promise<ResearchBriefInternal | null> = isLaunchToChat
    ? runIntakeResearch({ email: payload.email, name: payload.name.trim() })
        .catch((e) => {
          console.error("[submit-consult] research threw", e);
          return { skippedReason: "all_calls_failed" } as ResearchBriefInternal;
        })
    : Promise.resolve(null);

  const insertResult = await supabase
    .from("consult_submissions")
    .insert({
      email: payload.email,
      name: payload.name.trim(),
      phone: payload.phone?.trim() || null,
      occupation: payload.occupation?.trim() || null,
      challenge: payload.challenge?.trim() || null,
      current_state_words: payload.currentStateWordIds,
      aspiration_state_words: payload.aspirationWordIds,
      theme_gap_analysis: themeGapAnalysis,
      app_inventory: payload.appSelections,
      other_apps_text: payload.otherAppsText ?? null,
      disc_responses: payload.discResponses,
      disc_scores: disc.scores,
      primary_style: disc.primaryStyle,
      secondary_style: disc.secondaryStyle,
      is_hybrid: disc.isHybrid,
      persona_name_candidates: disc.personaNameCandidates,
    })
    .select("id")
    .single();

  if (insertResult.error) {
    console.error("[submit-consult] insert error:", insertResult.error);
    return jsonResponse({ error: "Could not record submission." }, 502);
  }

  const submissionId = insertResult.data?.id ?? null;

  // Await research now · runs in parallel with insert above, so worst case
  // we've burned the 6s of the research budget total (not budget + insert).
  const researchBriefInternal = await researchPromise;
  const researchBriefPublic = stripBriefForClient(researchBriefInternal);
  const lookupFired = !!researchBriefInternal && researchBriefInternal.skippedReason !== "free_mail" && researchBriefInternal.skippedReason !== "no_domain";
  const briefPresent = !!(researchBriefInternal?.anchor && researchBriefInternal.anchor.trim());

  // Instrumentation · fire-and-forget UPDATE. The whole reason we said yes to
  // the live-lookup was conversion analysis · these flags are how we measure.
  if (submissionId && isLaunchToChat) {
    void supabase
      .from("consult_submissions")
      .update({
        research_lookup_fired: lookupFired,
        research_brief_present: briefPresent,
        research_brief: researchBriefInternal as unknown as Record<string, unknown> | null,
      })
      .eq("id", submissionId)
      .then(({ error }) => {
        if (error) console.error("[submit-consult] instrumentation update failed", error.message);
        else console.log("[submit-consult] instrumentation · lookup=", lookupFired, "brief=", briefPresent, "elapsed=", researchBriefInternal?.elapsedMs, "ms");
      });
  }

  // Merge the (sanitized) brief into warmStart so the pipeline email + the
  // downstream chat both see it. Client receives the same sanitized shape.
  const warmStart = (payload as any).warmStart && typeof (payload as any).warmStart === "object"
    ? { ...(payload as any).warmStart, researchBrief: researchBriefPublic, challenge: payload.challenge?.trim() || undefined }
    : null;


  // ──── EMAIL A · visitor confirmation ──────────────────────────────────
  // Skipped in launch_to_chat mode · the chat surface IS the confirmation,
  // and the deployment_inquiry stage handles the eventual booking email.
  let visitorEmailStatus = isLaunchToChat ? "skipped_launch_to_chat" : "skipped";
  let visitorMessageId: string | null = null;

  if (!isLaunchToChat && EMAIL_REGEX.test(payload.email)) {
    const visitorRes = await sendViaSendEmail({
      fromAddress: "cob@chiefofbusiness.ai",
      fromDisplayName: "Your COB",
      to: payload.email,
      subject: "Your conversation with COB has been received",
      html: buildVisitorHtml({ name: payload.name }),
    });
    if (visitorRes.ok) {
      visitorEmailStatus = "sent";
      visitorMessageId = visitorRes.messageId ?? null;
    } else {
      visitorEmailStatus = `send_failed:${visitorRes.error ?? "unknown"}`;
    }
  } else if (!isLaunchToChat) {
    visitorEmailStatus = "visitor_email_invalid";
  }

  // ──── EMAIL B · pipeline notification ─────────────────────────────────
  const pipelineSubject = `New consult submission &middot; ${payload.name.trim()} &middot; ${payload.email}`
    .replace(/&middot;/g, "·");

  const pipelineRes = await sendViaSendEmail({
    fromAddress: "noreply@chiefofbusiness.ai",
    fromDisplayName: "COB Pipeline",
    to: PIPELINE_RECIPIENT,
    subject: pipelineSubject,
    html: buildPipelineHtml({
      payload,
      submissionId,
      disc,
      themeGap: themeGapAnalysis,
      visitorEmailStatus,
      visitorMessageId,
      mode,
      warmStart,
    }),
    replyTo: EMAIL_REGEX.test(payload.email) ? payload.email : undefined,
  });

  if (!pipelineRes.ok) {
    // Pipeline send is B-critical · surface failure but keep submission intact.
    return jsonResponse(
      {
        ok: true,
        id: submissionId,
        visitorEmailStatus,
        visitorMessageId,
        pipelineEmailStatus: `send_failed:${pipelineRes.error ?? "unknown"}`,
      },
      207,
    );
  }

  return jsonResponse({
    ok: true,
    id: submissionId,
    visitorEmailStatus,
    visitorMessageId,
    pipelineEmailStatus: "sent",
    pipelineMessageId: pipelineRes.messageId ?? null,
    researchBrief: researchBriefPublic,
    researchLookupFired: lookupFired,
  });
});
