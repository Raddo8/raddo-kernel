

# ST1 Phase 1: Remaining Implementation (Steps 4-8)

## Overview

Three deliverables remain: the `billing-usage` edge function, the `/billing` UI page with sidebar link, the soft limit check in `execute-action-server`, and the HANDOFF update.

---

## Step 1: Edge Function `billing-usage`

New file: `supabase/functions/billing-usage/index.ts`

Config addition in `supabase/config.toml`:
```text
[functions.billing-usage]
verify_jwt = false
```

**Behavior (POST, authenticated via JWT):**

1. Extract workspace_id from request body
2. Validate JWT, extract user, verify workspace membership via `is_workspace_member` RPC
3. Use service-role client to query:
   - `workspace_billing` row for the workspace (plan, monthly_action_limit)
   - Current billing period (`YYYY-MM` of now): `SELECT count(*), channel FROM usage_events WHERE workspace_id = $1 AND billing_period = $2 GROUP BY channel`
   - Daily breakdown (last 30 days): `SELECT recorded_at::date as day, count(*) FROM usage_events WHERE workspace_id = $1 AND recorded_at > now() - interval '30 days' GROUP BY day ORDER BY day`
4. Return JSON:

```text
{
  plan: string,
  monthly_action_limit: number,
  current_period: string,
  total_used: number,
  remaining: number,
  by_channel: { email: N, sms: N, system: N, portal: N },
  daily: [ { date: "2026-02-01", count: N }, ... ]
}
```

**Security:** JWT validation in code (verify_jwt=false pattern consistent with other functions). Service-role client for aggregation queries. Workspace membership enforced before any data returned.

---

## Step 2: Frontend `/billing` Page

New file: `src/pages/BillingUsage.tsx`

**Layout** (follows SchedulerHealth.tsx pattern):
- `PageHeader` with title "Usage" and subtitle "Billing period metrics"
- Fetches data from `billing-usage` edge function on mount
- Loading / error / access_denied states (same pattern as SchedulerHealth)

**Sections:**
1. **Plan card**: Shows current plan name and billing period (e.g., "Free -- February 2026")
2. **Usage meter**: Progress bar component showing `total_used / monthly_action_limit` with numeric label (e.g., "42 / 100 actions")
3. **Channel breakdown**: Small table with columns Channel | Count (email, sms, system, portal -- only rows with count > 0)
4. **Daily usage chart**: Recharts `LineChart` using existing `ChartContainer` component, last 30 days, single line showing daily action count

**Dependencies:** All already installed (recharts, date-fns, existing UI components).

---

## Step 3: Sidebar Link

Edit: `src/components/AppSidebar.tsx`

Add nav item after the "Health" entry:
```text
{ to: "/billing", label: "Usage", icon: BarChart3 }
```

Import `BarChart3` from lucide-react.

---

## Step 4: Route Registration

Edit: `src/App.tsx`

- Import `BillingUsage` page
- Add route: `<Route path="/billing" element={<BillingUsage />} />`

---

## Step 5: Soft Limit Check in `execute-action-server`

Edit: `supabase/functions/execute-action-server/index.ts`

In `handleCreate`, after the workspace membership check (line ~148) and before the rate-limit check (line ~150), add:

```text
// Usage soft limit check
const serviceClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const currentPeriod = new Date().toISOString().slice(0, 7); // "YYYY-MM"

const { data: billing } = await serviceClient
  .from("workspace_billing")
  .select("plan, monthly_action_limit")
  .eq("workspace_id", workspaceId)
  .maybeSingle();

if (billing) {
  const { count: periodUsage } = await serviceClient
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("billing_period", currentPeriod);

  if ((periodUsage ?? 0) >= billing.monthly_action_limit && billing.plan === "free") {
    return jsonOk({
      success: false,
      reason: "usage_limit_reached",
      limit: billing.monthly_action_limit,
      used: periodUsage,
    });
  }
}
```

**Key design decisions:**
- Uses service-role client for the check (usage_events has no INSERT for authenticated)
- Only blocks `free` plan workspaces at limit; paid plans pass through for future overage billing
- Returns `success: false` (not an HTTP error) so callers can handle gracefully
- Adds ~2 queries to the create path (acceptable for non-hot path)

---

## Step 6: HANDOFF Update

Edit: `docs/HANDOFF.md`

- Bump version to `2026.0214.HHMM` (current time)
- Update maturity numbers: Operational Infrastructure ~77%, Blended ~77%
- Add "Usage Metering" section under Security Architecture documenting:
  - `usage_events` table + trigger architecture
  - `workspace_billing` table + RLS hardening
  - `billing-usage` edge function
  - Soft limit enforcement in create path
- Update Infrastructure Still Required: mark "Billing integration" and "Usage metering" as partially done (Phase 1 complete, Stripe deferred)
- Add `billing-usage` to Edge Function Inventory table

---

## Implementation Order

1. Create `billing-usage` edge function + config.toml entry
2. Create `BillingUsage.tsx` page
3. Update `App.tsx` with route
4. Update `AppSidebar.tsx` with nav link
5. Update `execute-action-server/index.ts` with soft limit
6. Deploy edge functions
7. Update `docs/HANDOFF.md`

