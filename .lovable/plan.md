

# Corrections: Version String + Soft Limit Metric

## Issue 1: HANDOFF Version String

The version `2026.0214.1530` is wrong -- today is Feb 13, not Feb 14. The corrected version is `2026.0213.1530`. This appears only in `docs/HANDOFF.md` line 3 and the "Verified Date" on line 14.

**Fix:**
- Line 3: Change `2026.0214.1530` to `2026.0213.1530`
- Line 14: Change `2026-02-14` to `2026-02-13`

---

## Issue 2: Soft Limit Counts Completed, Not Created

The current soft limit in `execute-action-server` counts `usage_events` (which are only recorded on action *completion* via the `after_action_completed` trigger). This means a free workspace can queue unlimited actions as long as prior ones haven't completed yet -- a bypass.

**Recommended fix:** Change the enforcement metric to count `actions` rows created this billing period, not `usage_events`. This counts intent (creation) rather than outcome (completion).

**Change in `supabase/functions/execute-action-server/index.ts` (lines 163-168):**

Replace the `usage_events` count query with a count against the `actions` table:

```text
// Before (counts completed only):
const { count: periodUsage } = await billingServiceClient
  .from("usage_events")
  .select("id", { count: "exact", head: true })
  .eq("workspace_id", workspaceId)
  .eq("billing_period", currentPeriod);

// After (counts all non-canceled actions created this period):
const periodStart = currentPeriod + "-01T00:00:00Z";
const { count: periodUsage } = await billingServiceClient
  .from("actions")
  .select("id", { count: "exact", head: true })
  .eq("workspace_id", workspaceId)
  .gte("created_at", periodStart)
  .neq("status", "canceled");
```

This ensures the limit reflects queued intent. Canceled actions are excluded so users aren't penalized for cleanup. The `usage_events` table remains the source of truth for the billing/reporting dashboard (actual consumption), while the `actions` table governs the admission gate.

**No change to `billing-usage` edge function or the `/billing` UI** -- those correctly report on completed usage via `usage_events`.

---

## Verification Steps (Post-Implementation)

1. **Trigger test:** Complete an action and confirm exactly 1 `usage_events` row appears.
2. **`/billing` page:** Navigate to `/billing`, confirm membership gating and data rendering.
3. **Soft limit:** Confirm that creating actions (even before completion) increments toward the limit for free workspaces.

---

## Summary of Files Changed

| File | Change |
|---|---|
| `docs/HANDOFF.md` | Fix version `0214` to `0213`, fix verified date |
| `supabase/functions/execute-action-server/index.ts` | Soft limit: count `actions` created this period instead of `usage_events` |
