# send-email Edge Function

A transactional email sender wrapping Resend, with a hard-coded sender allowlist and zero key exposure to the client.

## Files

- **Create** `supabase/functions/send-email/index.ts` — the function
- **Edit** `supabase/config.toml` — add `[functions.send-email]` with `verify_jwt = false` (consistent with `submit-consult`, `cob-chat`, etc.)

## Parameter signature (Zod-validated)

```ts
{
  fromAddress:     enum(ALLOWED_SENDERS),   // whitelist enforced
  fromDisplayName: string (1..120),
  to:              string(email) | string(email)[] (1..50),
  subject:         string (1..200),
  html:            string (min 1),
  text?:           string,
  replyTo?:        string(email),
}
```

Invalid payload → `400 { success: false, error: "invalid_payload", fields }`. No stack traces returned.

## Sender allowlist (single source of truth)

```ts
const SENDER_REGISTRY = {
  "cob@chiefofbusiness.ai":        "Your COB",
  "noreply@chiefofbusiness.ai":    "COB Pipeline",
  "deployment@chiefofbusiness.ai": "Your COB · Deployment",
  "jake@chiefofbusiness.ai":       "Jake Burkett",
  "phillip@chiefofbusiness.ai":    "Phillip Cates",
  "raddo@chiefofbusiness.ai":      "Raddo",
} as const;
```

Two layers of defense:
1. Schema: `z.enum(ALLOWED_SENDERS)` rejects unknown addresses with 400.
2. Runtime guard: explicit `if (!(fromAddress in SENDER_REGISTRY))` re-check before send.

`fromDisplayName` comes from the caller per spec (registry values are canonical defaults). Final `From` header: `` `${fromDisplayName} <${fromAddress}>` ``.

Middot (·) in "Your COB · Deployment" per brand convention. Confirmed.

## API key access

- `Deno.env.get("RESEND_API_KEY")` — already in Cloud Secrets.
- Missing → `500 { success: false, error: "email_service_unavailable" }`.
- Direct `fetch` to `https://api.resend.com/emails` with `Authorization: Bearer …`. No SDK, no client bundling risk.

## Response shapes

Success (200):
```json
{ "success": true, "messageId": "<resend-id>", "timestamp": "2026-05-27T…Z" }
```

Validation error (400):
```json
{ "success": false, "error": "invalid_payload", "fields": { … } }
```

Provider rejection (502):
```json
{ "success": false, "error": "Email provider rejected the request" }
```

Server misconfig (500):
```json
{ "success": false, "error": "email_service_unavailable" }
```

All failure branches `console.error` full detail (Resend status + sanitized body). Response body never contains the API key, raw provider payload, or stack trace.

## Domain

Sending from `@chiefofbusiness.ai` directly — verified custom domain in production use. No `resend.dev` fallback. If Resend rejects at runtime for verification reasons, `console.error` will surface it.

## Out of scope

No DB writes, no timeline events, no suppression-list integration — kept narrow per spec. CORS via `corsHeaders` from `npm:@supabase/supabase-js@2/cors`. `OPTIONS` → 204, non-POST → 405.