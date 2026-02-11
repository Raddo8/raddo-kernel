

## RLS Fix + Not-Found Guards (with hardening)

### 1. Database Migration: connector_accounts RLS

Replace the broad ALL policy with specific INSERT/UPDATE/DELETE policies enforcing same-workspace between connector and account. Includes all hardening changes requested.

```sql
-- Ensure RLS is enabled (idempotent, no FORCE since not used elsewhere)
ALTER TABLE public.connector_accounts ENABLE ROW LEVEL SECURITY;

-- Drop broad ALL policy
DROP POLICY IF EXISTS "Members can manage connector_accounts" ON public.connector_accounts;

-- Idempotency guards for new policies
DROP POLICY IF EXISTS "Members can insert connector_accounts" ON public.connector_accounts;
DROP POLICY IF EXISTS "Members can update connector_accounts" ON public.connector_accounts;
DROP POLICY IF EXISTS "Members can delete connector_accounts" ON public.connector_accounts;

-- INSERT: membership + same workspace (single join-based EXISTS)
CREATE POLICY "Members can insert connector_accounts"
ON public.connector_accounts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.connectors c
    JOIN public.accounts a ON a.id = connector_accounts.account_id
    WHERE c.id = connector_accounts.connector_id
      AND c.workspace_id = a.workspace_id
      AND public.is_workspace_member(auth.uid(), c.workspace_id)
  )
);

-- UPDATE: membership on existing row + same workspace on new values
CREATE POLICY "Members can update connector_accounts"
ON public.connector_accounts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.connectors c
    WHERE c.id = connector_accounts.connector_id
      AND public.is_workspace_member(auth.uid(), c.workspace_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.connectors c
    JOIN public.accounts a ON a.id = connector_accounts.account_id
    WHERE c.id = connector_accounts.connector_id
      AND c.workspace_id = a.workspace_id
      AND public.is_workspace_member(auth.uid(), c.workspace_id)
  )
);

-- DELETE: membership check only
CREATE POLICY "Members can delete connector_accounts"
ON public.connector_accounts
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.connectors c
    WHERE c.id = connector_accounts.connector_id
      AND public.is_workspace_member(auth.uid(), c.workspace_id)
  )
);
```

The existing SELECT policy ("Members can view connector_accounts") is preserved untouched. FORCE RLS is omitted since it is not used anywhere else in the project.

---

### 2. Not-Found Guards on 3 Detail Pages

All three pages get the same hardening pattern with these improvements over the base plan:

- **Separate "error" from "not found"**: errors show a toast, only `!data && !error` sets `notFound(true)`
- **Race condition protection**: `let active = true` flag in each effect with cleanup returning `active = false`
- **Short-circuit secondary fetches**: secondary queries only fire after successful primary fetch

#### AccountDetail.tsx

- Add `Link` to import from `react-router-dom`
- Add `const [notFound, setNotFound] = useState(false);`
- Replace the `useEffect([id])` with:

```typescript
useEffect(() => {
  setNotFound(false);
  setAccount(null);
  setContacts([]);
  setItems([]);
  if (!id) return;

  let active = true;

  supabase.from("accounts").select("*").eq("id", id).maybeSingle()
    .then(({ data, error }) => {
      if (!active) return;
      if (error) { toast.error("Failed to load account"); return; }
      if (!data) { setNotFound(true); return; }
      setAccount(data);

      // Secondary fetches only after successful primary
      supabase.from("contacts").select("*").eq("account_id", id).order("created_at")
        .then(({ data }) => { if (active) setContacts(data || []); });
      supabase.from("items").select("*, item_states(name, label, color), policies(name)")
        .eq("account_id", id).order("created_at", { ascending: false })
        .then(({ data }) => { if (active) setItems(data || []); });
    });

  return () => { active = false; };
}, [id]);
```

- Update `fetchContacts` to accept `accountId` parameter (used by `addContact`/`deleteContact`)
- Add not-found UI block before loading guard:

```tsx
if (notFound) {
  return (
    <div className="p-6 space-y-3">
      <h2 className="text-lg font-semibold">Account not found</h2>
      <p className="text-sm text-muted-foreground">
        This account does not exist or you do not have access.
      </p>
      <Button variant="outline" size="sm" asChild>
        <Link to="/accounts">Back to accounts</Link>
      </Button>
    </div>
  );
}
```

#### PlaybookDetail.tsx

- Add `Link` to import from `react-router-dom`
- Add `const [notFound, setNotFound] = useState(false);`
- Split into two effects:

Effect 1 on `[id]` -- playbook + steps:
```typescript
useEffect(() => {
  setNotFound(false);
  setPlaybook(null);
  setSteps([]);
  if (!id) return;

  let active = true;

  supabase.from("playbooks").select("*").eq("id", id).maybeSingle()
    .then(({ data, error }) => {
      if (!active) return;
      if (error) { toast.error("Failed to load playbook"); return; }
      if (!data) { setNotFound(true); return; }
      setPlaybook(data);

      supabase.from("playbook_steps").select("*, templates(subject)")
        .eq("playbook_id", id).order("step_order")
        .then(({ data }) => { if (active) setSteps(data || []); });
    });

  return () => { active = false; };
}, [id]);
```

Effect 2 on `[workspace]` -- option lists for Add Step dialog:
```typescript
useEffect(() => {
  if (!workspace) return;
  supabase.from("templates").select("id, subject, template_type")
    .eq("workspace_id", workspace.id)
    .then(({ data }) => setTemplates(data || []));
  supabase.from("item_states").select("*")
    .eq("workspace_id", workspace.id).order("sort_order")
    .then(({ data }) => setStates(data || []));
}, [workspace]);
```

- Update `addStep` and `deleteStep` to refetch playbook+steps after mutation (using parameterized helpers)
- Add not-found UI block before loading guard, back link to `/playbooks`

#### PolicyDetail.tsx

- Add `Link` to import from `react-router-dom`
- Add `const [notFound, setNotFound] = useState(false);`
- Replace `useEffect([id])`:

```typescript
useEffect(() => {
  setNotFound(false);
  setPolicy(null);
  setRules([]);
  if (!id) return;

  let active = true;

  supabase.from("policies").select("*").eq("id", id).maybeSingle()
    .then(({ data, error }) => {
      if (!active) return;
      if (error) { toast.error("Failed to load policy"); return; }
      if (!data) { setNotFound(true); return; }
      setPolicy(data);

      supabase.from("policy_rate_rules").select("*")
        .eq("policy_id", id).order("sort_order")
        .then(({ data }) => { if (active) setRules(data || []); });
    });

  return () => { active = false; };
}, [id]);
```

- Update `addRule`/`deleteRule` to refetch with parameterized helpers
- Add not-found UI block before loading guard, back link to `/policies`

---

### Verification Checklist

1. `/connectors` -- linked accounts still render (SELECT policy preserved)
2. Cross-workspace `connector_accounts` insert via SQL editor -- expect RLS rejection
3. Bogus UUID on `/accounts/000...`, `/playbooks/000...`, `/policies/000...` -- expect "Not found" UI
4. Valid IDs on all three pages -- confirm normal load, no regressions
5. Non-member user loading a valid ID -- expect "Not found" UI, not hang, not data leak

