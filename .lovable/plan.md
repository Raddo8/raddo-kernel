

## RADDO Policy Rules V1 -- Post-Deploy Phase (Corrected)

### STEP 1: Live Fire Verification

No changes from prior plan. Data-only validation:

1. Insert one test policy rule targeting the existing workspace and item
2. Wait for cron tick, capture edge function logs
3. Verify action queued with correct idempotency key
4. Wait for second tick, confirm 23505 skip
5. Delete test rule

No code changes.

### STEP 2: Auto-Seed Default Policy Rules

**Location:** `src/lib/seed-casey.ts`, inside existing `seedCaseyPack()`.

**Condition 1 applied -- no zero thresholds:**

All `older_than_minutes` values use positive thresholds that represent intentional time boundaries.

| sort_order | predicate | action_type | channel | delay | approval |
|---|---|---|---|---|---|
| 100 | `{all: [{field: "due_date", op: "older_than_minutes", value: 1}]}` (1 min past due -- immediate boundary) | send_message | email | 0 min | no |
| 200 | `{all: [{field: "due_date", op: "older_than_minutes", value: 4320}]}` (3 days overdue) | send_message | email | 0 min | no |
| 300 | `{all: [{field: "due_date", op: "older_than_minutes", value: 43200}]}` (30 days overdue) | send_message | email | 0 min | yes |

Every threshold is a deliberate positive value. Zero is never used.

**Condition 2 applied -- idempotency scoped to seeded rules only:**

The check will query:

```typescript
const { data: existingSeeded } = await supabase
  .from("policy_rules")
  .select("id")
  .eq("workspace_id", workspaceId)
  .eq("vertical_pack_key", "casey")
  .gte("sort_order", 100)
  .lte("sort_order", 300)
  .limit(1);

if (existingSeeded && existingSeeded.length > 0) {
  // Seeded rules already present, skip
} else {
  // Insert defaults
}
```

This uses the known sort_order range (100-300) as an implicit marker for seed-origin rules. User-created rules will use the default sort_order of 1000 or higher, so they never collide with or block reseeding. No schema change required. Future pack upgrades can extend the range or add new sort_order bands without conflicting with user rules.

**File modified:** `src/lib/seed-casey.ts` only.

### STEP 3: Tests

**Condition 3 applied -- shared engine is pure:**

Create `src/lib/policy-rules-engine.ts` containing only:

- `canonicalStringify(obj: unknown): string`
- `hashPredicate(predicate: unknown): Promise<string>` (uses only `crypto.subtle`, available in both browser and Deno)
- `resolveField(item: Record<string, unknown>, path: string): unknown`
- `evaluatePredicate(condition, item, now: number): boolean`

Strict rules for this file:
- Zero imports (no Supabase, no Deno APIs, no Node APIs, no environment access)
- All functions are pure: same inputs always produce same outputs
- `now` is passed as a parameter, never computed internally
- The edge function inlines its own copy of these functions (already does). The shared file exists solely for testability and as the canonical reference

**Test file:** `src/test/policy-rules-engine.test.ts`

**Test suites:**

1. **Predicate evaluator -- all V1 operators:**
   - `equals`, `not_equals` (strict comparison)
   - `gt`, `gte`, `lt`, `lte` (numeric)
   - `in`, `not_in` (array membership)
   - `exists` (not null/undefined), `not_exists` (null or undefined)
   - `is_true`, `is_false` (boolean strict)
   - `older_than_minutes`, `newer_than_minutes` (relative to passed `now`)
   - `all` (logical AND), `any` (logical OR), nested combinators

2. **Dot-path resolution:**
   - Simple: `amount` resolves top-level field
   - Nested: `metadata.foo.bar` resolves deeply
   - Missing intermediate: `metadata.nonexistent.deep` returns `undefined`, no throw
   - Null intermediate: returns `undefined`, no throw
   - Empty string path: returns `undefined`

3. **Missing fields -- never throw:**
   - All comparison ops (`equals`, `gt`, `lt`, etc.) return `false` for `undefined`
   - `exists` returns `false` for `undefined`/`null`
   - `not_exists` returns `true` for `undefined`/`null`
   - No exceptions under any input

4. **Canonical hashing:**
   - `{a:1, b:2}` and `{b:2, a:1}` produce identical hash
   - Nested objects with reordered keys produce identical hash
   - Different values produce different hashes
   - Arrays preserve order: `[1,2]` and `[2,1]` produce different hashes

5. **Idempotency key format:**
   - Verify format: `policy:{ruleId}:{itemId}:{hash}:{index}`
   - Deterministic: same inputs across calls produce same key

### STEP 4: Minimal Policy Rules UI

**New page:** `src/pages/PolicyRulesList.tsx`

**Functionality:**
- List all `policy_rules` for current workspace, ordered by `sort_order ASC, id ASC`
- Display columns: sort_order, action_type, channel, enabled, predicate (truncated JSON)
- Toggle `enabled` via Switch component (single field update, no other mutations)
- No create, no edit, no delete, no predicate editor

**Route:** `/policy-rules` in `src/App.tsx`

**Sidebar:** Add "Rules" nav item in `src/components/AppSidebar.tsx` using `ListFilter` icon, positioned after "Policies"

---

### Files Summary

**Create:**
- `src/lib/policy-rules-engine.ts` -- pure, stateless, zero imports
- `src/test/policy-rules-engine.test.ts` -- Vitest suite
- `src/pages/PolicyRulesList.tsx` -- read-only list + toggle

**Modify:**
- `src/lib/seed-casey.ts` -- add default policy_rules seeding with sort_order range idempotency
- `src/App.tsx` -- add `/policy-rules` route
- `src/components/AppSidebar.tsx` -- add nav item

**No files modified in Step 1** (data operations only).

**Execution order:**
1. Live fire verification (data ops, no code)
2. Seed defaults (seed-casey.ts)
3. Extract pure engine + write tests (2 new files)
4. Run tests, confirm all pass
5. Create UI page + wire route + sidebar

**Hard constraints honored:**
- No DB triggers
- No evaluation queues
- No time literals (no `older_than_minutes: 0`, all thresholds positive)
- No UI execution logic
- No kernel table renames
- Shared engine is pure, stateless, zero-dependency
- All execution remains cron-driven and server-side

