

## Remove All Remaining Em Dashes (4 locations)

### 1. index.html (line 6)

Current: `<title>Raddo — Agentic CRM Kernel</title>`
Replace: `<title>Raddo · Agentic CRM Kernel</title>`

### 2. src/lib/render-template.ts (line 7)

Current: `* — even when the render itself succeeds (constraint 4).`
Replace: `*, even when the render itself succeeds (constraint 4).`

### 3. src/pages/ItemDetail.tsx (line 145)

Current: `{/* Action buttons — all route through queueAction() */}`
Replace: `{/* Action buttons: all route through queueAction() */}`

### 4. supabase/migrations/20260209215630_...sql (line 5)

Migration files are not auto-overwritten after creation. This is safe to edit.

Current: `-- A1. Expand action_status enum (no 'queued' — unused)`
Replace: `-- A1. Expand action_status enum (no 'queued', unused)`

### Files Summary

| File | Line | Change |
|------|------|--------|
| `index.html` | 6 | Em dash to middot in title |
| `src/lib/render-template.ts` | 7 | Em dash to comma |
| `src/pages/ItemDetail.tsx` | 145 | Em dash to colon |
| `supabase/migrations/...330.sql` | 5 | Em dash to comma |

After these four edits, a final repo-wide scan for `—` and `–` should return zero results.

