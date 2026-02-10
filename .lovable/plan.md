

## Steps 2-4: Implementation Plan (Final)

### Step 2 -- Seed Default Policy Rules

**File: `src/lib/seed-casey.ts`**

After the playbook seeding block, add a new section that seeds 3 default `policy_rules` rows.

**Idempotency guard:**
```typescript
const { data: existingSeeded } = await supabase
  .from("policy_rules")
  .select("id")
  .eq("workspace_id", workspaceId)
  .eq("vertical_pack_key", "casey")
  .gte("sort_order", 100)
  .lte("sort_order", 300)
  .limit(1);
```
If any rows exist, skip insertion entirely.

**Insert 3 rules** (no `policy_id` -- field does not exist in schema):

| sort_order | template_id source | predicate | delay_minutes | requires_approval |
|---|---|---|---|---|
| 100 | `templateMap["reminder"]` | `{all: [{field: "due_date", op: "older_than_minutes", value: 1}]}` | 0 | false |
| 200 | `templateMap["verification_request"]` | `{all: [{field: "due_date", op: "older_than_minutes", value: 4320}]}` | 0 | false |
| 300 | `templateMap["escalation_notice"]` | `{all: [{field: "due_date", op: "older_than_minutes", value: 43200}]}` | 0 | true |

All rules share: `workspace_id: workspaceId`, `action_type: "send_message"`, `action_channel: "email"`, `vertical_pack_key: "casey"`, `enabled: true`.

The `template_id` column is typed as `text` in the schema, so `templateMap[key]` (a UUID string) is valid.

The seeding block is placed after the playbook block so `templatesData` and `templateMap` are already available. No dependency on any policy row.

---

### Step 3 -- Extract Pure Engine + Write Tests

**New file: `src/lib/policy-rules-engine.ts`**

Four pure functions, zero imports, zero side effects:

- **`canonicalStringify(obj)`** -- recursively sorts object keys, produces deterministic JSON string. Arrays preserve order; primitives pass through.
- **`hashPredicate(predicate)`** -- runs `canonicalStringify` then SHA-256 via `crypto.subtle`, returns first 8 hex characters.
- **`resolveField(item, path)`** -- splits on `.`, walks the object. Returns `undefined` for any missing/null intermediate. Never throws.
- **`evaluatePredicate(condition, item, now)`** -- evaluates a predicate tree against an item. Supported operators:
  - Comparison: `equals`, `not_equals`, `gt`, `gte`, `lt`, `lte`
  - Membership: `in`, `not_in`
  - Presence: `exists`, `not_exists`
  - Boolean: `is_true`, `is_false`
  - Time-relative: `older_than_minutes` (computes `now - fieldTime > value * 60000`), `newer_than_minutes` (computes `now - fieldTime < value * 60000`)
  - Combinators: `all` (logical AND), `any` (logical OR), supports nesting

All comparison operators return `false` when the resolved field value is `undefined`. No exceptions thrown under any input.

**New file: `src/test/policy-rules-engine.test.ts`**

Vitest suite with 5 test groups:

1. **All V1 operators** -- each operator tested with passing and failing cases. Time operators tested with past and future timestamps relative to a fixed `now`.
2. **Dot-path resolution** -- simple field, nested path (`metadata.foo.bar`), missing intermediate returns `undefined`, null intermediate returns `undefined`, empty string path returns `undefined`.
3. **Missing fields never throw** -- all comparison ops return `false` for `undefined` field values; `exists` returns `false`, `not_exists` returns `true`.
4. **Canonical hashing** -- `{a:1, b:2}` equals `{b:2, a:1}` hash; nested key reorder produces same hash; different values produce different hashes; `[1,2]` differs from `[2,1]`.
5. **Idempotency key format** -- builds `policy:${ruleId}:${itemId}:${hash}:${index}` and verifies same inputs produce same key across calls.

---

### Step 4 -- Minimal Policy Rules UI

**New file: `src/pages/PolicyRulesList.tsx`**

- Fetches `policy_rules` for current workspace ordered by `sort_order ASC, id ASC`
- Displays columns: sort_order, action_type, channel, enabled (Switch), predicate (truncated JSON)
- **Optimistic toggle** for `enabled`:
  - Immediately flips local state
  - Fires `supabase.from("policy_rules").update({ enabled }).eq("id", id)`
  - On error: reverts local state, shows `toast.error("Failed to update rule")`
  - On success: shows `toast.success("Rule updated")`
- Uses PageHeader, EmptyState, Switch, Table components following existing patterns
- No create, edit, delete, or predicate editor

**Modified: `src/App.tsx`**
- Add import for `PolicyRulesList`
- Add route `<Route path="/policy-rules" element={<PolicyRulesList />} />`

**Modified: `src/components/AppSidebar.tsx`**
- Add `ListFilter` icon import
- Add nav item `{ to: "/policy-rules", label: "Rules", icon: ListFilter }` after "Policies"

---

### Files Summary

**Create (3):**
- `src/lib/policy-rules-engine.ts`
- `src/test/policy-rules-engine.test.ts`
- `src/pages/PolicyRulesList.tsx`

**Modify (3):**
- `src/lib/seed-casey.ts` -- add policy_rules seeding (no policy_id)
- `src/App.tsx` -- add import + route
- `src/components/AppSidebar.tsx` -- add import + nav item

**Execution order:**
1. Modify `seed-casey.ts` (Step 2)
2. Create `policy-rules-engine.ts` + test file (Step 3)
3. Run tests, confirm all pass
4. Create `PolicyRulesList.tsx`, wire route + sidebar (Step 4)

