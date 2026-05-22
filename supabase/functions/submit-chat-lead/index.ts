// @ts-nocheck
// Public endpoint · captures the Sample COB chat gate form before chat unlocks.
// Also handles the Phase 5 deployment_inquiry stage · on submit, fires
// (a) transcript email to the prospect and (b) duplicate email to the
// internal pipeline address. Both sends are best-effort and never block the 200.
// No JWT · validated · rate-limited · service-role insert into chat_leads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { checkRateLimitDb, getClientIp } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
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

function fmtLongDate(d: Date): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
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

function renderTranscriptHtml(messages: WireMsg[]): string {
  if (!messages.length) {
    return `<div style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#5F5E5A;">(no messages)</div>`;
  }
  return messages
    .map((m) => {
      const who = m.role === "you" ? "You" : `COB · ${esc(m.voice || "cob")}`;
      const tone = m.role === "you" ? "#0C447C" : "#854F0B";
      const ts = m.at ? fmtTime(m.at) : "";
      return `
        <div style="margin:0 0 18px;">
          <div style="font-family:Inter,Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${tone};font-weight:600;margin:0 0 4px;">${who}${ts ? ` · <span style="color:#5F5E5A;font-weight:400;letter-spacing:0;">${ts}</span>` : ""}</div>
          <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#2C2C2A;line-height:1.55;white-space:pre-wrap;background:#FFFFFF;border-left:2px solid ${tone};padding:8px 14px;">${esc(m.text)}</div>
        </div>`;
    })
    .join("");
}

function renderTranscriptText(messages: WireMsg[]): string {
  return messages
    .map((m) => {
      const who = m.role === "you" ? "You" : `COB (${m.voice || "cob"})`;
      const ts = m.at ? fmtTime(m.at) : "";
      return `${who}${ts ? " · " + ts : ""}\n${m.text}\n`;
    })
    .join("\n");
}

function buildProspectHtml(opts: {
  recipientName: string;
  messages: WireMsg[];
  conversationId: string;
}): string {
  const { recipientName, messages, conversationId } = opts;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FFFFFF;">
    <div style="max-width:720px;margin:0 auto;padding:28px 24px;font-family:Inter,Arial,sans-serif;color:#2C2C2A;">
      <p style="font-size:15px;line-height:1.55;margin:0 0 18px;">${esc(recipientName)} —</p>
      <p style="font-size:15px;line-height:1.55;margin:0 0 22px;">
        Your conversation with COB is below. Someone from the deployment team will read through it and reach out within one business day to talk through what this looks like at your scale. The transcript is yours to reference, share with your CFO and CTO if helpful, or annotate for our follow-up.
      </p>
      <div style="font-family:'Fraunces',Georgia,serif;font-size:16px;font-weight:700;color:#0C447C;margin:0 0 14px;border-bottom:1px solid #E5E3DE;padding-bottom:6px;">Conversation</div>
      ${renderTranscriptHtml(messages)}
      <p style="font-size:15px;line-height:1.55;margin:28px 0 4px;">—COB</p>
      <p style="font-size:13px;color:#5F5E5A;margin:0 0 24px;">RADDO</p>
      <p style="font-size:13px;line-height:1.55;color:#5F5E5A;margin:0 0 8px;">
        P.S. If anything in the transcript misrepresents your situation or you want a different angle pressure-tested, just reply. The follow-up call is the natural place for that.
      </p>
      <div style="font-family:Inter,Arial,sans-serif;font-size:10px;color:#9a9893;margin-top:24px;">Conversation ID · ${esc(conversationId)}</div>
    </div>
  </body></html>`;
}

function buildPipelineHtml(opts: {
  timestamp: string;
  email: string;
  company: string;
  situation: string;
  messages: WireMsg[];
  conversationId: string;
  pageUrl: string;
}): string {
  const { timestamp, email, company, situation, messages, conversationId, pageUrl } = opts;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FFFFFF;">
    <div style="max-width:720px;margin:0 auto;padding:24px;font-family:Inter,Arial,sans-serif;color:#2C2C2A;">
      <div style="font-family:'Fraunces',Georgia,serif;font-size:20px;font-weight:800;color:#042C53;margin:0 0 12px;">NEW DEPLOYMENT REQUEST</div>
      <table cellpadding="0" cellspacing="0" border="0" style="font-size:13px;line-height:1.6;margin:0 0 18px;">
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;width:110px;">Submitted</td><td>${esc(timestamp)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Email</td><td><a href="mailto:${esc(email)}" style="color:#0C447C;text-decoration:none;">${esc(email)}</a></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5F5E5A;">Company</td><td>${esc(company)}</td></tr>
      </table>
      <div style="font-family:'Fraunces',Georgia,serif;font-size:14px;font-weight:700;color:#0C447C;margin:0 0 6px;">Prospect's situation</div>
      <div style="font-size:14px;white-space:pre-wrap;background:#FAF8F4;border-left:2px solid #0C447C;padding:10px 14px;margin:0 0 22px;">${esc(situation)}</div>
      <div style="font-family:'Fraunces',Georgia,serif;font-size:14px;font-weight:700;color:#0C447C;margin:0 0 10px;border-bottom:1px solid #E5E3DE;padding-bottom:6px;">Full conversation transcript</div>
      ${renderTranscriptHtml(messages)}
      <hr style="border:none;border-top:1px solid #E5E3DE;margin:24px 0;" />
      <div style="font-size:11px;color:#5F5E5A;line-height:1.6;">
        Conversation ID: ${esc(conversationId)}<br/>
        Source: raddo.ai sandbox<br/>
        Page URL: ${esc(pageUrl || "—")}
      </div>
    </div>
  </body></html>`;
}

async function sendResend(opts: {
  apiKey: string;
  from: string;
  to: string | string[];
  reply_to?: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; detail?: string }> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        reply_to: opts.reply_to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, detail: `${resp.status} ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, detail: e?.message || "send_threw" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Rate limit by IP · 10 submissions / 10 minutes
  try {
    const ip = getClientIp(req.headers);
    const rl = await checkRateLimitDb(supabase, "submit-chat-lead", ip, 10, 10 * 60_000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many submissions. Try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter ?? 60) },
      });
    }
  } catch (e) {
    console.error("[submit-chat-lead] rate-limit check failed", e);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const name = clean(body?.name, 120);
  const email = clean(body?.email, 200).toLowerCase();
  const company = clean(body?.company, 160);
  const title = clean(body?.title, 160);
  const rawChallenge = clean(body?.challenge, 2000);
  const sessionId = clean(body?.session_id, 64) || crypto.randomUUID();
  const voice = clean(body?.voice, 32) || "cob";
  const stage = clean(body?.stage, 32); // "gate" (default) | "deployment_inquiry"
  const situation = clean(body?.situation, 2000); // used when stage === deployment_inquiry

  const isDeploymentInquiry = stage === "deployment_inquiry";

  // Deployment-inquiry path · only requires email + company + situation.
  // Name/title fall back to placeholders so the existing NOT NULL columns stay happy.
  const effectiveName = name || (isDeploymentInquiry ? "Deployment Inquiry" : "");
  const effectiveTitle = title || (isDeploymentInquiry ? "—" : "");
  const challenge = isDeploymentInquiry
    ? `[DEPLOYMENT_INQUIRY] ${situation || rawChallenge}`.slice(0, 2000)
    : rawChallenge;

  if (!effectiveName) return jsonResponse({ error: "Name is required." }, 400);
  if (!email || !EMAIL_RE.test(email)) return jsonResponse({ error: "A valid email is required." }, 400);
  if (!company) return jsonResponse({ error: "Company is required." }, 400);
  if (!effectiveTitle) return jsonResponse({ error: "Title is required." }, 400);
  if (challenge.length < (isDeploymentInquiry ? 14 : 10)) {
    return jsonResponse({ error: "Tell us a bit more · at least one sentence." }, 400);
  }

  const userAgent = clean(req.headers.get("user-agent"), 500);
  const referer = clean(req.headers.get("referer"), 500);

  const { data, error } = await supabase
    .from("chat_leads")
    .insert({
      session_id: sessionId,
      name: effectiveName,
      email,
      company,
      title: effectiveTitle,
      challenge,
      voice,
      user_agent: userAgent,
      referer,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[submit-chat-lead] insert failed", error);
    return jsonResponse({ error: "Could not record submission." }, 502);
  }

  // ── Deployment inquiry · best-effort email fan-out ──────────────────────
  if (isDeploymentInquiry) {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.warn("[submit-chat-lead] RESEND_API_KEY missing · skipping deployment emails");
    } else {
      const FROM = Deno.env.get("RADDO_FROM_EMAIL") || "SAMPLE COB <onboarding@resend.dev>";
      const PIPELINE_TO = Deno.env.get("RADDO_PIPELINE_EMAIL") || "cob.brahan@gmail.com";
      const REPLY_TO = Deno.env.get("RADDO_REPLY_TO") || undefined;

      const rawMessages: WireMsg[] = Array.isArray(body?.messages) ? body.messages.slice(0, 200) : [];
      const messages: WireMsg[] = rawMessages
        .filter((m) => m && typeof m === "object" && (m.text || "").trim().length > 0)
        .map((m) => ({
          role: m.role === "you" ? "you" : "cob",
          voice: typeof m.voice === "string" ? m.voice.slice(0, 32) : voice,
          text: String(m.text).slice(0, 8000),
          at: typeof m.at === "number" ? m.at : undefined,
        }));

      const nowIso = new Date().toISOString();
      const longDate = fmtLongDate(new Date());
      const recipientName = name || "there";
      const conversationId = sessionId;

      const prospectHtml = buildProspectHtml({ recipientName, messages, conversationId });
      const prospectText =
        `${recipientName} —\n\nYour conversation with COB is below. Someone from the deployment team will read through it and reach out within one business day.\n\n` +
        renderTranscriptText(messages) +
        `\n—COB\nRADDO\n\nP.S. If anything in the transcript misrepresents your situation or you want a different angle pressure-tested, just reply.\n\nConversation ID · ${conversationId}\n`;

      const pipelineHtml = buildPipelineHtml({
        timestamp: nowIso,
        email,
        company,
        situation: situation || rawChallenge,
        messages,
        conversationId,
        pageUrl: referer,
      });

      // Fire both in parallel · do not block response on outcome.
      Promise.allSettled([
        sendResend({
          apiKey: RESEND_API_KEY,
          from: FROM,
          to: email,
          reply_to: REPLY_TO,
          subject: `Your COB conversation — ${longDate}`,
          html: prospectHtml,
          text: prospectText,
        }),
        sendResend({
          apiKey: RESEND_API_KEY,
          from: FROM,
          to: PIPELINE_TO,
          reply_to: email,
          subject: `New deployment request: ${company} — ${email}`,
          html: pipelineHtml,
        }),
      ]).then((results) => {
        results.forEach((r, i) => {
          const label = i === 0 ? "prospect" : "pipeline";
          if (r.status === "fulfilled" && r.value.ok) {
            console.log(`[submit-chat-lead] deployment email · ${label} · sent`);
          } else {
            const detail = r.status === "fulfilled" ? r.value.detail : (r as any).reason?.message;
            console.error(`[submit-chat-lead] deployment email · ${label} · failed`, detail);
          }
        });
      });
    }
  }

  return jsonResponse({ ok: true, id: data?.id, session_id: sessionId });
});
