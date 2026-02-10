

## Build Contacts CRUD, Connectors CRUD, Dashboard, and Unified Action Creation with Queue-Stage Metrics

### Architecture: Unified Action Creation via `execute-action-server`

All action creation is consolidated into `execute-action-server` using an explicit `mode` field. This eliminates client-side direct inserts and guarantees every queued action gets a timeline event.

Request body format:
```text
Create mode:  { mode: "create", params: { itemId, type, channel, ... } }
Execute mode: { mode: "execute", actionId: "...", manualRetry: false }
Legacy:       { actionId: "..." }  (treated as execute)
```

#### Auth decision tree (exact)

```text
A. X-CRON-SECRET valid AND mode is "create"  -->  allow as scheduler (service role client)
B. X-CRON-SECRET valid AND mode is "execute"  -->  REJECT 403 ("cron secret not allowed for execute")
C. No cron secret  -->  require valid JWT, verify via getUser()
   - For "create": check is_workspace_member(userId, item.workspace_id)
   - For "execute": existing workspace membership check (unchanged)
D. No cron secret AND no valid JWT  -->  401
```

Cron secret is strictly scoped to create mode only. It cannot execute arbitrary actions.

#### workspaceId handling

Always derived server-side from the item row. Any client-supplied workspaceId is ignored.

#### Response shape for create mode (all success: true)

```text
Success:      { success: true, actionId: "...", skipped: false, rateLimited: false }
Duplicate:    { success: true, skipped: true, reason: "duplicate" }
Rate limited: { success: true, skipped: true, reason: "rate_limited" }
Validation:   { success: false, error: "itemId is required" }  (only for bad input)
```

Rate limit and idempotency duplicate are both `success: true, skipped: true` with a `reason` field. Only malformed requests return `success: false`.

Idempotency: DB-enforced via unique constraint. Postgres error 23505 returns `{ success: true, skipped: true, reason: "duplicate" }`.

---

### 1. Shared Timeline Writer for Edge Functions

**New file: `supabase/functions/_shared/write-timeline.ts`**

Extract the `writeTimeline` helper from `execute-action-server` (lines 496-523) into a shared module. Identical allow-list enforcement (`VALID_DIRECTIONS`, `VALID_CHANNELS`). Both edge functions import it.

### 2. Extend `execute-action-server` with Create Mode

**Modify: `supabase/functions/execute-action-server/index.ts`**

Update `supabase/config.toml` to add `[functions.execute-action-server]` with `verify_jwt = false` (auth handled internally via the decision tree above).

Changes to the main handler:

1. Parse body, determine mode from `mode` field (default "execute" if `actionId` present)
2. Auth enforcement per decision tree: if cron secret used with mode "execute", return 403
3. If mode is "create":
   a. Validate required params: `itemId`, `type`, `channel`
   b. Fetch item row once to get `account_id` and `workspace_id`
   c. If UI mode: verify `is_workspace_member(userId, item.workspace_id)`
   d. Rate-limit check (moved from `queue-actions.ts`, same logic)
   e. Insert action row with all normalized columns
   f. On unique violation (23505): return `{ success: true, skipped: true, reason: "duplicate" }`
   g. On rate limit exceeded: return `{ success: true, skipped: true, reason: "rate_limited" }`
   h. On success: write queue-stage timeline event via shared `writeTimeline`:
      - direction: "system", channel: "system"
      - summary: `Action queued: {type} via {channel}`
   i. Return `{ success: true, actionId, skipped: false, rateLimited: false }`
4. If mode is "execute": existing execute path (unchanged)

Import `writeTimeline` from shared module instead of defining inline. Existing execution-stage timeline events in `executeEmail` and `executeMock` remain unchanged.

### 3. Refactor `queue-actions.ts` to Call Server

**Modify: `src/lib/queue-actions.ts`**

Replace direct DB insert and rate-limit logic with a single call to `execute-action-server`:

```typescript
export async function queueAction(params: QueueActionParams): Promise<QueueActionResult> {
  const { data, error } = await supabase.functions.invoke("execute-action-server", {
    body: { mode: "create", params },
  });

  if (error) {
    return { skipped: false, rateLimited: false, error: error.message };
  }

  return {
    skipped: data.skipped ?? false,
    rateLimited: data.rateLimited ?? false,
    actionId: data.actionId,
    error: data.error,
  };
}
```

Remove `getRateLimit()` and direct insert logic. `QueueActionParams` and `QueueActionResult` interfaces stay the same so all callers are unaffected.

### 4. Refactor `process-policy-rules` to Call `execute-action-server`

**Modify: `supabase/functions/process-policy-rules/index.ts`**

Replace direct `actions` insert (lines 222-249) with a fetch call:

```typescript
const response = await fetch(
  `${supabaseUrl}/functions/v1/execute-action-server`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CRON-SECRET": cronSecret,
    },
    body: JSON.stringify({
      mode: "create",
      params: {
        itemId: item.id,
        type: rule.action_type,
        channel: rule.action_channel,
        scheduledFor,
        idempotencyKey,
        requiresApproval: rule.requires_approval,
        templateId: rule.template_id ?? undefined,
        contactId: rule.contact_id ?? undefined,
        source: "system",
      },
    }),
  }
);
const result = await response.json();
```

Map response: `result.skipped && result.reason === "duplicate"` increments `totalSkipped`, `result.success && !result.skipped` increments `totalQueued`, otherwise `totalErrors`.

No Authorization header needed. X-CRON-SECRET is the sole auth mechanism for this path.

V1: one HTTP call per queued action. Correct-first, batch later.

### 5. Contacts Page (`/contacts`)

**New file: `src/pages/ContactsList.tsx`**

Workspace-scoped list following `AccountsList.tsx` patterns:
- Query: `contacts` joined with `accounts!inner(workspace_id, name)` filtered by `workspace.id`
- Table columns: Name, Email, Phone, Role, Account
- "Add Contact" dialog: account selector dropdown (workspace accounts), name, email, phone, role
- Validation: require at least email or phone (disable Add button if both empty)
- Row click navigates to `/accounts/:account_id`

### 6. Enhanced Account Detail Contacts

**Modify: `src/pages/AccountDetail.tsx`**

- Show email and phone inline using middot separators: `Name (role) · email · phone`
- Add phone field (`cPhone` state) to "Add Contact" dialog
- Require email or phone on create (disable Add button if both empty)
- Add delete button per contact with `window.confirm` guard

### 7. Connectors Page (`/connectors`)

**New file: `src/pages/ConnectorsList.tsx`**

CRUD for `connectors` table (workspace-scoped), card-grid layout:
- Each card: name, type badge, from_email, from_name, created date
- "Add Connector" dialog with explicit fields only:
  - `name` (text input, required)
  - `type` (select: "Email" enabled; "SMS" and "Webhook" shown disabled with "coming soon" label)
  - `from_email` (text input, required, must contain `@`)
  - `from_name` (text input, required)
  - `reply_to` (text input, optional)
- Config stored as `{ from_email, from_name, reply_to }` in JSON `config` column
- Edit and delete with confirmation

**Linked Accounts section** below connector cards:
- Shows `connector_accounts` joined with `accounts(name)` for selected connector
- "Link Account" dialog: select account + optional external_id
- Unlink button per row

### 8. Activity Dashboard

**Modify: `src/pages/Index.tsx`**

Replace `Navigate to="/accounts"` with a dashboard (seeding logic preserved):
- **Quick Stats row** (3 cards): total accounts, total items, pending actions (count queries filtered by `workspace_id`)
- **Recent Activity** feed: last 20 `timeline_events` using left join with `accounts(workspace_id, name)` filtered by workspace. Null `account_id` events render as "System". Same direction-icon pattern from `TimelinePage`.

### 9. Navigation and Routing

**Modify `src/components/AppSidebar.tsx`:**
- Add `{ to: "/contacts", label: "Contacts", icon: Users }` after Accounts
- Add `{ to: "/connectors", label: "Connectors", icon: Plug }` after Templates

**Modify `src/App.tsx`:**
- Add routes: `/contacts` and `/connectors`
- Import `ContactsList` and `ConnectorsList`

---

### Files Summary

| Action | File | What Changes |
|--------|------|-------------|
| Create | `src/pages/ContactsList.tsx` | Contacts CRUD page |
| Create | `src/pages/ConnectorsList.tsx` | Connectors CRUD page |
| Create | `supabase/functions/_shared/write-timeline.ts` | Shared timeline writer with allow-list enforcement |
| Modify | `supabase/functions/execute-action-server/index.ts` | Add create mode with auth decision tree, rate-limit, idempotency, queue-stage timeline; import shared writer |
| Modify | `supabase/functions/process-policy-rules/index.ts` | Replace direct insert with call to execute-action-server via X-CRON-SECRET |
| Modify | `src/lib/queue-actions.ts` | Replace direct DB insert with edge function call |
| Modify | `src/App.tsx` | 2 routes, 2 imports |
| Modify | `src/components/AppSidebar.tsx` | 2 nav items (Contacts, Connectors) |
| Modify | `src/pages/AccountDetail.tsx` | Contact display with middot separators, phone field, delete |
| Modify | `src/pages/Index.tsx` | Dashboard with stats + activity feed |

No database migrations needed. No secrets needed. `evaluate-playbook.ts` and `ItemDetail.tsx` unchanged (same `queueAction` interface).

