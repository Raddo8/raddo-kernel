

## RADDO Policy Rules V1 -- Implementation Plan

### Step 1: SQL Migration

Rename old table and create new RADDO table.

**Rename:**
- `policy_rules` -> `policy_rate_rules`
- Update existing RLS policy names to reference new table name
- Drop old RLS policies, recreate on renamed table

**Create new `policy_rules`:**

```sql
create table policy_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  vertical_pack_key text not null,
  enabled boolean not null default true,
  sort_order integer not null default 1000,
  predicate jsonb not null,
  action_type text not null,
  action_channel text not null,
  template_id text,
  delay_minutes integer,
  delay_seconds integer,
  requires_approval boolean not null default false,
  contact_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_policy_rules_workspace_enabled
  on policy_rules(workspace_id) where enabled = true;

alter table policy_rules enable row level security;

create policy "Members can view policy_rules"
  on policy_rules for select
  using (is_workspace_member(auth.uid(), workspace_id));

create policy "Members can manage policy_rules"
  on policy_rules for all
  using (is_workspace_member(auth.uid(), workspace_id));
```

Attach `update_updated_at` trigger to new table.

Keep existing partial unique index on `actions(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL` as-is -- functionally equivalent and better than a full unique constraint.

### Step 2: Update code references from `policy_rules` to `policy_rate_rules`

Four files:
- `src/pages/PolicyDetail.tsx` -- table name in select/insert/delete calls
- `src/pages/PoliciesList.tsx` -- table name in select join
- `src/lib/queue-actions.ts` -- getRateLimit query
- `src/lib/seed-casey.ts` -- seed insert

All are simple string replacements of `"policy_rules"` to `"policy_rate_rules"`.

### Step 3: Edge Function `process-policy-rules/index.ts`

Auth: X-CRON-SECRET only. `verify_jwt = false` in config.toml.

**Core loop per workspace:**

1. Load enabled rules: `ORDER BY sort_order ASC, id ASC`
2. Query candidate items: `updated_at >= now() - 10 min OR due_date <= now() + 1 day`, limit 500
3. For each `(rule, ruleIndex)` x `item`: evaluate predicate in-memory
4. On match: insert into `actions` with idempotency key
5. On 23505 unique violation: count as skipped, continue

**Canonical predicate hashing:**

```typescript
function canonicalStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalStringify).join(",") + "]";
  if (typeof obj === "object") {
    const sorted = Object.keys(obj as Record<string, unknown>).sort();
    return "{" + sorted.map(k =>
      JSON.stringify(k) + ":" + canonicalStringify((obj as Record<string, unknown>)[k])
    ).join(",") + "}";
  }
  return JSON.stringify(obj);
}
```

Hash: `SHA-256` of `canonicalStringify(rule.predicate)`, truncated to 8 hex chars.

**Idempotency key:** `policy:{rule.id}:{item.id}:{predicateHash}:{ruleIndex}`

Where `ruleIndex` is the index in the `sort_order ASC, id ASC` ordered array.

**Field resolver with safe dot-path traversal:**

```typescript
function resolveField(item: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = item;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
```

Missing/undefined fields never throw. All comparison operators return `false` for undefined values except `exists` (returns false) and `not_exists` (returns true).

**V1 predicate operator set:**

| Operator | Behavior |
|---|---|
| `all` | Logical AND over nested conditions array |
| `any` | Logical OR over nested conditions array |
| `equals` | `fieldValue === value` (strict) |
| `not_equals` | `fieldValue !== value` |
| `gt` | `fieldValue > value` |
| `gte` | `fieldValue >= value` |
| `lt` | `fieldValue < value` |
| `lte` | `fieldValue <= value` |
| `in` | `value` is array, checks inclusion |
| `not_in` | `value` is array, checks exclusion |
| `exists` | field is not undefined and not null |
| `not_exists` | field is undefined or null |
| `is_true` | `fieldValue === true` |
| `is_false` | `fieldValue === false` |
| `older_than_minutes` | `(now - fieldAsDate) > value minutes` |
| `newer_than_minutes` | `(now - fieldAsDate) < value minutes` |

No time literals like `"now"`. All time comparisons use `older_than_minutes` / `newer_than_minutes` which compute relative to current time at evaluation.

**Consequence mapping:** Each rule directly specifies `action_type`, `action_channel`, `template_id`, `delay_minutes`, `delay_seconds`, `requires_approval`, `contact_id`. The `scheduled_for` is computed as `now() + delay_minutes + delay_seconds`.

### Step 4: config.toml

Add entry:
```toml
[functions.process-policy-rules]
verify_jwt = false
```

### Step 5: Register pg_cron

Via insert tool (not migration), using project URL and CRON_SECRET:

```sql
select cron.schedule(
  'process-policy-rules',
  '*/3 * * * *',
  $$
  select net.http_post(
    url := 'https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/process-policy-rules',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-CRON-SECRET', current_setting('app.settings.cron_secret')
    )
  );
  $$
);
```

### Files Summary

**Create:**
- `supabase/functions/process-policy-rules/index.ts`

**Modify:**
- `supabase/config.toml` (add function entry)
- `src/pages/PolicyDetail.tsx` (rename table)
- `src/pages/PoliciesList.tsx` (rename table)
- `src/lib/queue-actions.ts` (rename table)
- `src/lib/seed-casey.ts` (rename table)

**SQL (migration tool):**
- Rename `policy_rules` to `policy_rate_rules` with RLS
- Create new `policy_rules` with RADDO schema, RLS, index, trigger

**SQL (insert tool):**
- Register pg_cron schedule

