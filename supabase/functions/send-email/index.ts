// send-email · transactional email sender backed by Resend.
// API key stays server-side; sender allowlist enforced in two layers.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

// Canonical sender registry. Display names here are the suggested defaults;
// callers may override fromDisplayName per send.
const SENDER_REGISTRY = {
  "cob@chiefofbusiness.ai": "Your COB",
  "noreply@chiefofbusiness.ai": "COB Pipeline",
  "deployment@chiefofbusiness.ai": "Your COB · Deployment",
  "jake@chiefofbusiness.ai": "Jake Burkett",
  "phillip@chiefofbusiness.ai": "Phillip Cates",
  "raddo@chiefofbusiness.ai": "Raddo",
  "billing@chiefofbusiness.ai": "COB Billing",
} as const;

type AllowedSender = keyof typeof SENDER_REGISTRY;
const ALLOWED_SENDERS = Object.keys(SENDER_REGISTRY) as [AllowedSender, ...AllowedSender[]];

const BodySchema = z.object({
  fromAddress: z.enum(ALLOWED_SENDERS),
  fromDisplayName: z.string().min(1).max(120),
  to: z.union([
    z.string().email(),
    z.array(z.string().email()).min(1).max(50),
  ]),
  subject: z.string().min(1).max(200),
  html: z.string().min(1),
  text: z.string().optional(),
  replyTo: z.string().email().optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "method_not_allowed" }, 405);
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("[send-email] RESEND_API_KEY not configured");
    return json({ success: false, error: "email_service_unavailable" }, 500);
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return json({ success: false, error: "invalid_payload", fields }, 400);
  }
  const { fromAddress, fromDisplayName, to, subject, html, text, replyTo } = parsed.data;

  // Defense-in-depth: runtime allowlist re-check in case the schema ever drifts.
  if (!(fromAddress in SENDER_REGISTRY)) {
    return json({ success: false, error: "Invalid sender address" }, 400);
  }

  const from = `${fromDisplayName} <${fromAddress}>`;
  const recipients = Array.isArray(to) ? to : [to];

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html,
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    const payload = await resendRes.json().catch(() => ({} as Record<string, unknown>));

    if (!resendRes.ok) {
      console.error(
        "[send-email] Resend rejected:",
        resendRes.status,
        JSON.stringify(payload),
      );
      return json(
        { success: false, error: "Email provider rejected the request" },
        502,
      );
    }

    const messageId = typeof (payload as Record<string, unknown>).id === "string"
      ? (payload as Record<string, string>).id
      : null;

    return json({
      success: true,
      messageId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      "[send-email] Send exception:",
      err instanceof Error ? err.message : String(err),
    );
    return json({ success: false, error: "send_failed" }, 502);
  }
});
