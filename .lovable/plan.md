

# Scheduled Action Processor -- Implementation Plan

## Summary

Two new edge functions and one client-side simplification. All action execution converges on a single server-side function. The scheduler is a thin query-and-delegate loop. No UI changes. No schema changes.

---

## New Secret Required

**`CRON_SECRET`** -- a random string shared between pg_cron and both edge functions. You will be prompted to create and enter this value before the cron job is registered. This avoids embedding the service role key in SQL.

---

## File 1: `supabase/functions/execute-action-server/index.ts` (CREATE)

The single server-side execution boundary. Absorbs all logic from `execute-action-email` and the client-side mock path.

**Auth (dual mode):**
- If `X-CRON-SECRET` header matches `CRON_SECRET` env var: scheduler mode. Uses service role key for DB. Sets `source: "scheduler"`, `actor_user_id: null`.
- Otherwise: requires valid user JWT via Authorization header. Validates workspace membership. Sets `source: "ui"`.

**Execution flow:**
1. Parse body: `{ actionId, manualRetry? }`
2. Load action with item/account joins (using appropriate client)
3. **Stuck-running recovery:**
   - If `status === "running"` and `claimed_at` older than 10 minutes:
     - If `result_json.provider_not_configured === true`: reset to `scheduled` (or `approved` if that was prior status, but since we cannot know prior status after a stuck claim, default to `scheduled`), clear `claimed_by`/`claimed_at`. Return `{ success: true, recovered: true, reset_to: "scheduled" }`.
     - Otherwise (true deadlock): set to `failed` with timeout error. Return `{ success: true, recovered: true, failed: true }`.
4. Status guard: reject terminal statuses, require `scheduled` or `approved`
5. Provider idempotency guard: reject if `result_json.provider_message_id` exists (unless `manualRetry`)
6. Save `priorStatus` before claim
7. Atomic claim: `UPDATE actions SET status='running', claimed_by=..., claimed_at=now() WHERE id=X AND status IN ('scheduled','approved')`. Zero rows = abort (409).
8. Load and render template (allow-listed variables, always persist `render_errors`)
9. **Channel routing:**
   - `channel=email` + `type=send_message`: resolve recipient, check RESEND_API_KEY (if missing: revert to `priorStatus`, clear claim, set `result_json.provider_not_configured=true`, return 503), load connector config, send via Resend, write timeline event
   - Everything else: mock execution (500ms delay), write timeline event
10. Update to `completed` or `failed` with full `result_json`

**Template rendering:** Inline allow-listed renderer (same logic as `render-template.ts` -- duplicated server-side since client modules cannot be imported in Deno edge functions).

**Timeline writes:** Direct insert to `timeline_events` table (same pattern as current `execute-action-email`). Cannot import `writeTimelineEvent()` from client code in Deno.

---

## File 2: `supabase/functions/process-scheduled-actions/index.ts` (CREATE)

Deliberately thin scheduler. Contains zero claim/render/complete logic.

**Auth:** Validates `X-CRON-SECRET` header ONLY. No JWT fallback. Returns 401 if missing or wrong.

**Logic:**
1. Create Supabase client with service role key
2. Query due actions:
   ```
   SELECT id FROM actions
   WHERE status IN ('scheduled', 'approved')
     AND scheduled_for <= now()
   ORDER BY scheduled_for ASC
   LIMIT 10
   ```
3. For each `actionId`: call `execute-action-server` via HTTP fetch, passing `X-CRON-SECRET` header (same secret, forwarded)
4. Collect results per action
5. Return: `{ processed: N, succeeded: N, failed: N, skipped: N, details: [...] }`

---

## File 3: `src/lib/execute-action.ts` (SIMPLIFY)

Remove all inline logic (mock execution, template rendering, channel routing, timeline writes). Replace with a single `supabase.functions.invoke("execute-action-server")` call.

```
export async function executeAction(params) {
  const { actionId, manualRetry = false } = params;
  const { data, error } = await supabase.functions.invoke("execute-action-server", {
    body: { actionId, manualRetry },
  });
  if (error) return { success: false, error: error.message };
  if (data && !data.success) return { success: false, error: data.error };
  return { success: true };
}
```

Imports for `renderTemplate`, `writeTimelineEvent` removed. The `ExecuteActionParams` and `ExecuteActionResult` interfaces remain for type compatibility.

---

## File 4: `supabase/functions/execute-action-email/` (DELETE)

Entirely replaced by `execute-action-server`. Will be deleted from filesystem and undeployed.

---

## Config: `supabase/config.toml`

Do NOT add `verify_jwt = false` for `execute-action-server` (per your requirement -- JWT verification stays enabled; cron calls bypass via `X-CRON-SECRET` header validated in code).

Add only:
```
[functions.process-scheduled-actions]
verify_jwt = false
```

`process-scheduled-actions` needs `verify_jwt = false` because cron calls have no JWT -- it authenticates exclusively via `X-CRON-SECRET`.

---

## Cron Registration (SQL via insert tool, not migration)

After `CRON_SECRET` is added as a secret, register the pg_cron job. The secret value will be provided as a literal in the SQL since `current_setting` is not available for edge function secrets:

```sql
SELECT cron.schedule(
  'process-scheduled-actions',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/process-scheduled-actions',
    headers := '{"Content-Type": "application/json", "X-CRON-SECRET": "<CRON_SECRET_VALUE>"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);
```

You will be asked to provide the CRON_SECRET value before this SQL is run.

---

## Proof Run

After deployment:
1. Insert a test action with `status = 'scheduled'`, `scheduled_for = now()`, `channel = 'system'`, `type = 'test'` for an existing item
2. Wait up to 2 minutes for cron to fire
3. Verify: action status changed to `completed`, `source = "scheduler"`, `result_json` contains mock data, timeline event created

---

## Execution Path Convergence

| Trigger | Path |
|---------|------|
| UI button click | `execute-action.ts` -> `supabase.functions.invoke("execute-action-server")` with user JWT |
| Scheduler cron | `process-scheduled-actions` -> `fetch("execute-action-server")` with X-CRON-SECRET |

Both converge on the same function. One execution path. One claim gate. One template renderer. One timeline writer.

---

## Verification Checklist

1. `execute-action-server` handles email and non-email through one path
2. `process-scheduled-actions` contains zero claim/render/complete logic
3. `execute-action.ts` (client) is a thin invoke wrapper with no inline logic
4. `execute-action-email` deleted and undeployed
5. `execute-action-server` keeps `verify_jwt` enabled (default); cron authenticated via `X-CRON-SECRET`
6. `process-scheduled-actions` accepts `X-CRON-SECRET` only, never JWT
7. Stuck-running with `provider_not_configured` resets to `scheduled`, not `failed`
8. Stuck-running without `provider_not_configured` fails with timeout error
9. Atomic claim is sole concurrency gate
10. `render_errors` always in `result_json`
11. Cron fires every 2 minutes, processes up to 10 due actions

