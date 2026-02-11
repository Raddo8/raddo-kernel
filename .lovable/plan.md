

# Phase 1: Cleanup + Reputation Armor (with mandatory changes)

Incorporates both user-mandated changes: safe DELETE scoping and first-class `provider_message_id` indexing.

---

## Step 1: Clean Up E2E Test Data

Safe, scoped deletes (no operator precedence bug):

```sql
-- Timeline events scoped by item_id + summary pattern (no action_id column exists)
DELETE FROM timeline_events
WHERE item_id = '65d6cc88-f665-428c-a929-6ef87f005274'
  AND (summary ILIKE '%e2e%');

-- Test actions
DELETE FROM actions
WHERE id IN (
  '3cc2d27b-53b8-4978-86c8-eda4990614f0',
  '4dbb875f-ce77-48e9-8766-bc29a9f3b3f8'
);

-- Test template
DELETE FROM templates
WHERE id = '5a9e2eab-a3a2-445a-afb9-a027fa71b244';
```

---

## Step 2: Migration -- `suppression_list` table

```sql
CREATE TABLE public.suppression_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  email text NOT NULL,
  contact_id uuid,
  reason text NOT NULL,        -- bounce, complaint, manual, unsubscribe
  source text NOT NULL,         -- webhook, manual, system
  scope text NOT NULL DEFAULT 'workspace',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email),
  CHECK (email = lower(email))
);

ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view suppression_list"
  ON public.suppression_list FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can insert suppression_list"
  ON public.suppression_list FOR INSERT
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));
```

---

## Step 3: Migration -- Add `provider` + `provider_message_id` columns to `actions`

```sql
ALTER TABLE public.actions
  ADD COLUMN provider text,
  ADD COLUMN provider_message_id text;

CREATE INDEX idx_actions_provider_message
  ON public.actions (provider, provider_message_id);
```

---

## Step 4: Code -- Suppression check + provider columns in `execute-action-core.ts`

Two changes in `executeEmail()`:

**A. Suppression check** (after recipient resolution, before Resend call, ~15 lines):
- Query `suppression_list` for `workspace_id + lower(contact.email)`
- If match: fail action with `error_code: 'suppressed_recipient'`, write timeline, return early

**B. Write `provider` + `provider_message_id` columns** on success:
- In the success update block, add `provider: 'resend'` and `provider_message_id: resendResult.id` alongside the existing `result_json` write

---

## Step 5: Migration -- `message_events` table

```sql
CREATE TABLE public.message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  action_id uuid,
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.message_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view message_events"
  ON public.message_events FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_message_events_provider_msg
  ON public.message_events (provider_message_id);
```

---

## Step 6: New edge function -- `resend-webhook/index.ts`

- `verify_jwt = false` in config.toml
- Validates Svix signature headers (`svix-id`, `svix-timestamp`, `svix-signature`) using webhook signing secret (`RESEND_WEBHOOK_SECRET`)
- Rejects if timestamp older than 5 minutes (replay protection)
- Looks up action via indexed query: `SELECT id, workspace_id FROM actions WHERE provider = 'resend' AND provider_message_id = $1 LIMIT 1`
- Inserts into `message_events`
- On `bounced` (hard): auto-insert into `suppression_list` with `reason = 'bounce'`, `source = 'webhook'`
- On `complained`: auto-insert into `suppression_list` with `reason = 'complaint'`, `source = 'webhook'`

Requires new secret: `RESEND_WEBHOOK_SECRET` (will prompt user).

---

## Step 7: Deploy and test

- Deploy `resend-webhook` edge function
- Prompt user to register webhook URL in Resend: `https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/resend-webhook`
- Test: send email, confirm `delivered` event row in `message_events`
- Test: simulate bounce to confirm suppression entry created

---

## Execution order

1. Delete test data (SQL via insert tool)
2. Migration: `suppression_list` table
3. Migration: `provider` + `provider_message_id` columns + index on `actions`
4. Code: suppression enforcement + provider column writes in `execute-action-core.ts`
5. Migration: `message_events` table
6. New file: `supabase/functions/resend-webhook/index.ts`
7. Update `supabase/config.toml`: add `[functions.resend-webhook]`
8. Prompt for `RESEND_WEBHOOK_SECRET`
9. Deploy and register webhook
10. End-to-end test

### Files modified
- `supabase/functions/_shared/execute-action-core.ts`
- `supabase/config.toml`

### Files created
- `supabase/functions/resend-webhook/index.ts`

