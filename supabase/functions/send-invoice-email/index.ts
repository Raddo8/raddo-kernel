// send-invoice-email · branded HTML invoice delivery via Resend.
// Draft-first: callers must POST an invoice_id + confirmed=true. We never send
// automatically. RESEND_API_KEY must be present and the sending domain
// (chiefofbusiness.ai) must be verified in Resend, or we return a clear
// "not_configured" error rather than a fake success.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const INK = "#042C53";
const INK_SOFT = "#185FA5";
const PAPER = "#FAF8F4";
const BRASS = "#EF9F27";
const ASH = "#5F5E5A";
const CHARCOAL = "#2C2C2A";

const FROM_ADDRESS = "cob@chiefofbusiness.ai";
const FROM_DISPLAY = "COB · Chief of Business";

const BodySchema = z.object({
  invoice_id: z.string().uuid(),
  to: z.string().email().optional(),
  subject: z.string().max(200).optional(),
  message: z.string().max(4000).optional(),
  confirmed: z.literal(true),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  }).format(n);
}

function fmtD(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

function fmtPeriod(iso: string): string {
  try {
    const d = new Date(iso.slice(0, 7) + "-01T00:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
  } catch { return iso; }
}

function esc(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseRemittance(text: string): Array<{ label?: string; value: string }> {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^([A-Za-z][A-Za-z0-9 /().-]{0,60}?):\s+(.+)$/);
    if (m) return { label: m[1].trim(), value: m[2].trim() };
    return { value: line };
  });
}

function buildHtml(args: {
  invoice: any;
  account: { name: string };
  contact: { name: string | null; email: string | null } | null;
  remittance: string;
  message: string | null;
}): string {
  const inv = args.invoice;
  const total = Number(inv.total ?? inv.subtotal ?? 0);
  const periodLabel = fmtPeriod(inv.billing_period);
  const statusLabel = String(inv.status).replace(/_/g, " ").toUpperCase();
  const payLink: string | null = inv.stripe_payment_link || null;
  const remitRows = parseRemittance(args.remittance || "");
  const lines = (inv.line_items || []) as Array<{ description: string; occurrence_date: string; amount_usd: number }>;

  const lineRows = lines.map((li) => `
    <tr>
      <td style="padding:10px 4px;border-bottom:1px solid rgba(239,159,39,0.22);color:${INK};font-size:13px;">${esc(li.description)}</td>
      <td style="padding:10px 4px;border-bottom:1px solid rgba(239,159,39,0.22);color:${ASH};font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;">${esc(fmtD(li.occurrence_date))}</td>
      <td style="padding:10px 4px;border-bottom:1px solid rgba(239,159,39,0.22);color:${INK};text-align:right;font-variant-numeric:tabular-nums;font-size:13px;">${esc(fmtUsd(Number(li.amount_usd)))}</td>
    </tr>
  `).join("");

  const remitHtml = remitRows.length && remitRows.some((r) => r.label)
    ? `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
        ${remitRows.map((r) => r.label
          ? `<tr><td style="padding:3px 12px 3px 0;vertical-align:top;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${ASH};white-space:nowrap;width:40%;">${esc(r.label)}</td><td style="padding:3px 0;color:${INK};font-size:12px;">${esc(r.value)}</td></tr>`
          : `<tr><td colspan="2" style="padding:3px 0;color:${CHARCOAL};font-size:12px;">${esc(r.value)}</td></tr>`
        ).join("")}
      </table>`
    : `<div style="white-space:pre-wrap;color:${CHARCOAL};font-size:12px;line-height:1.6;">${esc(args.remittance || "Bank remittance details will be provided separately.")}</div>`;

  const payButton = payLink ? `
    <table cellspacing="0" cellpadding="0" style="margin:28px 0 8px;">
      <tr><td style="border-radius:4px;background:${BRASS};">
        <a href="${esc(payLink)}"
           style="display:inline-block;padding:14px 28px;font-family:'Fraunces',Georgia,serif;font-size:15px;font-weight:700;letter-spacing:0.02em;color:#0A0A0C;text-decoration:none;">
          Pay ${esc(fmtUsd(total))} now →
        </a>
      </td></tr>
    </table>
    <div style="font-size:11px;color:${ASH};margin-bottom:8px;">
      Secure checkout · card or bank · powered by Stripe
    </div>
  ` : `
    <div style="margin:20px 0;padding:12px 14px;border:1px dashed rgba(4,44,83,0.25);color:${ASH};font-size:12px;">
      Online payment link not yet generated · pay via wire using the details below.
    </div>
  `;

  const messageBlock = args.message ? `
    <div style="margin:18px 0 22px;padding:14px 16px;background:rgba(24,95,165,0.06);border-left:3px solid ${INK_SOFT};color:${CHARCOAL};font-size:13px;line-height:1.55;white-space:pre-wrap;">
      ${esc(args.message)}
    </div>
  ` : "";

  const greeting = args.contact?.name?.trim() || "there";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Invoice ${esc(inv.invoice_number)}</title>
</head>
<body style="margin:0;padding:0;background:#EDEAE4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:${INK};">
  <div style="display:none;font-size:1px;color:${PAPER};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Invoice ${esc(inv.invoice_number)} · ${esc(fmtUsd(total))} due ${esc(fmtD(inv.due_date))}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EDEAE4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:${PAPER};">
        <tr><td style="padding:36px 40px 8px;">
          <table width="100%"><tr>
            <td>
              <div style="font-family:'Fraunces',Georgia,serif;font-weight:800;font-size:24px;letter-spacing:-0.015em;color:${INK};">COB Technologies LLC</div>
              <div style="margin-top:4px;font-size:11px;color:${ASH};">Chief of Business · chiefofbusiness.ai</div>
            </td>
            <td align="right" style="vertical-align:top;">
              <div style="font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:18px;letter-spacing:0.02em;color:${INK};">INVOICE</div>
              <div style="margin-top:4px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:${INK_SOFT};letter-spacing:0.06em;">${esc(inv.invoice_number)}</div>
              <div style="margin-top:6px;display:inline-block;padding:2px 8px;border:1px solid ${BRASS};font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9px;letter-spacing:0.18em;color:${BRASS};background:rgba(239,159,39,0.06);">${esc(statusLabel)}</div>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:0 40px;">
          <div style="height:1px;background:${BRASS};margin:18px 0 0;"></div>
        </td></tr>

        <tr><td style="padding:24px 40px 8px;color:${CHARCOAL};font-size:14px;line-height:1.6;">
          Hi ${esc(greeting)},<br/><br/>
          Invoice <strong style="color:${INK};">${esc(inv.invoice_number)}</strong> for
          <strong style="color:${INK};">${esc(args.account.name)}</strong> is ready.
          The full detail and payment options are below.
          ${messageBlock}
        </td></tr>

        <tr><td style="padding:0 40px;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="vertical-align:top;width:50%;padding-right:12px;">
                <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${ASH};">Bill to</div>
                <div style="font-family:'Fraunces',Georgia,serif;font-size:16px;font-weight:600;color:${INK};margin-top:4px;">${esc(args.account.name)}</div>
                ${args.contact?.name ? `<div style="font-size:12px;margin-top:3px;color:${CHARCOAL};">Attn: ${esc(args.contact.name)}</div>` : ""}
                ${args.contact?.email ? `<div style="font-size:12px;color:${ASH};">${esc(args.contact.email)}</div>` : ""}
              </td>
              <td style="vertical-align:top;width:50%;padding-left:12px;font-size:12px;">
                ${metaRowHtml("Issue date", fmtD(inv.issue_date))}
                ${metaRowHtml("Due date", fmtD(inv.due_date), true)}
                ${metaRowHtml("Billing period", periodLabel)}
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:28px 40px 0;">
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid ${BRASS};">
                <th style="text-align:left;padding:8px 4px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${ASH};font-weight:500;">Description</th>
                <th style="text-align:left;padding:8px 4px;width:130px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${ASH};font-weight:500;">Occurrence</th>
                <th style="text-align:right;padding:8px 4px;width:120px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${ASH};font-weight:500;">Amount</th>
              </tr>
            </thead>
            <tbody>${lineRows || `<tr><td colspan="3" style="padding:14px 4px;text-align:center;color:${ASH};font-size:12px;">No line items.</td></tr>`}</tbody>
          </table>
        </td></tr>

        <tr><td style="padding:16px 40px 0;">
          <table width="100%" cellspacing="0" cellpadding="0"><tr>
            <td></td>
            <td style="width:260px;">
              <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:${ASH};">
                <span>Subtotal</span>
                <span style="font-variant-numeric:tabular-nums;">${esc(fmtUsd(Number(inv.subtotal ?? 0)))}</span>
              </div>
              <table width="100%" style="border-top:2px solid ${BRASS};margin-top:6px;"><tr>
                <td style="padding-top:10px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${ASH};">Total due</td>
                <td style="padding-top:10px;text-align:right;font-family:'Fraunces',Georgia,serif;font-size:20px;font-weight:700;color:${INK};font-variant-numeric:tabular-nums;">${esc(fmtUsd(total))}</td>
              </tr></table>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:8px 40px 0;" align="center">${payButton}</td></tr>

        <tr><td style="padding:20px 40px 0;">
          <div style="padding:16px 18px;border:1px solid rgba(4,44,83,0.12);background:rgba(255,255,255,0.55);">
            <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${ASH};">Remittance · wiring instructions</div>
            <div style="margin-top:10px;">${remitHtml}</div>
          </div>
        </td></tr>

        ${inv.notes ? `<tr><td style="padding:20px 40px 0;">
          <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${ASH};">Notes</div>
          <div style="margin-top:6px;font-size:12px;color:${CHARCOAL};line-height:1.55;white-space:pre-wrap;">${esc(inv.notes)}</div>
        </td></tr>` : ""}

        <tr><td style="padding:32px 40px 36px;">
          <div style="border-top:1px solid rgba(239,159,39,0.35);padding-top:14px;text-align:center;font-size:10px;color:${ASH};letter-spacing:0.02em;">
            © ${new Date().getFullYear()} COB Technologies LLC
            <span style="color:${BRASS};margin:0 6px;">·</span>
            chiefofbusiness.ai
            <span style="color:${BRASS};margin:0 6px;">·</span>
            Reference ${esc(inv.invoice_number)} with your payment
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function metaRowHtml(label: string, value: string, emphasize = false): string {
  return `<div style="display:flex;justify-content:space-between;gap:12px;padding:2px 0;">
    <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${ASH};">${esc(label)}</span>
    <span style="font-size:${emphasize ? 13 : 12}px;font-weight:${emphasize ? 600 : 400};color:${emphasize ? INK : CHARCOAL};">${esc(value)}</span>
  </div>`;
}

function buildText(args: { invoice: any; account: { name: string }; message: string | null }): string {
  const inv = args.invoice;
  const total = Number(inv.total ?? inv.subtotal ?? 0);
  const parts = [
    `Invoice ${inv.invoice_number} · ${args.account.name}`,
    `Amount due: ${fmtUsd(total)}`,
    `Due date: ${fmtD(inv.due_date)}`,
    `Billing period: ${fmtPeriod(inv.billing_period)}`,
  ];
  if (inv.stripe_payment_link) parts.push(`\nPay online: ${inv.stripe_payment_link}`);
  if (args.message) parts.push(`\n${args.message}`);
  parts.push(`\nReference ${inv.invoice_number} with your payment.\n\n— COB Billing`);
  return parts.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return json({
      success: false,
      error: "not_configured",
      detail: "RESEND_API_KEY is not set in project secrets · verify the sending domain chiefofbusiness.ai in Resend and add the API key.",
    }, 503);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ success: false, error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: userData } = await supabase.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ success: false, error: "unauthorized" }, 401);

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ success: false, error: "invalid_payload", fields: parsed.error.flatten().fieldErrors }, 400);
  }
  const { invoice_id, to: overrideTo, subject: overrideSubject, message } = parsed.data;

  const { data: inv, error: iErr } = await supabase
    .from("invoices")
    .select("*, accounts(id, name, primary_contact_id, metadata)")
    .eq("id", invoice_id)
    .maybeSingle();
  if (iErr || !inv) return json({ success: false, error: "invoice_not_found" }, 404);

  const { data: isMember } = await supabase.rpc("is_workspace_member", {
    _user_id: user.id,
    _workspace_id: inv.workspace_id,
  });
  if (!isMember) return json({ success: false, error: "forbidden" }, 403);

  // Resolve recipient: explicit override → primary contact → metadata fallback.
  let recipient = (overrideTo || "").trim();
  let contactName: string | null = null;
  let contactEmail: string | null = null;
  const acc: any = inv.accounts;
  if (acc?.primary_contact_id) {
    const { data: c } = await supabase.from("contacts")
      .select("name, email").eq("id", acc.primary_contact_id).maybeSingle();
    if (c) { contactName = c.name; contactEmail = c.email; }
  }
  if (!contactEmail) {
    const p = acc?.metadata?.cob_profile?.primary_contact;
    if (p?.email) { contactEmail = p.email; contactName = p.name ?? null; }
  }
  if (!recipient) recipient = contactEmail || "";
  if (!recipient) return json({ success: false, error: "no_recipient", detail: "Add a primary contact email or pass `to`." }, 400);

  // Load remittance from workspace settings.
  const { data: ws } = await supabase.from("workspaces")
    .select("settings").eq("id", inv.workspace_id).maybeSingle();
  const remittance = String(ws?.settings?.invoicing?.remittance ?? "").trim();

  const periodLabel = fmtPeriod(inv.billing_period);
  const subject = overrideSubject?.trim()
    || `Invoice ${inv.invoice_number} · ${acc?.name ?? "Your account"} · ${periodLabel}`;

  const html = buildHtml({
    invoice: inv,
    account: { name: acc?.name ?? "Your account" },
    contact: { name: contactName, email: contactEmail },
    remittance,
    message: message?.trim() || null,
  });
  const text = buildText({
    invoice: inv,
    account: { name: acc?.name ?? "Your account" },
    message: message?.trim() || null,
  });

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
        to: [recipient],
        subject,
        html,
        text,
        reply_to: "billing@chiefofbusiness.ai",
        tags: [
          { name: "kind", value: "invoice" },
          { name: "invoice_number", value: String(inv.invoice_number).replace(/[^A-Za-z0-9_-]/g, "_") },
        ],
      }),
    });
    const payload = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      console.error("[send-invoice-email] Resend rejected:", resendRes.status, JSON.stringify(payload));
      const detail = (payload as any)?.message || `Resend HTTP ${resendRes.status}`;
      return json({ success: false, error: "resend_rejected", detail }, 502);
    }
    const messageId = typeof (payload as any).id === "string" ? (payload as any).id : null;

    // Mark issued if still draft, and write timeline.
    if (inv.status === "draft" || inv.status === "auto_draft") {
      await supabase.from("invoices").update({
        status: "issued",
        issue_date: new Date().toISOString().slice(0, 10),
      }).eq("id", inv.id);
    } else if (inv.status === "issued") {
      await supabase.from("invoices").update({ status: "sent" }).eq("id", inv.id);
    }

    await supabase.from("timeline_events").insert({
      account_id: inv.account_id,
      direction: "outbound",
      channel: "email",
      summary: `Invoice ${inv.invoice_number} emailed to ${recipient}`,
      raw_json: { invoice_id: inv.id, recipient, message_id: messageId, subject },
      occurred_at: new Date().toISOString(),
    });

    return json({ success: true, messageId, to: recipient });
  } catch (err) {
    console.error("[send-invoice-email] exception:", err instanceof Error ? err.message : String(err));
    return json({ success: false, error: "send_failed", detail: err instanceof Error ? err.message : String(err) }, 502);
  }
});
