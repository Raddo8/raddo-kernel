import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Svix signature verification ──

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

async function verifyWebhookSignature(
  body: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const msgId = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");

  if (!msgId || !timestamp || !signatures) return false;

  // Replay protection: reject if older than 5 minutes
  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  // Decode the secret (Resend prefixes with "whsec_")
  const secretBytes = Uint8Array.from(
    atob(secret.startsWith("whsec_") ? secret.slice(6) : secret),
    (c) => c.charCodeAt(0)
  );

  // Sign: HMAC-SHA256 of "msgId.timestamp.body"
  const toSign = new TextEncoder().encode(`${msgId}.${timestamp}.${body}`);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, toSign));
  const expectedSig = btoa(String.fromCharCode(...signatureBytes));

  // Resend may send multiple signatures separated by spaces
  const sigs = signatures.split(" ");
  for (const sig of sigs) {
    // Each signature is "v1,<base64>"
    const parts = sig.split(",");
    if (parts.length !== 2) continue;
    const sigValue = parts[1];
    const sigBytes = Uint8Array.from(atob(sigValue), (c) => c.charCodeAt(0));
    const expectedBytes = Uint8Array.from(atob(expectedSig), (c) => c.charCodeAt(0));
    if (timingSafeEqual(sigBytes, expectedBytes)) return true;
  }

  return false;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET not configured");
    return new Response("Server misconfiguration", { status: 500 });
  }

  const body = await req.text();

  // Verify signature
  const valid = await verifyWebhookSignature(body, req.headers, webhookSecret);
  if (!valid) {
    console.error("[resend-webhook] Invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(body);
  const eventType = payload.type; // e.g. "email.delivered", "email.bounced"
  const data = payload.data;

  if (!eventType || !data) {
    return new Response("Invalid payload", { status: 400 });
  }

  // Extract provider message ID (Resend uses "email_id" in data)
  const providerMessageId = data.email_id;
  if (!providerMessageId) {
    console.warn("[resend-webhook] No email_id in payload, skipping");
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Change 1: Extract recipient email early (robust) ──
  const toField = data.to;
  const recipientEmail = (
    Array.isArray(toField) ? toField[0] :
    typeof toField === "string" ? toField :
    null
  )?.toLowerCase() || null;

  // Normalize event type: "email.delivered" -> "delivered"
  const shortEvent = eventType.replace("email.", "");

  // ── Init service-role client ──
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Look up the action by provider_message_id ──
  const { data: action } = await supabase
    .from("actions")
    .select("id, workspace_id")
    .eq("provider", "resend")
    .eq("provider_message_id", providerMessageId)
    .limit(1)
    .maybeSingle();

  // ── Change 2: Orphan handling (skip insert, no suppression) ──
  if (!action) {
    console.log(JSON.stringify({
      event: "webhook_orphan",
      reason: "action_not_found",
      provider: "resend",
      provider_message_id: providerMessageId,
      event_type: shortEvent,
      recipient_email: recipientEmail,
      occurred_at: data.created_at || new Date().toISOString(),
      timestamp: new Date().toISOString(),
    }));
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "action_not_found" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Change 3: Idempotent upsert (replaces .insert()) ──
  const { error: upsertErr } = await supabase.from("message_events").upsert({
    workspace_id: action.workspace_id,
    action_id: action.id,
    provider: "resend",
    provider_message_id: providerMessageId,
    event_type: shortEvent,
    recipient_email: recipientEmail,
    payload,
    occurred_at: data.created_at || new Date().toISOString(),
  }, {
    onConflict: "provider,provider_message_id,event_type",
    ignoreDuplicates: true,
  });

  if (upsertErr) {
    console.error("[resend-webhook] Upsert error:", upsertErr.message);
  }

  // ── Change 4: Structured audit log ──
  console.log(JSON.stringify({
    event: "webhook_processed",
    provider: "resend",
    event_type: shortEvent,
    provider_message_id: providerMessageId,
    action_id: action.id,
    workspace_id: action.workspace_id,
    recipient_email: recipientEmail,
    timestamp: new Date().toISOString(),
  }));

  // ── Auto-suppress on hard bounce or complaint ──
  if (shortEvent === "bounced" || shortEvent === "complained") {
    // For bounces, only suppress hard bounces
    if (shortEvent === "bounced") {
      const bounceType = data.bounce?.type;
      if (bounceType && bounceType !== "hard") {
        console.log(`[resend-webhook] Soft bounce, not suppressing: ${providerMessageId}`);
        return new Response(JSON.stringify({ ok: true, event: shortEvent }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // ── Change 5: Reuse recipientEmail (DRY) ──
    if (recipientEmail && action.workspace_id) {
      const reason = shortEvent === "bounced" ? "bounce" : "complaint";
      const { error: suppressErr } = await supabase
        .from("suppression_list")
        .upsert(
          {
            workspace_id: action.workspace_id,
            email: recipientEmail,
            reason,
            source: "webhook",
          },
          { onConflict: "workspace_id,email" }
        );

      if (suppressErr) {
        console.error("[resend-webhook] Suppression insert error:", suppressErr.message);
      } else {
        console.log(JSON.stringify({
          event: "suppression_added",
          provider: "resend",
          reason,
          email: recipientEmail,
          workspace_id: action.workspace_id,
          source: "webhook",
          timestamp: new Date().toISOString(),
        }));
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, event: shortEvent }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
