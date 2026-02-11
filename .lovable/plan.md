

## Fix 5 Remaining Defects

Three files need targeted edits. Defects 1 and 2 are already correct -- no changes needed there.

### Fix 3: Step/Rule Ordering Drift

**PlaybookDetail.tsx line 80** -- replace `step_order: steps.length` with:
```typescript
step_order: steps.length ? Math.max(...steps.map(s => s.step_order ?? 0)) + 1 : 0,
```

**PolicyDetail.tsx line 59** -- replace `sort_order: rules.length` with:
```typescript
sort_order: rules.length ? Math.max(...rules.map(r => r.sort_order ?? 0)) + 1 : 0,
```

This prevents order collisions after mid-list deletions.

### Fix 4: Delete Error Handling

**PlaybookDetail.tsx `deleteStep`** (lines 94-97) -- replace with:
```typescript
const deleteStep = async (stepId: string) => {
  const { error } = await supabase.from("playbook_steps").delete().eq("id", stepId);
  if (error) { toast.error(error.message); return; }
  refreshSteps();
  toast.success("Step deleted");
};
```

**PolicyDetail.tsx `deleteRule`** (lines 67-70) -- replace with:
```typescript
const deleteRule = async (ruleId: string) => {
  const { error } = await supabase.from("policy_rate_rules").delete().eq("id", ruleId);
  if (error) { toast.error(error.message); return; }
  refreshRules();
  toast.success("Rule deleted");
};
```

### Fix 5: Secondary Fetch Error Guards

All secondary `.then()` callbacks currently destructure only `{ data }`. Change each to `{ data, error }` and skip setting state on error so previously loaded data is not wiped by transient failures.

**AccountDetail.tsx lines 43-47:**
```typescript
supabase.from("contacts").select("*").eq("account_id", id).order("created_at")
  .then(({ data, error }) => { if (!active || error) return; setContacts(data || []); });
supabase.from("items").select("*, item_states(name, label, color), policies(name)")
  .eq("account_id", id).order("created_at", { ascending: false })
  .then(({ data, error }) => { if (!active || error) return; setItems(data || []); });
```

**PlaybookDetail.tsx line 50-52:**
```typescript
supabase.from("playbook_steps").select("*, templates(subject)")
  .eq("playbook_id", id).order("step_order")
  .then(({ data, error }) => { if (!active || error) return; setSteps(data || []); });
```

**PolicyDetail.tsx line 36-38:**
```typescript
supabase.from("policy_rate_rules").select("*")
  .eq("policy_id", id).order("sort_order")
  .then(({ data, error }) => { if (!active || error) return; setRules(data || []); });
```

### Summary of Changes

| File | Lines | Fix |
|------|-------|-----|
| PlaybookDetail.tsx | 80 | `step_order` uses `max()+1` |
| PlaybookDetail.tsx | 94-97 | `deleteStep` checks error, toasts |
| PlaybookDetail.tsx | 50-52 | Secondary fetch guards error |
| PolicyDetail.tsx | 59 | `sort_order` uses `max()+1` |
| PolicyDetail.tsx | 67-70 | `deleteRule` checks error, toasts |
| PolicyDetail.tsx | 36-38 | Secondary fetch guards error |
| AccountDetail.tsx | 43-47 | Secondary fetch guards error |

No architectural changes. Seven surgical edits across three files.

