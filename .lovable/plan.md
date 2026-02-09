

# Raddo Kernel Hardening -- Updated Plan

All 10 constraints accepted. This plan is sequenced to gate each step on the previous one passing.

---

## Step 1: Run the 3 Manual Tests on Current System

No code changes. I will open the preview in a browser, sign up, let Casey seed, and run:

- **Test A -- State change queues actions:** Create an account, contact, and invoice item. Change item state to "new" (which triggers the Casey playbook). Verify: (1) timeline system event created, (2) actions queued with correct `delay_minutes` and `requires_approval` flags.
- **Test B -- Approval gate:** Change item state to "past_due" which queues a step with `requires_approval: true`. Verify action appears as `pending_approval` in the Actions Queue. Approve it and confirm status changes.
- **Test C -- Execution writes audit:** Execute a queued `send_message` action. Verify status transitions (scheduled to running to completed), outbound timeline event exists, and `result_json` is populated.

If any test fails, I fix the specific broken path before proceeding. No Step 2 work begins until all three pass.

---

## Step 2: Execution Boundary + Queue Boundary

### 2a: New file `src/lib/queue-action.ts`

Single entry point for all action creation. UI components never insert into the `actions` table directly.

Responsibilities:
- Accept `{ itemId, type, channel, scheduledFor, payloadJson, requiresApproval, idempotencyKey, actorUserId, source }`
- Compute deterministic `idempotency_key` if not provided: `sha256(item_id + playbook_step_id + trigger_state + scheduled_for)`
- Check rate limit: count actions for same `item_id + channel` in last hour, compare against threshold from the item's policy rules (looked up via `items.policy_id` -> `policy_rules` where `rule_type = 'rate_limit'`). Reject if exceeded.
- Check idempotency: if action with same `idempotency_key` in same workspace already exists, skip silently.
- Insert into `actions` table with status `queued` (or `pending_approval` if flagged).
- Return the created action or skip result.

### 2b: New file `src/lib/execute-action.ts`

Single entry point for all outbound effects. No direct email/SMS calls from UI. Ever.

Responsibilities:
- Accept `{ actionId, actorUserId, source }` where source is `"ui"` or `"system"`.
- Load action with joins: item, account, contacts (primary), template.
- **Hard deny** if status is `completed`, `failed`, or `canceled`.
- **Hard deny** if status is not in executable set: `["scheduled", "approved"]`.
- **Conditional update for concurrency:** `UPDATE actions SET status = 'running', actor_user_id = $1, source = $2 WHERE id = $3 AND status IN ('scheduled', 'approved') RETURNING id`. If no rows returned, another process claimed it -- abort.
- Render template using allow-listed variables only (see Step 2c).
- Call execution provider (mock for now, edge function in Step 4).
- On success: set `completed`, write `executed_at`, write `result_json`, create outbound timeline event.
- On failure: set `failed`, write `result_json` with error details.

### 2c: Template rendering with allow-list

New file `src/lib/render-template.ts`.

- Allow-listed variables: `item.title`, `item.amount`, `item.due_date`, `item.id`, `account.name`, `contact.name`, `contact.email`, `contact.phone`.
- Any `{{variable}}` not in the allow-list is replaced with `[unknown: variable]` and the error is recorded.
- Returns `{ subject: string, body: string, renderErrors: string[] }`.
- `renderErrors` are saved to `result_json` on the action.

### 2d: Refactor existing files

- **`ItemDetail.tsx`**: Remove all direct `supabase.from("actions").insert(...)` calls. Import and call `queueAction()` from `src/lib/queue-action.ts`. Remove inline `evaluatePlaybook` -- move to `src/lib/evaluate-playbook.ts`.
- **`ActionsQueue.tsx`**: Remove inline `executeAction` and `approveAction`. Import `executeAction` from `src/lib/execute-action.ts`. Approve action sets status to `approved` (new status).
- **New file `src/lib/evaluate-playbook.ts`**: Extracted from `ItemDetail.tsx`. On state change, looks up matching playbook steps and calls `queueAction()` for each, computing deterministic idempotency keys.

---

## Step 3: Database Migration -- Statuses, Idempotency, Safety

### 3a: Expand `action_status` enum

Add three new values: `queued`, `approved`, `canceled`.

Full status set: `queued`, `pending_approval`, `approved`, `scheduled`, `running`, `completed`, `failed`, `canceled`.

Execution rules enforced in application code:
- `queued` -> `scheduled` (system auto-promotes after delay elapses, or immediate if delay=0)
- `pending_approval` -> `approved` (human action) or `canceled`
- `approved` -> `running` (execution boundary picks it up)
- `scheduled` -> `running` (execution boundary picks it up)
- `running` -> `completed` or `failed`
- Any non-terminal status -> `canceled`

### 3b: New columns on `actions` table

- `idempotency_key` (text, nullable)
- `actor_user_id` (uuid, nullable)
- `source` (text, default `'system'`)
- `playbook_step_id` (uuid, nullable, FK to playbook_steps)
- `trigger_state` (text, nullable) -- the state that caused this action to be queued

### 3c: Unique constraint

`UNIQUE(workspace_id, idempotency_key)` -- but `actions` currently lacks `workspace_id`. Two options:

Since actions are always tied to items which have `workspace_id`, I will add a computed lookup. The constraint will be:
- Add `workspace_id` column to `actions` (populated from `items.workspace_id` via trigger on insert).
- Then: `CREATE UNIQUE INDEX actions_idempotency_uq ON actions (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;`

### 3d: Concurrency guard

No unique index on `(id)`. Instead, the `execute-action.ts` uses a conditional update:
```
UPDATE actions
SET status = 'running', actor_user_id = $1, source = $2
WHERE id = $3 AND status IN ('scheduled', 'approved')
```
Via Supabase client: `.update({...}).eq("id", actionId).in("status", ["scheduled", "approved"])` and check that data is returned.

---

## Step 4: Edge Function -- `execute-action`

### POST body: `{ actionId }` only

No `workspaceId` from client.

### Auth flow:
1. Extract JWT from `Authorization` header.
2. Validate with `getClaims()`.
3. Load the action by ID, join to item to get `workspace_id`.
4. Verify `is_workspace_member(userId, workspaceId)` by querying `workspace_members`.
5. If not a member, return 403.

### Execution flow:
1. Hard deny if action status is not `scheduled` or `approved`.
2. Conditional update to `running` (concurrency guard).
3. Load template, render with allow-list.
4. If channel is `email`: call Resend API.
5. Timeline event stores: `provider_message_id` (from Resend response), rendered `summary`. Full `body` storage controlled by `workspaces.settings.store_timeline_body` (default `false`).
6. On Resend success: mark `completed`, write `result_json` with `{ provider: "resend", message_id: "...", rendered_subject: "..." }`.
7. On Resend failure: mark `failed`, write `result_json` with `{ provider: "resend", error: "...", status_code: ... }`.
8. On render error: still attempt send but include `render_errors` in `result_json`.

### Resend test mode:
- Start with Resend's free tier (no domain verification needed for sending to the account owner's email).
- Edge function sends only to the authenticated user's email address initially (internal test mode).
- A `test_mode` flag in workspace settings controls this: when `true`, all outbound emails go to the logged-in user's email instead of the contact's email.
- Domain verification is a later step when ready for real outbound.

### Required secret:
- `RESEND_API_KEY` -- I will prompt you to provide this when we reach implementation.

---

## Step 5: Vertical Pack Label Swapping

### New file: `src/lib/vertical-pack-context.tsx`

React context that loads the active `vertical_packs` config for the workspace. Provides:
- `itemTypeLabel` (e.g., "Invoice" vs "Deal")
- `fieldLabels` (e.g., `{ amount: "Invoice Amount", title: "Invoice Number" }`)
- `stateDisplayNames` (map of state name to display label)

### Files that consume context instead of hardcoding:
- `ItemsList.tsx` -- column headers, dialog labels
- `ItemDetail.tsx` -- field labels, section headers
- `AccountDetail.tsx` -- item type references
- `AppSidebar.tsx` -- "Items" nav label becomes dynamic (e.g., "Invoices")

No kernel table changes. Swapping the pack config JSON changes all labels instantly.

---

## Execution Sequence

| Step | Gate | Deliverable |
|------|------|-------------|
| 1 | -- | Manual test results (pass/fail with fixes) |
| 2 | Step 1 passes | `queue-action.ts`, `execute-action.ts`, `render-template.ts`, `evaluate-playbook.ts` |
| 3 | Step 2 compiles | DB migration: enum expansion, new columns, unique index, workspace_id on actions |
| 4 | Step 3 migrated + RESEND_API_KEY provided | Edge function `execute-action`, test mode emails |
| 5 | Step 4 verified | `vertical-pack-context.tsx`, label swapping across UI |

Each step is gated. I will not proceed to the next until the previous is verified.

---

## Technical Detail: Rate Limiting

Rate limits checked at two points:

1. **Queue time** (`queue-action.ts`): Before inserting a new action, count existing non-canceled actions for the same `item_id + channel` created in the last hour. Compare against threshold from `policy_rules` where `rule_type = 'rate_limit'` and `rule_json` contains `{ channel, max_per_hour }`. Default threshold if no policy rule: 10 per hour.

2. **Execution time** (`execute-action.ts` / edge function): Before sending, count completed outbound actions for the same `item_id + channel` in the last hour. Same threshold lookup. This catches cases where actions were queued before the rate limit was configured.

---

## Technical Detail: Action Status Lifecycle

```text
                          +----------+
                          | canceled |
                          +----------+
                               ^
                               | (any non-terminal)
                               |
+--------+    +------------------+    +----------+    +---------+    +-----------+
| queued | -> | pending_approval | -> | approved | -> | running | -> | completed |
+--------+    +------------------+    +----------+    +---------+    +-----------+
    |                                                      |              |
    v                                                      v              |
+----------+                                          +---------+         |
| scheduled | ------->  running  ------------------>  | failed  |         |
+----------+                                          +---------+         |
```

- `queued`: initial state when playbook creates action with delay > 0
- `scheduled`: ready for execution (delay elapsed or delay was 0 and no approval needed)
- `pending_approval`: requires human approval before execution
- `approved`: human approved, ready for execution
- `running`: execution in progress (claimed via conditional update)
- `completed`: terminal success
- `failed`: terminal failure
- `canceled`: terminal, human canceled

