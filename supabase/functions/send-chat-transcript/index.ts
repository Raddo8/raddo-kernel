// @ts-nocheck
// Silently emails the COB chat transcript to internal recipients at end-of-session.
// Public endpoint (no JWT) · rate-limited · service-role insert into timeline if needed.
// The visiting customer is NOT notified · this is a one-way internal pipe.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { checkRateLimitDb, getClientIp } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Internal recipients · edit here to add more inboxes
const INTERNAL_RECIPIENTS = ["cob.brahan@gmail.com"];
const FROM_ADDRESS = "SAMPLE COB <onboarding@resend.dev>";

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

function fmtTime(iso: string | number): string {
  try {
    const d = typeof iso === "number" ? new Date(iso) : new Date(iso);
    return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return String(iso);
  }
}

interface WireMsg {
  role: "you" | "cob";
  voice?: string;
  text: string;
  at?: number;
}

interface WireLead {
  name?: string;
  email?: string;
  company?: string;
  title?: string;
  challenge?: string;
}

function buildHtml(opts: {
  sessionId: string;
  voice: string;
  lead: WireLead | null;
  messages: WireMsg[];
  startedAt: string;
  endedAt: string;
  reason: string;
  userAgent: string;
  referer: string;
}): string {
  const { sessionId, voice, lead, messages, startedAt, endedAt, reason, userAgent, referer } = opts;
  const turnCount = messages.filter((m) => m.role === "you").length;

  const leadBlock = lead
    ? `
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#FAF8F4;border:1px solid #E5E3DE;border-radius:4px;margin:0 0 24px;">
      <tr><td style="padding:18px 20px;">
        <div style="font-family:'Fraunces',Georgia,serif;font-size:18px;font-weight:700;color:#0C447C;margin:0 0 12px;letter-spacing:0.01em;">Lead · gate submission</div>
        <table cellpadding="0" cellspacing="0" border="0" style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#2C2C2A;line-height:1.6;">
          <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;width:90px;">Name</td><td>${esc(lead.name)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Email</td><td><a href="mailto:${esc(lead.email)}" style="color:#0C447C;text-decoration:none;">${esc(lead.email)}</a></td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Company</td><td>${esc(lead.company)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Title</td><td>${esc(lead.title)}</td></tr>
          <tr><td style="padding:6px 12px 2px 0;color:#5F5E5A;vertical-align:top;">Challenge</td><td style="padding-top:6px;white-space:pre-wrap;">${esc(lead.challenge)}</td></tr>
        </table>
      </td></tr>
    </table>`
    : `<div style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#854F0B;background:#FFF6E6;border:1px solid #EF9F27;padding:12px 16px;border-radius:4px;margin:0 0 24px;">No lead block · gate was bypassed or submission failed.</div>`;

  const msgBlocks = messages
    .map((m) => {
      const who = m.role === "you" ? "Visitor" : `COB · ${esc(m.voice || voice)}`;
      const tone = m.role === "you" ? "#0C447C" : "#854F0B";
      const ts = m.at ? fmtTime(m.at) : "";
      return `
        <div style="margin:0 0 18px;">
          <div style="font-family:Inter,Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${tone};font-weight:600;margin:0 0 4px;">${who}${ts ? ` · <span style="color:#5F5E5A;font-weight:400;letter-spacing:0;">${ts}</span>` : ""}</div>
          <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#2C2C2A;line-height:1.55;white-space:pre-wrap;background:#FFFFFF;border-left:2px solid ${tone};padding:8px 14px;">${esc(m.text)}</div>
        </div>`;
    })
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:#FFFFFF;">
    <div style="max-width:720px;margin:0 auto;padding:28px 24px;">
      <div style="font-family:'Fraunces',Georgia,serif;font-size:24px;font-weight:800;color:#042C53;margin:0 0 4px;">SAMPLE COB · session transcript</div>
      <div style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#5F5E5A;margin:0 0 24px;">Session ${esc(sessionId)} · ${turnCount} visitor turn${turnCount === 1 ? "" : "s"} · closed: ${esc(reason)}</div>
      ${leadBlock}
      <div style="font-family:'Fraunces',Georgia,serif;font-size:16px;font-weight:700;color:#0C447C;margin:0 0 14px;border-bottom:1px solid #E5E3DE;padding-bottom:6px;">Conversation</div>
      ${msgBlocks || '<div style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#5F5E5A;">(no messages exchanged)</div>'}
      <div style="font-family:Inter,Arial,sans-serif;font-size:11px;color:#5F5E5A;margin-top:32px;padding-top:14px;border-top:1px solid #E5E3DE;line-height:1.5;">
        Started: ${esc(startedAt)}<br/>
        Ended: ${esc(endedAt)}<br/>
        Voice: ${esc(voice)}<br/>
        Referer: ${esc(referer || "—")}<br/>
        UA: ${esc(userAgent || "—")}
      </div>
    </div>
  </body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Rate limit per IP · 20 per 10 min
  try {
    const ip = getClientIp(req.headers);
    const rl = await checkRateLimitDb(supabase, "send-chat-transcript", ip, 20, 10 * 60_000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter ?? 60) },
      });
    }
  } catch (e) {
    console.error("[send-chat-transcript] rate-limit check failed", e);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const sessionId = String(body?.session_id || "").slice(0, 64) || "unknown";
  const voice = String(body?.voice || "cob").slice(0, 32);
  const reason = String(body?.reason || "manual").slice(0, 32);
  const messages: WireMsg[] = Array.isArray(body?.messages) ? body.messages.slice(0, 200) : [];
  const lead: WireLead | null = body?.lead && typeof body.lead === "object" ? body.lead : null;

  // Don't send empty transcripts
  const hasUserTurn = messages.some((m) => m?.role === "you" && (m?.text || "").trim().length > 0);
  if (!hasUserTurn) {
    return jsonResponse({ ok: true, skipped: "empty" });
  }

  // Idempotency · session_id + reason · skip if already sent in last 24h
  const dedupeKey = `chat-transcript:${sessionId}:${reason}`;
  const { data: existing } = await supabase
    .from("rate_limits")
    .select("key")
    .eq("key", dedupeKey)
    .gte("window_start", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
    .maybeSingle();
  if (existing) {
    return jsonResponse({ ok: true, skipped: "already_sent" });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("[send-chat-transcript] RESEND_API_KEY missing");
    return jsonResponse({ error: "email_provider_not_configured" }, 500);
  }

  const userAgent = String(req.headers.get("user-agent") || "").slice(0, 500);
  const referer = String(req.headers.get("referer") || "").slice(0, 500);
  const endedAt = new Date().toISOString();
  const startedAt =
    messages.length && messages[0]?.at ? new Date(messages[0].at).toISOString() : endedAt;

  const turnCount = messages.filter((m) => m.role === "you").length;
  const leadName = lead?.name?.trim() || "Anonymous";
  const leadCompany = lead?.company?.trim() ? ` · ${lead.company.trim()}` : "";
  const subject = `[Sample COB] ${leadName}${leadCompany} · ${turnCount} turn${turnCount === 1 ? "" : "s"} · ${voice}`;

  const html = buildHtml({
    sessionId,
    voice,
    lead,
    messages,
    startedAt,
    endedAt,
    reason,
    userAgent,
    referer,
  });

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: INTERNAL_RECIPIENTS,
        reply_to: lead?.email || undefined,
        subject,
        html,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[send-chat-transcript] resend failed", resp.status, txt);
      return jsonResponse({ error: "send_failed", detail: txt.slice(0, 200) }, 502);
    }

    // Mark as sent (idempotency marker via rate_limits row)
    await supabase
      .from("rate_limits")
      .upsert({ key: dedupeKey, window_start: new Date().toISOString(), request_count: 1 });

    return jsonResponse({ ok: true });
  } catch (e: any) {
    console.error("[send-chat-transcript] threw", e?.message || e);
    return jsonResponse({ error: "send_threw" }, 500);
  }
});
