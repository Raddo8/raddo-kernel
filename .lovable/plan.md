

# Present Options: Final Build Directives

This is the build-ready specification with all mandatory fixes applied, including the critical non-retryable semantics for `present_options` after token issuance.

## Critical Addenda (Applied in This Version)

| # | Issue | Resolution |
|---|-------|------------|
| A | `present_options` retry after token issuance = unrecoverable | Pattern A: non-retryable after response row insert. Email failure = terminal, manual requeue required |
| B | `SITE_URL` fallback is brittle | Fail-fast: if `SITE_URL` missing, terminal failure for `present_options` |
| C | `unique(action_id)` conflict on retry | Handled: check for existing row before insert; if exists, fail terminal with "token already issued" |
| D | Verification checklist wording | Updated: "Edge endpoints are the only public surface and are token-gated" replaces "RLS prevents anon writes" |
| E | DB constraints | Added: `expires_at > created_at`, `length(selected_option) <= 64`, `jsonb_typeof(options) = 'array'` via validation trigger |

---

## Phase 1: Database Migration

```sql
CREATE TABLE public.action_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.actions(id),
  workspace_id uuid NOT NULL,
  token_hash text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_option text,
  submitted_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  item_ref text
);

CREATE UNIQUE INDEX idx_action_responses_token_hash ON public.action_responses(token_hash);
CREATE UNIQUE INDEX idx_action_responses_action ON public.action_responses(action_id);
CREATE INDEX idx_action_responses_pending_expires_at
  ON public.action_responses(expires_at) WHERE submitted_at IS NULL;

ALTER TABLE public.action_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view action_responses"
  ON public.action_responses FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

-- Options immutability trigger
CREATE OR REPLACE FUNCTION public.block_options_update()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.options IS DISTINCT FROM NEW.options THEN
    RAISE EXCEPTION 'options column is immutable after insert';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_action_responses_immutable_options
  BEFORE UPDATE ON public.action_responses
  FOR EACH ROW EXECUTE FUNCTION public.block_options_update();

-- Validation trigger (replaces CHECK constraints)
CREATE OR REPLACE FUNCTION public.validate_action_response()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.expires_at <= NEW.created_at THEN
    RAISE EXCEPTION 'expires_at must be after created_at';
  END IF;
  IF NEW.selected_option IS NOT NULL AND length(NEW.selected_option) > 64 THEN
    RAISE EXCEPTION 'selected_option exceeds 64 characters';
  END IF;
  IF jsonb_typeof(NEW.options) != 'array' THEN
    RAISE EXCEPTION 'options must be a JSON array';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_action_responses_validate
  BEFORE INSERT OR UPDATE ON public.action_responses
  FOR EACH ROW EXECUTE FUNCTION public.validate_action_response();
```

No INSERT/UPDATE/DELETE policies for anon or authenticated roles. All writes via service role in edge functions.

---

## Phase 2: Edge Function -- `get-response`

File: `supabase/functions/get-response/index.ts`

- CORS headers + OPTIONS handler
- `POST { token }`
- Service-role Supabase client
- Hash token with SHA-256
- Query `action_responses` by `token_hash`
- Return unified `{ valid: false, reason_code }` for all invalid cases:
  - `INVALID_TOKEN` (not found)
  - `TOKEN_EXPIRED` (expired)
  - `ALREADY_RESPONDED` (submitted_at not null)
- On valid: return `{ valid: true, options, item_ref }`
- Structured log: `{ event: "response_validated", token_hash_prefix: first8, valid, reason_code?, timestamp }`
- No PII in response or logs

---

## Phase 3: Edge Function -- `submit-response`

File: `supabase/functions/submit-response/index.ts`

- CORS headers + OPTIONS handler
- `POST { token, selected_option }`
- Service-role Supabase client
- Hash token with SHA-256
- Step 1: Select row by `token_hash` to get `options` array (safe because options are immutable)
- Step 2: Validate `selected_option` key exists in `options`
- Step 3: Atomic update returning data:
  ```
  .update({ selected_option, submitted_at: now() })
  .eq("token_hash", tokenHash)
  .is("submitted_at", null)
  .gt("expires_at", now())
  .select("action_id, workspace_id, options")
  .maybeSingle()
  ```
- If null result: return `{ valid: false, reason_code: "ALREADY_RESPONDED" }`
- Step 4: Load action -> item -> account_id using returned `action_id`
- Step 5: Write timeline (only after update success):
  - `direction: "inbound"`, `channel: "portal"`
  - `summary: "Recipient responded: [label]"`
  - `raw_json: { event_type: "recipient_response", selected_option: key, submitted_at, token_hash_prefix }`
- Step 6: Structured log: `{ event: "response_submitted", token_hash_prefix, selected_option: key, action_id, workspace_id, timestamp }`
- Return `{ valid: true }`

---

## Phase 4: Execute Action Core Changes

File: `supabase/functions/_shared/execute-action-core.ts`

### 4a. Add `response_url` to ALLOWED_VARIABLES (line 10)

### 4b. SITE_URL fail-fast (insert after claim, before template load ~line 237)

```typescript
if (action.type === "present_options") {
  const siteUrl = Deno.env.get("SITE_URL");
  if (!siteUrl) {
    await failAction(supabase, actionId, "SITE_URL required for present_options", []);
    return { success: false, error: "SITE_URL required for present_options" };
  }
  if (!action.template_id) {
    await failAction(supabase, actionId, "present_options requires a template", []);
    return { success: false, error: "present_options requires a template" };
  }
}
```

### 4c. Token generation + response row (after template render, before email send)

When `action.type === "present_options"`:

1. Check for existing response row by `action_id`. If exists, fail terminal: "present_options cannot be retried after token issuance"
2. Generate 32-byte token via `base64url(crypto.getRandomValues(new Uint8Array(32)))`
3. SHA-256 hash for storage
4. Insert response row with options, expiry, item_ref
5. On insert error: fail action terminal
6. Build `response_url = ${SITE_URL}/respond/${token}`
7. Add `response_url` to template context

### 4d. Channel routing (line 288-289)

Change condition to:
```typescript
if (action.channel === "email" &&
    (action.type === "send_message" || action.type === "present_options")) {
```

### 4e. Post-email-send failure handling for present_options

In `executeEmail`, after Resend API call fails and `action.type === "present_options"`:
- Fail action terminal with error: "Token issued but email send failed. Manual requeue required."
- Write timeline: "Action failed: email send failed after token issuance"
- Do NOT reset to scheduled or allow automatic retry

### 4f. Template context

Extend `TemplateContext` interface to support `response_url` as a top-level variable. Update `resolve()` to handle single-segment paths (no dot) for `response_url`.

---

## Phase 5: Public Response Page

File: `src/pages/RespondPage.tsx`

- Extract token from `useParams()`
- On mount: call `get-response` edge function
- Display states:
  - Loading spinner
  - Valid: "Reference: XXXXXX" + option buttons (no PII)
  - Expired: "This link has expired"
  - Already responded: "You have already responded"
  - Invalid: "This link is not valid"
- On option click: call `submit-response`, show confirmation, disable buttons
- Clean minimal UI, mobile-friendly

---

## Phase 6: Routing

File: `src/App.tsx`

Move `/respond/:token` route **outside** AuthGate:

```typescript
<BrowserRouter>
  <Routes>
    <Route path="/respond/:token" element={<RespondPage />} />
  </Routes>
  <AuthGate>
    <WorkspaceProvider>
      {/* existing routes */}
    </WorkspaceProvider>
  </AuthGate>
</BrowserRouter>
```

---

## Phase 7: UI Updates

### ItemDetail.tsx (line 110-123)

Update `handleQueueAction` to accept optional `payloadJson` parameter. Pass default options for `present_options`:

```typescript
const handleQueueAction = async (
  actionType: string, channel: string,
  payloadJson?: Record<string, unknown>
) => {
  // ... existing logic with payloadJson passed to queueAction
};
```

Button at line 191:
```typescript
onClick={() => handleQueueAction("present_options", "email", {
  options: [
    { key: "pay_full", label: "Pay in Full" },
    { key: "request_extension", label: "Request Extension" },
    { key: "payment_plan", label: "Propose Payment Plan" },
    { key: "dispute", label: "Dispute" },
  ]
})}
```

### ActionInspectorDrawer.tsx

For `present_options` actions, add response status section after message events:
- Query `action_responses` by `action_id`
- Display: "Awaiting response" / "Responded: [label]" / "Expired"

### render-template.ts (line 10)

Add `"response_url"` to `ALLOWED_VARIABLES`.

---

## Implementation Order

1. Migration (table + indexes + RLS + triggers)
2. `get-response` edge function
3. `submit-response` edge function
4. `execute-action-core` changes (fail-fast, token gen, channel routing, non-retryable semantics)
5. `RespondPage.tsx` + routing in `App.tsx`
6. `ItemDetail.tsx` payloadJson + `ActionInspectorDrawer.tsx` response status
7. Template variable additions (server + client)
8. Deploy + end-to-end verification

---

## Post-Build Verification Checklist

1. Token is 32 bytes base64url, not UUID
2. DB stores only `token_hash`; raw token never in DB, logs, or timeline
3. `get-response` returns options + item_ref only, no PII
4. `get-response` emits `response_validated` structured log
5. Double-submit returns `ALREADY_RESPONDED` (atomic, 0 rows)
6. Expired token returns `TOKEN_EXPIRED` on both endpoints
7. Timeline event: `direction: "inbound"`, `channel: "portal"`, structured `raw_json`
8. `present_options` without template fails fast
9. `present_options` without `SITE_URL` fails fast
10. Random token returns `INVALID_TOKEN`
11. Retry after token issuance fails terminal: "cannot be retried after token issuance"
12. Email send failure after token insert = terminal failure, no retry loop
13. Direct PostgREST access to `action_responses` as anon/auth is denied
14. Edge endpoints are the only public surface and are token-gated
15. Options column cannot be updated after insert (trigger enforced)
16. `selected_option` validated against stored options before update

---

## Files Changed Summary

| File | Change |
|---|---|
| New migration | `action_responses` table, 3 indexes, RLS, 2 triggers |
| `supabase/functions/get-response/index.ts` | New: public read-only token validation |
| `supabase/functions/submit-response/index.ts` | New: public atomic response submission |
| `supabase/functions/_shared/execute-action-core.ts` | Token gen, response row, fail-fast, channel routing, non-retryable semantics |
| `src/pages/RespondPage.tsx` | New: public response page |
| `src/App.tsx` | Add `/respond/:token` outside AuthGate |
| `src/pages/ItemDetail.tsx` | Pass options in payloadJson |
| `src/components/ActionInspectorDrawer.tsx` | Show response status |
| `src/lib/render-template.ts` | Add `response_url` to allowed variables |

