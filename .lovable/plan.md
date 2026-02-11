

## Fix Scheduler Pipeline: Shared Execution Core (Corrected)

### Problem

`process-scheduled-actions` calls `execute-action-server` via HTTP with `X-CRON-SECRET`, but `execute-action-server` blocks cron secret for execute mode (line 133). Every scheduled/approved action fails with 403. No automated execution works.

### Solution

Extract execution logic into a shared library module (`execute-action-core.ts`). `process-scheduled-actions` calls it directly with its service-role client. `execute-action-server` imports it for UI-triggered execution. No new endpoints. Cron-secret block stays.

### Corrections Applied

1. **Stuck-running recovery**: Fixed condition to `claimed_at < now() - 10min` (was backwards). Also handles `claimed_at IS NULL` as stuck.

2. **Provider-missing = terminal failure**: When `RESEND_API_KEY` is missing, the action is marked `failed` with `error_code: "provider_not_configured"` instead of reverting to prior status. This prevents the infinite retry loop.

3. **Scheduler query excludes running**: Only queries `status IN ('scheduled', 'approved')`. Recovery of stuck-running actions happens inside `executeActionCore` when it encounters one, not by selecting running rows as due.

4. **Claim returns the row**: Conditional UPDATE uses `.select("id")` so 0-row return means "already claimed, exit."

### File Changes

#### 1. New: `supabase/functions/_shared/execute-action-core.ts`

Shared library (not an endpoint). Contains all extracted logic:

- **Constants**: TERMINAL_STATUSES, EXECUTABLE_STATUSES, STUCK_THRESHOLD_MS (10min), ALLOWED_VARIABLES, DEFAULT_RATE_LIMIT
- **Template rendering**: resolve(), renderString() -- identical to current
- **Recipient resolution**: resolveRecipient() -- identical
- **failAction()** helper -- sets status=failed, persists error + render_errors to result_json
- **executeActionCore()** main function:

```typescript
export interface ExecuteActionCoreResult {
  success: boolean;
  error?: string;
  recovered?: boolean;
  reset_to?: string;
  failed?: boolean;
  skipped?: boolean;
  provider_message_id?: string;
}

export async function executeActionCore(
  supabase: SupabaseClient,
  actionId: string,
  opts: {
    userId?: string | null;
    source: string;
    manualRetry?: boolean;
  }
): Promise<ExecuteActionCoreResult>
```

Internal flow:

1. Load action with joins (items, accounts)
2. **Stuck-running recovery**: if `status === "running"`:
   - If `claimed_at` is NULL or `claimed_at < Date.now() - 10min` --> stuck
   - Mark `failed` with error `"Execution timeout"`, return `{ recovered: true, failed: true }`
   - If not stuck (claimed recently), return `{ success: false, error: "Currently running" }`
3. **Status guard**: reject terminal or non-executable statuses
4. **Provider idempotency guard**: reject if `provider_message_id` exists (unless manualRetry)
5. **Atomic claim**: conditional UPDATE where `status IN ('scheduled', 'approved')`, sets `status='running'`, `claimed_by=userId||null`, `claimed_at=now()`. Uses `.select("id")`. If 0 rows, return immediately with error "already claimed"
6. **Write execution-start timeline**: `"Action execution started: {type} via {channel}"`
7. **Load and render template**: resolve recipient, render subject/body. If render throws, catch it, call failAction with render error persisted to result_json, write failure timeline, return error (never crash caller)
8. **Channel routing**:
   - email + send_message: check RESEND_API_KEY. If missing, call `failAction()` with `error_code: "provider_not_configured"`, write failure timeline. Return `{ success: false, error: "provider_not_configured" }`. No status revert.
   - If key present: call Resend API, handle success/failure
   - else: mock execution (500ms delay)
9. **On success**: update status=completed, executed_at=now(), result_json with render_errors. Write completion timeline
10. **On failure**: failAction() persists error + render_errors to result_json. Write failure timeline. Never throws.

#### 2. Refactor: `supabase/functions/execute-action-server/index.ts`

**Remove** (lines 18-60): template rendering functions (resolve, renderString, ALLOWED_VARIABLES, TemplateContext) -- moved to core
**Remove** (lines 62-112): resolveRecipient -- moved to core
**Remove** (lines 500-659): executeEmail, executeMock -- logic moved to core
**Remove** (lines 677-690): failAction -- moved to core
**Remove** (lines 10-16): constants (TERMINAL_STATUSES, etc.) -- moved to core

**Keep**:
- CORS headers (lines 4-8)
- authenticate() (lines 114-156) with cron-secret block intact
- getRateLimit() (lines 158-188)
- handleCreate() (lines 190-315)
- Main handler routing (lines 318-345)
- jsonOk() / jsonError() (lines 663-675)

**Change execute mode** (lines 346-497): replace entire block with:

```typescript
import { executeActionCore } from "../_shared/execute-action-core.ts";

// In execute mode:
const actionId = body.actionId;
const manualRetry = body.manualRetry;
if (!actionId) return jsonError("actionId is required", 400);

const result = await executeActionCore(supabase, actionId, {
  userId,
  source,
  manualRetry,
});

if (result.recovered) {
  return jsonOk({ success: true, recovered: true, failed: result.failed });
}
if (!result.success) {
  const status = result.error?.includes("not found") ? 404
    : result.error?.includes("claimed") ? 409 : 500;
  return jsonError(result.error || "Execution failed", status);
}
return jsonOk({
  success: true,
  provider_message_id: result.provider_message_id,
});
```

#### 3. Refactor: `supabase/functions/process-scheduled-actions/index.ts`

**Remove**: the HTTP fetch loop (lines 62-91)

**Change**:
- Import `executeActionCore` from shared module
- Raise query limit from 10 to 50
- Call core directly for each due action:

```typescript
import { executeActionCore } from "../_shared/execute-action-core.ts";

// After querying due actions:
for (const action of dueActions) {
  try {
    const result = await executeActionCore(supabase, action.id, {
      userId: null,
      source: "scheduler",
    });
    if (result.recovered) { skipped++; }
    else if (result.success) { succeeded++; }
    else { failed++; }
    details.push({ actionId: action.id, result: result.success ? "succeeded" : "failed", error: result.error });
  } catch (err) {
    failed++;
    details.push({ actionId: action.id, result: "failed", error: err?.message });
  }
}
```

### No Changes To

- `supabase/config.toml` -- no new functions
- `supabase/functions/_shared/write-timeline.ts` -- reused as-is
- `supabase/functions/process-policy-rules/index.ts` -- only creates actions (create mode works fine)
- `src/lib/execute-action.ts` -- client wrapper unchanged

### Security Properties

- X-CRON-SECRET still blocked from execute-action-server execute mode
- process-scheduled-actions uses service-role client directly (no HTTP delegation)
- Atomic claim prevents double-execution
- UI path still requires JWT + workspace membership
- Provider-missing is terminal (no infinite retry loop)

### Verification After Deploy

1. Confirm 403 errors stop in logs
2. Confirm scheduled/approved actions transition to completed/failed within 1-2 cron ticks
3. **Step B (Toggle)**: disable rule, trigger sweep, confirm no new actions; re-enable, confirm resume
4. **Step C (Approval)**: pending_approval ignored by scheduler; approve via UI; confirm execution on next tick; verify timeline events

### File Summary

| File | Action |
|------|--------|
| `supabase/functions/_shared/execute-action-core.ts` | New shared library (~250 lines extracted + corrected) |
| `supabase/functions/execute-action-server/index.ts` | Refactor: import core, remove ~400 lines of duplicated logic |
| `supabase/functions/process-scheduled-actions/index.ts` | Refactor: call core directly, raise limit to 50 |

