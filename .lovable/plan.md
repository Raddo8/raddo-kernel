

# Step 2: Execution Boundary + Queue Boundary

All 4 constraints applied. This creates 6 new files and refactors 2 existing pages to remove all direct action writes.

---

## New Files

### 1. `src/lib/render-template.ts`
Template engine with allow-listed variables only: `item.title`, `item.amount`, `item.due_date`, `item.id`, `account.name`, `contact.name`, `contact.email`, `contact.phone`. Unknown variables become `[unknown: variable]` and are recorded. `renderErrors` are always returned and always persisted to `result_json` (constraint 4).

### 2. `src/lib/timeline-events.ts`
Centralized timeline write helper (constraint 2). Single function `writeTimelineEvent()` that accepts `{ accountId, itemId?, contactId?, direction, channel, summary, body?, rawJson? }`. UI may call this helper but must never write to `timeline_events` directly.

### 3. `src/lib/queue-actions.ts` (constraint 1: correct filename)
Single entry point for all action creation. Responsibilities:
- Rate limit check: count non-canceled actions for same `item_id + channel` in last hour vs threshold from `policy_rules` (rule_type='rate_limit'). Default: 10/hour.
- Application-level idempotency check (DB constraint added in Step 3): checks for existing action with same item_id + type + channel + scheduled_for window.
- Insert with status `pending_approval` if flagged, else `scheduled`.
- Stores `_idempotency_key`, `_actor_user_id`, `_source` in `payload_json` until Step 3 adds dedicated columns.

### 4. `src/lib/execute-action.ts`
Single entry point for all outbound effects. Key behaviors:
- Hard deny if status is `completed`, `failed`, or `canceled`.
- Executable statuses: `["scheduled"]` with explicit comment (constraint 3): "NOTE: 'scheduled' temporarily serves double duty as both auto-scheduled and human-approved until Step 3 adds the 'approved' enum value."
- Conditional update for concurrency: `update({status: 'running'}).eq('id', actionId).in('status', ['scheduled'])`. If no rows returned, abort.
- Loads template, renders with allow-list, always persists `render_errors` in `result_json` even on success (constraint 4).
- Writes outbound timeline event via `writeTimelineEvent()` helper (constraint 2).
- Mock execution for now (500ms delay). Real Resend edge function in Step 4.

### 5. `src/lib/evaluate-playbook.ts`
Extracted from `ItemDetail.tsx`. On state change:
- Queries playbooks matching workspace_id + item_type.
- Queries steps matching trigger_state.
- Computes deterministic idempotency key: `${itemId}:${step.id}:${stateName}:${scheduledFor}`.
- Calls `queueAction()` for each step.

---

## Refactored Files

### 6. `src/pages/ItemDetail.tsx`
**Removed:**
- Lines 73-107: entire `evaluatePlaybook` function (moved to `src/lib/evaluate-playbook.ts`)
- Lines 109-121: entire `queueAction` function (replaced by import from `src/lib/queue-actions.ts`)
- Lines 58-64: direct `timeline_events` insert (replaced by `writeTimelineEvent()` helper)

**Added:**
- Imports: `evaluatePlaybook`, `queueAction`, `writeTimelineEvent`
- `changeState` calls `writeTimelineEvent()` then `evaluatePlaybook()` with `{ itemId, stateId, stateName, itemType, workspaceId, actorUserId }`
- Action buttons call `queueAction()` with `{ itemId, type, channel, source: "ui", actorUserId }`
- Zero direct `supabase.from("actions").insert(...)` calls remain
- Zero direct `supabase.from("timeline_events").insert(...)` calls remain

### 7. `src/pages/ActionsQueue.tsx`
**Removed:**
- Lines 39-67: entire `executeAction` function (inline DB writes, mock execution, timeline insert)
- Lines 69-73: `approveAction` function (direct status update)

**Added:**
- Import `executeAction` from `@/lib/execute-action`
- `handleApprove`: updates status to `scheduled` with explicit comment: "// TEMPORARY: sets to 'scheduled' which currently means 'approved'. Step 3 will add the 'approved' enum value."
- `handleExecute`: calls `executeAction({ actionId, actorUserId, source: "ui" })`
- Zero direct action status transitions or timeline writes remain

---

## Verification Checklist

After implementation:
1. `src/lib/execute-action.ts` -- exists, uses conditional update guard, enforces status rules
2. `src/lib/queue-actions.ts` -- exists, checks rate limits and idempotency
3. `src/lib/render-template.ts` -- exists, uses allow-list, returns renderErrors
4. `src/lib/evaluate-playbook.ts` -- exists, computes deterministic idempotency keys
5. `src/lib/timeline-events.ts` -- exists, centralized timeline writes
6. `ItemDetail.tsx` -- zero `supabase.from("actions")` writes, zero `supabase.from("timeline_events")` writes
7. `ActionsQueue.tsx` -- zero inline execution logic, zero timeline writes
8. All `renderErrors` persisted to `result_json` on both success and failure paths

Step 3 will NOT begin until these deliverables are audited.

