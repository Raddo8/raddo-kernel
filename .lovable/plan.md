

# Resend Webhook Normalization

## Overview

Harden the existing `resend-webhook` edge function with DB-level idempotency, queryable recipient tracking, orphan-safe handling, and structured audit logging. One migration + one function patch.

## Migration

A single SQL migration with two changes:

```sql
-- 1. Idempotency: one row per (provider, message, event_type)
-- provider_message_id is already NOT NULL, so no partial index needed
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_events_idempotent
  ON public.message_events (provider, provider_message_id, event_type);

-- 2. Queryable recipient email column
ALTER TABLE public.message_events
  ADD COLUMN IF NOT EXISTS recipient_email text;
```

No partial index needed because `provider_message_id` is enforced `NOT NULL` at the column level. The unique index is clean and deterministic.

## Edge Function Changes (`supabase/functions/resend-webhook/index.ts`)

### Change 1: Extract recipient email early (robust)

Right after parsing `providerMessageId`, extract recipient with defensive type handling:

```typescript
const toField = data.to;
const recipientEmail = (
  Array.isArray(toField) ? toField[0] :
  typeof toField === "string" ? toField :
  null
)?.toLowerCase() || null;
```

This handles Resend sending `to` as either an array or a string.

### Change 2: Orphan handling (skip insert, no suppression)

Replace the current unconditional insert block. If no matching action is found:
- Do NOT insert into `message_events` (avoids fake workspace_id rows)
- Do NOT run suppression logic (wrong workspace risk)
- Log a structured orphan warning with full reconciliation fields
- Return 200 (so Resend doesn't retry)

```typescript
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
```

### Change 3: Idempotent upsert (replaces `.insert()`)

Switch to `.upsert()` with conflict target matching the new unique index:

```typescript
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
```

`ignoreDuplicates: true` means retries silently no-op (no update, no error).

### Change 4: Structured audit log after successful upsert

```typescript
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
```

### Change 5: Reuse `recipientEmail` in suppression block

Replace `(data.to?.[0] || "").toLowerCase()` on the existing line 148 with the already-extracted `recipientEmail` variable. Add structured log after suppression upsert:

```typescript
console.log(JSON.stringify({
  event: "suppression_added",
  provider: "resend",
  reason,
  email: recipientEmail,
  workspace_id: action.workspace_id,
  source: "webhook",
  timestamp: new Date().toISOString(),
}));
```

### Change 6: Guard suppression behind action existence

The suppression block already only fires when `workspaceId` is truthy. Since we now return early when no action is found, `workspaceId` is always valid in the suppression path. No code change needed -- the early return handles it.

## What Does NOT Change

- Svix signature verification (lines 1-62, untouched)
- Secret configuration (RESEND_WEBHOOK_SECRET already set)
- `supabase/config.toml` (already has `verify_jwt = false`)
- Soft bounce filtering logic
- Suppression upsert conflict handling (`onConflict: "workspace_id,email"`)
- No UI changes needed

## Files Modified

| File | Change |
|------|--------|
| New migration | Unique index on `(provider, provider_message_id, event_type)` + `recipient_email` column |
| `supabase/functions/resend-webhook/index.ts` | Defensive recipient extraction, orphan skip with structured log, idempotent upsert, audit logging, DRY recipient variable |

## Verification Checklist

| # | Test | Method | Expected |
|---|------|--------|----------|
| 1 | Idempotency | Replay same webhook twice via Resend retry or manual curl | Exactly 1 row per `(provider_message_id, event_type)` in `message_events` |
| 2 | Recipient stored | Query `SELECT recipient_email FROM message_events` | Lowercase email present |
| 3 | Orphan webhook | Send webhook with unknown `email_id` | 200 returned, no `message_events` row, no suppression row, structured orphan log emitted |
| 4 | Hard bounce suppression | Trigger bounce webhook for known action | `suppression_list` row with `reason=bounce`, `source=webhook` |
| 5 | Orphan does NOT suppress | Bounce webhook with no matching action | No suppression row created |
| 6 | Structured logs | Check edge function logs after any webhook | JSON entries with `event`, `provider_message_id`, `action_id` |

