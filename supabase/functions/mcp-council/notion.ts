// supabase/functions/mcp-council/notion.ts
//
// Notion write-back for the boardroom DB.
// Server-only. Outputs only — never seeds, preamble, or model names.

const NOTION_API = "https://api.notion.com/v1/pages";
const NOTION_VERSION = "2022-06-28";

type Minute = {
  recommendation: string;
  dissent: string;
  anticipatory_horizon: string[];
  confidence: { epistemic: number; rigor: number };
  freshness: string;
  participating_chairs: string[];
  signature: string;
};

function rt(text: string) {
  // Notion rich_text segments cap at 2000 chars each.
  const chunks: string[] = [];
  let s = text || "";
  while (s.length > 1900) { chunks.push(s.slice(0, 1900)); s = s.slice(1900); }
  if (s.length) chunks.push(s);
  if (chunks.length === 0) chunks.push("");
  return chunks.map((c) => ({ type: "text", text: { content: c } }));
}

function para(text: string) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: rt(text) } };
}
function h2(text: string) {
  return { object: "block", type: "heading_2", heading_2: { rich_text: rt(text) } };
}
function bullet(text: string) {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: rt(text) },
  };
}

function yymmdd(iso: string): string {
  const d = new Date(iso);
  const y = String(d.getUTCFullYear()).slice(-2);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function buildTitle(question: string, freshness: string, tenant?: string): string {
  const prefix = tenant ? `[${tenant} · ${yymmdd(freshness)}]` : `[${yymmdd(freshness)}]`;
  return `${prefix} ${truncate(question, 60)}`;
}

function buildBody(minute: Minute): any[] {
  const blocks: any[] = [];
  blocks.push(h2("Recommendation"));
  blocks.push(para(minute.recommendation));

  blocks.push(h2("Anticipatory Horizon"));
  for (const item of minute.anticipatory_horizon) blocks.push(bullet(item));

  blocks.push(h2("Dissent · Abe"));
  blocks.push(para(minute.dissent));

  blocks.push(h2("Confidence"));
  blocks.push(para(
    `Epistemic ${minute.confidence.epistemic.toFixed(2)} · Rigor ${minute.confidence.rigor.toFixed(2)}`,
  ));

  blocks.push(h2("Participating Chairs"));
  blocks.push(para(minute.participating_chairs.join(" · ")));

  return blocks;
}

function buildFullProperties(minute: Minute, title: string): Record<string, any> {
  const horizonJoined = minute.anticipatory_horizon.join(" · ");
  return {
    "Title": { title: rt(title) },
    "Date": { date: { start: minute.freshness } },
    "Recommendation": { rich_text: rt(minute.recommendation) },
    "Dissent (Abe)": { rich_text: rt(minute.dissent) },
    "Anticipatory Horizon": { rich_text: rt(horizonJoined) },
    "Participating Chairs": {
      multi_select: minute.participating_chairs.map((n) => ({ name: n })),
    },
    "Confidence Epistemic": { number: minute.confidence.epistemic },
    "Confidence Rigor": { number: minute.confidence.rigor },
    "Council Status": { select: { name: "Proposed" } },
    "Source Tool": { rich_text: rt("cob_council_to_notion") },
  };
}

async function postPage(token: string, payload: any): Promise<Response> {
  return await fetch(NOTION_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export interface WriteMinuteTarget {
  token: string;
  dbId: string;
  tenant: string;
}

export async function writeMinuteToNotion(
  minute: Minute,
  question: string,
  target?: WriteMinuteTarget,
): Promise<{ url: string; id: string }> {
  // harden-v1: prefer tenant-scoped target. Legacy positional call falls
  // back to SPINNEY env only (kept for any internal callers; new code MUST
  // pass target explicitly).
  const token = target?.token ?? Deno.env.get("SPINNEY_NOTION_TOKEN") ?? "";
  const dbId = target?.dbId ?? Deno.env.get("SPINNEY_BOARDROOM_DB") ?? "";
  const tenant = target?.tenant;
  if (!token || !dbId) throw new Error("office_not_configured");

  const title = buildTitle(question, minute.freshness, tenant);
  const children = buildBody(minute);
  const properties = buildFullProperties(minute, title);

  let r = await postPage(token, {
    parent: { database_id: dbId },
    properties,
    children,
  });

  if (!r.ok) {
    let bodyText = "";
    try { bodyText = await r.text(); } catch { /* noop */ }
    let parsed: any = null;
    try { parsed = JSON.parse(bodyText); } catch { /* noop */ }
    const code = parsed?.code ?? "";
    const msg = parsed?.message ?? bodyText;

    if (code === "validation_error") {
      console.warn("notion_validation_error_retry_title_only", msg?.slice?.(0, 200));
      r = await postPage(token, {
        parent: { database_id: dbId },
        properties: { "Title": { title: rt(title) } },
        children,
      });
      if (!r.ok) {
        let t2 = ""; try { t2 = await r.text(); } catch { /* noop */ }
        console.error("notion_write_failed_after_retry", r.status, t2.slice(0, 500));
        throw new Error("notion_write_failed");
      }
    } else {
      console.error("notion_write_failed", r.status, msg?.slice?.(0, 500));
      throw new Error("notion_write_failed");
    }
  }

  const json = await r.json();
  return { url: json?.url ?? "", id: json?.id ?? "" };
}
