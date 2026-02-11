

# Fix Provider Persistence + Deterministic Recipient for Phase 1 Verification

## Problem

1. `provider` and `provider_message_id` columns on `actions` stay NULL after successful email send (line 459-468 fires without error handling)
2. Test emails go to seed contact instead of real inbox because `contact_id` is NULL on the action

## Changes

### 1. Harden success-path update in `execute-action-core.ts` (lines 449-480)

Replace the fire-and-forget update with a verified pattern:

- Use `.select("id, status, provider, provider_message_id").single()` to confirm persistence
- If provider columns are NULL after primary update, run a dedicated fallback update for just those two columns
- If fallback also fails: mark `result_json` with `persistence_warning: "provider_columns_failed"` and write a warning timeline event so the issue is visible in the UI (action stays `completed` since the email was actually sent)
- Log all errors explicitly with `console.error`

### 2. Database: Set account primary contact

```sql
UPDATE accounts
SET primary_contact_id = '57be3fd2-e5c1-4154-afd5-d8648a802651'
WHERE id = 'e270a810-3f4f-4224-914b-4828318dc90a'
  AND primary_contact_id IS NULL;
```

### 3. Deploy and create test action with explicit `contact_id`

- Deploy the updated edge function
- Create a new `send_message`/`email` action with `contact_id = '57be3fd2-e5c1-4154-afd5-d8648a802651'` (Steve Miller / jacobdburkett@gmail.com) to eliminate recipient ambiguity
- Execute the action

### 4. Verify

Run the two verification queries:

```sql
SELECT id, status, provider, provider_message_id, executed_at
FROM actions WHERE status = 'completed' ORDER BY executed_at DESC LIMIT 5;

SELECT created_at, event_type, provider_message_id, action_id
FROM message_events ORDER BY created_at DESC LIMIT 10;
```

**Pass criteria:**
- `provider = 'resend'` and `provider_message_id` not NULL
- Email arrives at jacobdburkett@gmail.com
- `message_events` has a `delivered` row with matching `provider_message_id` and non-null `action_id`

---

## Technical Detail: Updated success path in `executeEmail()`

```typescript
// ── Success ──
const resultJson = {
  provider: "resend",
  provider_message_id: resendResult.id,
  rendered_subject: renderedSubject,
  render_errors: renderErrors,
  recipient_email: contact.email,
  recipient_contact_id: contact.id,
};

const { data: updated, error: updateErr } = await supabase
  .from("actions")
  .update({
    status: "completed" as any,
    executed_at: new Date().toISOString(),
    result_json: resultJson,
    provider: "resend",
    provider_message_id: resendResult.id,
  } as any)
  .eq("id", actionId)
  .select("id, status, provider, provider_message_id")
  .single();

if (updateErr) {
  console.error("[executeEmail] Success update failed:", JSON.stringify(updateErr));
}

// Verify provider columns actually persisted
if (updated && (!updated.provider || !updated.provider_message_id)) {
  console.error("[executeEmail] Provider fields missing after update. Attempting fallback.", {
    actionId, provider_message_id: resendResult.id,
  });

  const { error: fallbackErr } = await supabase
    .from("actions")
    .update({
      provider: "resend",
      provider_message_id: resendResult.id,
    } as any)
    .eq("id", actionId);

  if (fallbackErr) {
    console.error("[executeEmail] Fallback also failed:", JSON.stringify(fallbackErr));

    // Write persistence warning into result_json + timeline
    await supabase.from("actions").update({
      result_json: { ...resultJson, persistence_warning: "provider_columns_failed" },
    } as any).eq("id", actionId);

    if (accountId) {
      await writeTimeline(supabase, {
        accountId,
        itemId: action.item_id,
        direction: "system",
        channel: "email",
        summary: `Warning: email sent but provider columns failed to persist (${action.type})`,
      });
    }
  }
}

// Timeline: email sent
await writeTimeline(supabase, {
  accountId,
  itemId: action.item_id,
  contactId: contact.id,
  direction: "outbound",
  channel: "email",
  summary: `Email sent: ${renderedSubject || action.type}`,
  body: renderedBody?.substring(0, 500) || null,
});

return { success: true, provider_message_id: resendResult.id };
```

## Files Modified
- `supabase/functions/_shared/execute-action-core.ts`

## Database Changes
- `accounts`: set `primary_contact_id` for test account
- New test action row with explicit `contact_id`

