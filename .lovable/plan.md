

# ST1 Phase 1: Usage Metering Engine (No Stripe)

## Strategic Framing

This is engine-level infrastructure only. We build the fuel gauge, not the cash register.

- Metering layer: YES (measure every completed action)
- Workspace billing config: YES (pricing-agnostic plan limits in DB)
- Internal usage dashboard: YES (visibility into engine throughput)
- Stripe integration: NO (deferred to Phase 2 when revenue trigger arrives)

The execution core (`execute-action-core.ts`) remains untouched. Metering is a side effect via database trigger.

---

## Database Changes

### Migration 1: `usage_events` table + trigger

**Table: `usage_events`**

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, gen_random_uuid() |
| workspace_id | uuid | NOT NULL |
| action_id | uuid | NOT NULL |
| event_type | text | NOT NULL (e.g. 'action_executed') |
| channel | text | NOT NULL (email, sms, system, portal) |
| unit_count | integer | NOT NULL, default 1 |
| recorded_at | timestamptz | NOT NULL, default now() |
| billing_period | text | NOT NULL (e.g. '2026-02') |
| stripe_reported | boolean | NOT NULL, default false (future-proofed for Phase 2) |
| metadata | jsonb | default '{}' |

**RLS:**
- SELECT: workspace members only (`is_workspace_member(auth.uid(), workspace_id)`)
- INSERT/UPDATE/DELETE: denied for authenticated/anon (trigger writes via SECURITY DEFINER)

**Trigger: `after_action_completed`**

Fires on UPDATE of `actions` when status transitions to 'completed'. Inserts one row into `usage_events`. Uses `SECURITY DEFINER` so the trigger function can write to the table even though authenticated users cannot.

```sql
CREATE OR REPLACE FUNCTION record_usage_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO usage_events (workspace_id, action_id, event_type, channel, billing_period)
    VALUES (
      NEW.workspace_id,
      NEW.id,
      'action_executed',
      COALESCE(NEW.channel, 'system'),
      to_char(now(), 'YYYY-MM')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_action_completed
  AFTER UPDATE ON actions
  FOR EACH ROW
  EXECUTE FUNCTION record_usage_event();
```

This is the key architectural decision: metering at the database layer, not application code. Every completed action is automatically metered regardless of execution path (UI, scheduler, API, future channels).

### Migration 2: `workspace_billing` table

**Table: `workspace_billing`**

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, gen_random_uuid() |
| workspace_id | uuid | NOT NULL, unique |
| plan | text | NOT NULL, default 'free' |
| monthly_action_limit | integer | NOT NULL, default 100 |
| overage_rate_cents | integer | NOT NULL, default 0 |
| billing_email | text | nullable |
| current_period_start | timestamptz | nullable |
| current_period_end | timestamptz | nullable |
| stripe_customer_id | text | nullable (reserved for Phase 2) |
| stripe_subscription_id | text | nullable (reserved for Phase 2) |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**RLS:**
- SELECT: workspace members
- UPDATE: workspace members (owner-only enforcement deferred to RPC later)
- INSERT/DELETE: denied for authenticated

Note: Stripe columns are nullable placeholders. No Stripe logic touches them in Phase 1.

### Seed existing workspaces

Insert a `free` plan row for every existing workspace that does not yet have a `workspace_billing` row.

---

## Edge Function: `billing-usage` (new)

Single new edge function. No Stripe. Returns usage data only.

**GET** (authenticated, workspace member):
- Current billing period usage total
- Breakdown by channel
- Breakdown by day (last 30 days)
- Plan limits from `workspace_billing`
- Remaining quota

This uses a service-role client internally to query `usage_events` (since it needs aggregation across the table efficiently).

---

## Frontend Changes

### New Page: `/billing`

Internal-only usage dashboard. No payment flows.

- Current plan display (Free / Starter / Growth / Enterprise -- labels only, no purchase flow)
- Usage meter: progress bar showing X / Y actions consumed this period
- Usage by channel: small table (email, sms, system, portal)
- Usage over time: recharts line chart, last 30 days, daily granularity
- Billing period dates

Uses the existing recharts dependency (already installed) and the existing chart components (`src/components/ui/chart.tsx`).

### Sidebar Addition

- Add "Usage" nav item with `BarChart3` icon from lucide-react
- Position after "Health" in the nav list

---

## Soft Limit Check (Optional Enforcement)

Add a lightweight check in `execute-action-server` create mode:
- Before inserting a new action, query current period usage count vs workspace limit
- If over limit and plan = 'free': return `{ success: false, reason: 'usage_limit_reached' }`
- If over limit and plan has overage configured: allow (future Stripe billing handles cost)
- This is a SELECT query, not a constraint -- does not block the execution path

This is the only change to an existing edge function, and it is in the create path only (not the execution core).

---

## Implementation Sequence

1. Database migration: `usage_events` table + RLS + trigger
2. Database migration: `workspace_billing` table + RLS
3. Seed `workspace_billing` for existing workspaces
4. Edge function: `billing-usage` (usage query endpoint)
5. Frontend: `/billing` page with usage dashboard
6. Sidebar: add "Usage" nav link
7. Soft limit check in `execute-action-server` create mode
8. Update `docs/HANDOFF.md` with metering architecture

---

## What Is NOT Built (Deferred to Phase 2)

- Stripe products, prices, subscriptions
- Stripe webhooks (`billing-webhook`)
- Stripe billing portal (`billing-portal`)
- Overage billing sync
- Plan upgrade/downgrade flows
- Payment method management
- Invoice generation

## What Is NOT Changed

- `execute-action-core.ts` is NOT modified
- `stress-test` edge function preserved (7/7)
- `health-probe` edge function preserved
- All existing RLS policies unchanged
- All existing edge functions unchanged (except soft limit addition to `execute-action-server` create mode)

## Security

- `usage_events` write-only for service_role (trigger runs as SECURITY DEFINER)
- `workspace_billing` update restricted to workspace members
- No Stripe keys needed in Phase 1
- Plan limits enforced server-side only

