

# Verification Runbook: Two Controlled DB Writes

## Status Summary

| Test | Status | Blocker |
|---|---|---|
| Soft limit gate | Code verified correct | Need DB write to lower `monthly_action_limit` to 17 |
| Trigger 1:1 | Trigger wired correctly, no post-install completions exist | Need one action to complete post-trigger |

## Finding: Why 0 usage_events

The trigger `after_action_completed` was installed via migration `20260213235615` (Feb 13 23:56 UTC). All 11 completed actions finished before that (latest: Feb 12 04:06 UTC). The trigger has never had an opportunity to fire. This is expected, not a bug.

## Test 1: Soft Limit (Destructive, Reversible)

Requires running these statements via Cloud View > Run SQL (or equivalent admin access):

**Step A -- Lower limit to current usage (17):**
```text
UPDATE public.workspace_billing
SET monthly_action_limit = 17, updated_at = now()
WHERE workspace_id = 'f3ebf868-ba4b-48cc-a36c-079452d04c78';
```

**Step B -- Call create via edge function** (I will do this via curl):
```text
POST /functions/v1/execute-action-server
{
  "mode": "create",
  "params": {
    "itemId": "65d6cc88-f665-428c-a929-6ef87f005274",
    "type": "test_soft_limit",
    "channel": "system",
    "idempotencyKey": "soft-limit-proof-1",
    "source": "system"
  }
}
```

**Expected response:**
```text
{ "success": false, "reason": "usage_limit_reached", "limit": 17, "used": 17 }
```

**Step C -- Verify no 18th action was inserted:**
```text
SELECT count(*) FROM actions
WHERE workspace_id = 'f3ebf868-ba4b-48cc-a36c-079452d04c78'
  AND created_at >= date_trunc('month', now())
  AND status <> 'canceled';
-- Expected: still 17
```

**Step D -- Restore limit:**
```text
UPDATE public.workspace_billing
SET monthly_action_limit = 100, updated_at = now()
WHERE workspace_id = 'f3ebf868-ba4b-48cc-a36c-079452d04c78';
```

## Test 2: Trigger 1:1 (End-to-End)

**Step A -- Create a test action** (I will do this via edge function curl in create mode).

**Step B -- Execute the action** (I will call execute mode on the returned actionId). It will likely fail with "provider not configured" but that marks it `failed`, not `completed`. To get a `completed` status we need either:
- An email channel action with Resend configured (which it is -- RESEND_API_KEY secret exists), OR
- A manual status update via SQL: `UPDATE actions SET status = 'completed' WHERE id = '<action_id>';`

**Step C -- Verify exactly 1 usage_event:**
```text
SELECT count(*) FROM usage_events WHERE action_id = '<action_id>';
-- Expected: 1
```

**Step D -- Update the action again (non-status field) and re-check:**
```text
UPDATE actions SET result_json = '{"test": true}' WHERE id = '<action_id>';
SELECT count(*) FROM usage_events WHERE action_id = '<action_id>';
-- Expected: still 1
```

## Implementation

No code changes needed. Both tests require DB writes that must be executed via Cloud View > Run SQL. Once the `monthly_action_limit` UPDATE is done, I can immediately call the edge function to prove the gate. For the trigger test, a manual `UPDATE actions SET status = 'completed'` on a test action will fire the trigger.

## Files Changed

None -- this is a verification-only runbook.

