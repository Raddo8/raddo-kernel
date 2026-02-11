

# Micro-Fix: Truthful Audit Logging in resend-webhook

## Problem

Lines 161-175 of `resend-webhook/index.ts` emit a `webhook_processed` structured log even when the database upsert fails. This violates audit truth: logs claim the event was persisted when it was not.

## Fix (no redesign, 1 file changed)

Replace the current upsert error handling + unconditional audit log (lines 161-175) with a gated pattern:

```typescript
if (upsertErr) {
  console.log(JSON.stringify({
    event: "webhook_upsert_failed",
    provider: "resend",
    event_type: shortEvent,
    provider_message_id: providerMessageId,
    action_id: action.id,
    workspace_id: action.workspace_id,
    error: upsertErr.message,
    timestamp: new Date().toISOString(),
  }));
  return new Response(
    JSON.stringify({ ok: false, error: "persistence_failed" }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}

// Only log webhook_processed after successful persistence
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

### Why return 500 on upsert failure

- Resend will retry the webhook (safe because our upsert is idempotent)
- Data loss is never silently accepted
- If the DB issue is transient, the retry will succeed
- The idempotency index guarantees no duplicates on retry

### What does NOT change

- Svix signature verification (untouched)
- Orphan handling (untouched)
- Upsert logic itself (untouched)
- Suppression upsert error handling (already correct -- only logs `suppression_added` on success)
- No migration needed

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/resend-webhook/index.ts` | Gate `webhook_processed` behind upsert success; return 500 + `webhook_upsert_failed` log on failure |

## After This Fix: Run Verification Checklist

Once deployed, we execute all 6 checks from the approved plan. No further build until all pass.

