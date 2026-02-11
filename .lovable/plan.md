

# Steps B and C: Runtime Verification (Revised)

## Overview

Verify toggle behavior and approval gating using a dedicated TEST rule and a clean mock execution path. No production rules are mutated.

## Step B: Toggle Behavior

### Setup

Insert a new temporary TEST policy rule into workspace `f3ebf868`:

```text
workspace_id: f3ebf868-ba4b-48cc-a36c-079452d04c78
vertical_pack_key: "casey"
action_type: "log_event"         <-- routes to mock (not email+send_message)
action_channel: "system"         <-- routes to mock
enabled: true
requires_approval: false
sort_order: 9999                 <-- end of list, no interference
predicate: {"all":[{"field":"due_date","op":"older_than_minutes","value":1}]}
```

This rule matches item `65d6` (due Feb 9, ~2+ days overdue). Channel `system` + type `log_event` routes to mock execution in the core. The sort_order 9999 and unique predicate hash guarantee a fresh idempotency key with no collisions.

### Sequence

1. **Insert TEST rule** (enabled=true, predicate `older_than_minutes: 1`)
2. **Trigger** `process-policy-rules` via curl
3. **Verify** a new action appears with idempotency key `policy:{TEST_RULE_ID}:65d6...:*:*`
4. **Update TEST rule**: set `enabled=false`, change predicate to `older_than_minutes: 2` (new hash = no idempotency collision)
5. **Trigger** sweep again
6. **Verify** zero new actions created (disabled rule is filtered by `.eq("enabled", true)`)
7. **Update TEST rule**: set `enabled=true`, change predicate to `older_than_minutes: 3` (another new hash)
8. **Trigger** sweep again
9. **Verify** a new action appears
10. **Cleanup**: delete the TEST rule and its test actions

### Pass Criteria

- Enabled: action created
- Disabled: nothing created
- Re-enabled: action created again

## Step C: Approval Gating

### Setup

Update action `122247a2` to use mock execution path before approving:

```sql
UPDATE actions
SET channel = 'system', type = 'log_event'
WHERE id = '122247a2-9674-48d4-b674-1657314ea3a2';
```

This ensures the action routes to mock (500ms delay, always completes) instead of failing with `provider_not_configured`.

### Sequence

1. **Trigger** `process-scheduled-actions` -- confirm action `122247a2` stays `pending_approval` (scheduler queries `status IN ('scheduled','approved')` only)
2. **Update** action channel/type to system/log_event (service role)
3. **Approve** via Actions Queue UI (click check button, status becomes `approved`)
4. **Wait** 1-2 scheduler ticks or trigger manually
5. **Verify** action transitions: `approved` -> `running` -> `completed`
6. **Verify** timeline events: execution-start + completion for account `1b095ade`

### Pass Criteria

- `pending_approval` stays idle through scheduler tick
- After approval: clean `completed` status
- Timeline shows start and completion events

## Technical Notes

- The TEST rule uses `action_type: "log_event"` and `action_channel: "system"` which the execution core routes to mock (any combo other than `email` + `send_message`)
- Each predicate change (1, 2, 3 minutes) produces a different SHA-256 hash, giving unique idempotency keys without needing to delete rows
- The `process-policy-rules` function filters with `.eq("enabled", true)` on line 172, so disabled rules are never evaluated
- The `process-scheduled-actions` function filters with `.in("status", ["scheduled", "approved"])` on line 35, so `pending_approval` is excluded by construction
- All DB mutations use service-role client (direct SQL or edge function calls with CRON_SECRET for create mode)

## Implementation Steps

| Step | Action | Tool |
|------|--------|------|
| 1 | Insert TEST rule | DB insert (service role) |
| 2 | Trigger policy sweep | Curl `process-policy-rules` with CRON_SECRET |
| 3 | Query new actions | DB read |
| 4 | Disable TEST rule + change predicate | DB update |
| 5 | Trigger sweep | Curl |
| 6 | Verify no new actions | DB read |
| 7 | Re-enable TEST rule + change predicate | DB update |
| 8 | Trigger sweep | Curl |
| 9 | Verify new action | DB read |
| 10 | Trigger scheduler, confirm pending_approval stays | Curl `process-scheduled-actions` |
| 11 | Update action 122247a2 channel/type | DB update |
| 12 | Approve in UI | User clicks approve button |
| 13 | Trigger scheduler or wait | Curl or wait |
| 14 | Verify completed + timeline | DB read |
| 15 | Cleanup: delete TEST rule + test actions | DB delete |
