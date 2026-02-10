

## Fix ItemDetail Loading Hang with Parameterized Fetches

### Summary

Fix the perpetual "Loading..." hang in `ItemDetail.tsx` when an item fetch returns null or errors. Add proper not-found state, parameterized fetch functions, split effects with full state reset, and error handling with toast feedback.

### Changes to `src/pages/ItemDetail.tsx`

#### 1. Update imports (line 2)

Add `Link` to the `react-router-dom` import (already imports `useParams`).

#### 2. Add `notFound` state (after line 23)

```typescript
const [notFound, setNotFound] = useState(false);
```

#### 3. Replace fetch functions (lines 26-45)

Convert both to parameterized versions accepting an explicit `itemId` argument:

```typescript
const fetchItem = async (itemId: string) => {
  const { data, error } = await supabase
    .from("items")
    .select("*, accounts(id, name), item_states(id, name, label, color), policies(id, name)")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !data) {
    setNotFound(true);
    setActions([]);
    return;
  }
  setNotFound(false);
  setItem(data);
  if (data.item_states) setSelectedState(data.item_states.id);
};

const fetchActions = async (itemId: string) => {
  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });
  if (error) {
    setActions([]);
    toast.error("Failed to load actions");
    return;
  }
  setActions(data || []);
};
```

#### 4. Split useEffect into two (lines 47-53)

```typescript
useEffect(() => {
  setNotFound(false);
  setItem(null);
  setActions([]);
  if (!id) return;
  fetchItem(id);
  fetchActions(id);
}, [id]);

useEffect(() => {
  if (workspace) {
    supabase.from("item_states").select("*")
      .eq("workspace_id", workspace.id)
      .order("sort_order")
      .then(({ data }) => setStates(data || []));
  }
}, [workspace]);
```

#### 5. Update callers (lines 82-83, 98)

- `changeState`: guard `if (!id) return;` already exists at line 56, so calls become `fetchItem(id)` and `fetchActions(id)`
- `handleQueueAction`: guard `if (!id || !item) return;` already exists, so call becomes `fetchActions(id)`

#### 6. Replace loading guard (line 102)

```tsx
if (notFound) {
  return (
    <div className="p-6 space-y-3">
      <h2 className="text-lg font-semibold">Item not found</h2>
      <p className="text-sm text-muted-foreground">
        This item does not exist or you do not have access.
      </p>
      <Button variant="outline" size="sm" asChild>
        <Link to="/items">Back to {labels.items}</Link>
      </Button>
    </div>
  );
}
if (!item) return <div className="p-6 text-muted-foreground">Loading...</div>;
```

### Pre-existing imports confirmed

- `toast` from `sonner` is already imported (line 12)
- `Button` is already imported (line 7)
- `useParams` is already imported from `react-router-dom` (line 2), just needs `Link` added

### Verification After Implementation

1. Open a known-good item: confirm normal load with correct subtitle.
2. Navigate to `/items/00000000-0000-0000-0000-000000000000`: confirm "Item not found" with back button, no stale actions.
3. Create a no-amount item and verify subtitle renders as `TYPE · Account · No [item] amount`.

