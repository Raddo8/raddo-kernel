

# Phase 0: E2E Email Proof -- Test Data Seed

## Changes applied from your review

| # | Your change | Resolution |
|---|-------------|------------|
| 1 | Status = `approved`, not `scheduled` | Applied. Manual test action will be `approved` with `scheduled_for = null`. |
| 2 | Explicit connector linkage | No `connector_account_id` or similar column exists on `actions`. The executor resolves the connector via implicit `workspace_id` lookup (line 362-365 of `execute-action-core.ts`). This is the only path -- no field to force. Confirmed safe. |
| 3 | Template fields must match renderer | Renderer loads `subject` and `body` (line 248). Templates table has exactly `subject` and `body`. Match confirmed. |
| 4 | Drop `item.amount` from body | Applied. Body simplified to use only guaranteed fields. (Note: `amount = 1000.00` on this item, so it would work, but removing per minimum-risk principle.) |
| 5 | Extra acceptance signals | Applied. Will verify `executed_at` is populated (this is the completion timestamp) and `result_json` contains no `error_code`. |

## What will be inserted (2 rows)

### Row 1: Test template

```sql
INSERT INTO templates (workspace_id, template_type, channel, tone, subject, body)
VALUES (
  'f3ebf868-ba4b-48cc-a36c-079452d04c78',
  'e2e_test',
  'email',
  'professional',
  'E2E Test: {{account.name}} - {{item.title}}',
  'Hello {{contact.name}}, this is an end-to-end delivery test from Raddo Engine. Item: {{item.title}}.'
)
RETURNING id;
```

### Row 2: Manual-execute action (status = approved)

```sql
INSERT INTO actions (item_id, type, channel, status, contact_id, template_id, source, scheduled_for)
VALUES (
  '65d6cc88-f665-428c-a929-6ef87f005274',
  'send_message',
  'email',
  'approved',
  '57be3fd2-e5c1-4154-afd5-d8648a802651',
  '<template_id from row 1>',
  'system',
  NULL
);
```

`workspace_id` is auto-set by the `set_action_workspace_id` trigger from `item.workspace_id`.

## After insert: Manual execute via UI

Navigate to Actions Queue, find the action, click Play.

## Acceptance criteria (Step 1)

- `status` = `completed`
- `executed_at` is populated (not null)
- `result_json.provider` = `"resend"`
- `result_json.provider_message_id` present
- `result_json.recipient_email` = `jacobdburkett@gmail.com`
- `result_json.render_errors` = `[]`
- No `error_code` in `result_json`
- Timeline: execution-start event (system) + outbound email event
- Email arrives at `jacobdburkett@gmail.com`

## Step 2: Scheduler test (after Step 1 passes)

Insert a second action identical to Row 2 but with:

- `status`: `scheduled`
- `scheduled_for`: `now() + interval '3 minutes'`

Acceptance: scheduler claims it, transitions to `completed`, `executed_at` populated, email arrives.

## No code changes required

All code is deployed. This is purely 2 DB inserts + UI verification.

