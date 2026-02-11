

# Suppression List Management Page

## Overview

Build a `/suppression` page for viewing, searching, and managing suppressed email recipients. Members can view and manually add; only owners/admins can remove entries via a secure edge function.

## Changes

### 1. Expose user role in WorkspaceContext

**File: `src/lib/workspace-context.tsx`**

- Add `userRole: string | null` to context interface and state
- Update the existing `workspace_members` query to also select `role`
- Extract `data.role` alongside the workspace data

### 2. New page: `src/pages/SuppressionList.tsx`

**Top controls:**
- Search input (filters by email, client-side)
- Reason filter: all / bounce / complaint / manual / unsubscribe
- Source filter: all / webhook / manual / system
- "Add Suppression" button (opens dialog)

**Table columns:**
- Email
- Reason (lightweight inline badge, styled locally -- NOT StatusBadge)
- Source (lightweight inline badge, styled locally)
- Created at (formatted)
- Remove button (only visible when `userRole` is `owner` or `admin`)

**Data fetching:**
- `SELECT * FROM suppression_list WHERE workspace_id = $ws ORDER BY created_at DESC LIMIT 200`
- Client-side filtering by search text, reason, source

**Manual add dialog:**
- Email input with basic validation
- Inserts: `{ workspace_id, email: email.toLowerCase(), reason: 'manual', source: 'manual' }`

**Remove (admin-gated):**
- Calls edge function `POST /suppression-admin` with `{ action: "remove", suppression_id, workspace_id }`
- Also accepts `{ action: "remove", email, workspace_id }` as alternative
- On success, refetches list

**Empty state:** "No suppressed recipients" with ShieldOff icon

### 3. New edge function: `supabase/functions/suppression-admin/index.ts`

**Config:** `verify_jwt = true` (no manual JWT handling needed -- framework rejects unauthenticated requests)

**Logic:**
1. Standard CORS headers + OPTIONS handler
2. Get authenticated user via `supabase.auth.getUser()` (JWT already verified)
3. Query `workspace_members` to confirm user has `owner` or `admin` role in the given workspace
4. If not authorized, return 403
5. Create a service-role client for the delete operation
6. Delete from `suppression_list` by `id + workspace_id` or by `email + workspace_id`
7. Return success/error JSON

### 4. Route and sidebar

**`src/App.tsx`:** Add `<Route path="/suppression" element={<SuppressionList />} />`

**`src/components/AppSidebar.tsx`:** Add nav item `{ to: "/suppression", label: "Suppressions", icon: ShieldOff }` after Connectors

### 5. Reason/source badges

Styled locally in `SuppressionList.tsx` as simple `<span>` elements with tailwind classes. StatusBadge is NOT modified -- it stays reserved for action lifecycle statuses.

- Reason colors: bounce (red), complaint (red), manual (amber), unsubscribe (muted)
- Source colors: webhook (blue), manual (amber), system (muted)

## No database changes

- `suppression_list` table exists with RLS (SELECT + INSERT for members, no DELETE)
- `workspace_members` already has `role` column with `workspace_role` enum

## Technical Notes

- The edge function uses `verify_jwt = true` so unauthenticated requests are rejected at the gateway level
- Service role is used only for the DELETE operation after server-side admin verification
- The existing `workspace_role` enum (`owner | admin | member | viewer`) is already in the database

## Files

| File | Action |
|------|--------|
| `src/lib/workspace-context.tsx` | Modified (add userRole) |
| `src/pages/SuppressionList.tsx` | New |
| `supabase/functions/suppression-admin/index.ts` | New |
| `src/App.tsx` | Modified (add route) |
| `src/components/AppSidebar.tsx` | Modified (add nav link) |

## Acceptance Criteria

1. Members can view suppression list filtered by workspace
2. Search by email works
3. Reason and source dropdown filters work
4. Members can add manual suppressions (email lowercased)
5. Only owners/admins see the Remove button
6. Edge function returns 401 if unauthenticated (verify_jwt)
7. Edge function returns 403 if not owner/admin
8. Deletes are scoped by workspace_id
9. Empty state shown when no suppressions exist
