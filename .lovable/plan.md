## Refactor `send-chat-transcript` to consolidate via `send-email`

### Single file changed
`supabase/functions/send-chat-transcript/index.ts` — full rewrite. No other files touched. `send-email` is frozen. No config.toml, client, or schema changes.

### What changes

1. **Remove direct Resend integration**
   - Delete `RESEND_API_KEY` read, direct `fetch("https://api.resend.com/emails", …)`, `FROM_ADDRESS = "SAMPLE COB <onboarding@resend.dev>"`, and `INTERNAL_RECIPIENTS = ["cob.brahan@gmail.com"]`.

2. **Add `sendViaSendEmail()` helper**
   - POSTs to `${SUPABASE_URL}/functions/v1/send-email` with `Authorization: Bearer ${SUPABASE_ANON_KEY}` + `apikey` header.
   - Body matches `send-email` Zod schema: `fromAddress`, `fromDisplayName`, `to`, `subject`, `html`, optional `replyTo`.
   - Returns `{ ok, messageId?, error? }`.

3. **Dual-send orchestration (sequential, B-critical)**
   - **EMAIL A — visitor** (only if `lead.email` present + passes regex):
     - `fromAddress`: `cob@chiefofbusiness.ai`
     - `fromDisplayName`: `Your COB`
     - `to`: `lead.email`
     - `subject`: `A note from your COB`
     - `replyTo`: omitted (replies route to `cob@chiefofbusiness.ai` naturally)
     - On non-2xx: log, set `visitorEmailStatus = "send_failed"`, continue to EMAIL B.
     - On skip: `"visitor_email_unavailable"` or `"visitor_email_invalid"`.
     - On success: `"sent"` + capture `visitorMessageId`.
   - **EMAIL B — pipeline** (always):
     - `fromAddress`: `noreply@chiefofbusiness.ai`
     - `fromDisplayName`: `COB Pipeline`
     - `to`: `pipeline@chiefofbusiness.ai`
     - `subject`: `[Pipeline] {leadName}{company} · {turns} turn(s) · {voice}`
     - `replyTo`: `lead.email` if present, else omitted.
     - Internal metadata block includes `visitorEmailStatus` + `visitorMessageId`.
     - On failure: return `502`. On success: write dedupe marker, return `200 { ok, visitorEmailStatus, visitorMessageId, pipelineMessageId }`.

4. **Email A template (visitor, brand-correct)**
   - Cream `#FAF8F4` bg, paper-edge border, Fraunces display + Inter body via Google Fonts.
   - Greeting: `Hi {lead.name},` or `Hi there,` when name missing.
   - Body: one short paragraph acknowledging the conversation, then transcript with alternating visitor (ink `#0C447C`) / COB (brass-deep `#854F0B`) blocks.
   - Closing CTA paragraph (locked copy):
     > "If you'd like to take this further, you can reply directly to this email. We read every reply."
   - **No** "book a consult" link. **No** emojis/exclamations. Measured register.
   - Footer: RADDO wordmark + small "Sent because you spoke with COB at chiefofbusiness.ai."

5. **Email B template (pipeline, functional)**
   - Existing internal HTML (lead block + transcript + metadata footer) preserved but extended with `visitorEmailStatus` and `visitorMessageId` rows in the metadata table.

### Edge handling
- Idempotency dedupe (`rate_limits` marker) unchanged — set only after EMAIL B succeeds.
- Empty-transcript skip unchanged.
- Rate limit (20/10min/IP) unchanged.
- All existing input sanitation (`esc()`, length caps) preserved.

### Post-build verification (will run)
1. Deploy `send-chat-transcript`.
2. POST a sample payload with `lead.email = "cob.brahan@gmail.com"` so both EMAIL A (visitor) and EMAIL B (pipeline → ImprovMX → same inbox) land in one inbox for visual diff.
3. `rg "onboarding@resend.dev|INTERNAL_RECIPIENTS" supabase/` → expect zero hits.
4. Report: files changed, line delta, test response JSON, grep confirmation.

### Out of scope (flagged, not built)
- Scheduling-tool CTA (deferred to JAKE's later decision).
- Rate-limiting on `send-email` itself (separate hardening pass).
- Migrating dedupe marker off `rate_limits` to a dedicated table.