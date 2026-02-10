

## Fix Connector Type Mismatch, Em Dashes, and Add Connector Edit with Separate State

Three targeted fixes. No migrations. One edge function redeploy.

### 1. Fix Connector Type Query in `executeEmail`

**File**: `supabase/functions/execute-action-server/index.ts` (line 548)

Change `.eq("type", "resend" as any)` to `.eq("type", "email" as any)`.

The UI already writes `type = "email"` (lowercase, line 84 of ConnectorsList). The execution query must match.

### 2. Replace Em Dashes with Middots

**File**: `src/pages/Index.tsx` (line 137)
- Change `— {ev.accounts.name}` to `· {ev.accounts.name}`

**File**: `src/pages/TimelinePage.tsx` (line 47)
- Same change: `— {ev.accounts.name}` to `· {ev.accounts.name}`

### 3. Add Connector Edit with Separate State

**File**: `src/pages/ConnectorsList.tsx`

Add separate edit state (not reusing create state):

```text
// Edit connector form (separate from create)
const [editOpen, setEditOpen] = useState(false);
const [editId, setEditId] = useState<string | null>(null);
const [editName, setEditName] = useState("");
const [editFromEmail, setEditFromEmail] = useState("");
const [editFromName, setEditFromName] = useState("");
const [editReplyTo, setEditReplyTo] = useState("");
```

Add `Pencil` to lucide imports.

Add `openEdit(connector)` function that sets all edit state from the connector's current values.

Add `updateConnector()` function:
- Same validation as create (name required, from_email contains `@`, from_name required)
- Calls `supabase.from("connectors").update({ name, config: { from_email, from_name, reply_to } }).eq("id", editId)`
- On success: clear edit state, close dialog, refetch, toast

Add edit button (Pencil icon) in each connector card next to delete button.

Add edit Dialog (separate from create Dialog) rendered below the card grid, controlled by `editOpen`/`setEditOpen`.

### Technical: Files Summary

| Action | File | What Changes |
|--------|------|-------------|
| Modify | `supabase/functions/execute-action-server/index.ts` | Line 548: `"resend"` to `"email"` |
| Modify | `src/pages/Index.tsx` | Line 137: em dash to middot |
| Modify | `src/pages/TimelinePage.tsx` | Line 47: em dash to middot |
| Modify | `src/pages/ConnectorsList.tsx` | Add separate edit state, edit button, edit dialog, update function |

Redeploy `execute-action-server` after the type fix.

