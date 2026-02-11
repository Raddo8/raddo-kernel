

# Suppression-Admin: Non-Silent Delete, Audit Logging, and JSON Hardening

## Overview

Three targeted patches to the existing hardened `suppression-admin` edge function. No new tables. Audit is via **structured console logs + response payload** (not `timeline_events`, which requires a non-nullable `account_id` that suppressions don't have).

## Why Not timeline_events

The `timeline_events` table has `account_id uuid NOT NULL`. Suppressions are workspace-scoped and may not relate to any specific account. Inserting with a null `account_id` would violate the constraint. Therefore, audit is handled through structured `console.log` (queryable in edge function logs) and the response payload returning proof of what was deleted.

## Patch 1: Non-Silent Delete with Deleted Record Details

**File: `supabase/functions/suppression-admin/index.ts`**

Replace the current delete logic (lines 83-97) with:

```typescript
const { data: deleted, error: delErr } = await deleteQuery.select("id,email,reason,source");

if (delErr) {
  return new Response(JSON.stringify({ error: delErr.message }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

if (!deleted || deleted.length === 0) {
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

Success response becomes:
```typescript
return new Response(JSON.stringify({
  ok: true,
  deleted_count: deleted.length,
  deleted: deleted.map(r => ({ id: r.id, email: r.email, reason: r.reason, source: r.source })),
}), {
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
```

This returns only `id`, `email`, `reason`, `source` -- no `contact_id`, no `workspace_id` in the payload.

## Patch 2: Structured Audit Log

**File: `supabase/functions/suppression-admin/index.ts`**

Immediately before the success response, emit a structured log:

```typescript
console.log(JSON.stringify({
  event: "suppression_removed",
  actor: user.id,
  workspace_id,
  target: suppression_id || email,
  deleted_count: deleted.length,
  timestamp: new Date().toISOString(),
}));
```

This is queryable via the edge function logs dashboard.

## Patch 3: JSON Parsing Hardening

**File: `supabase/functions/suppression-admin/index.ts`**

Wrap the `req.json()` call in a try/catch. Gate order remains: Bearer check, then getUser gate, then JSON parse. This avoids giving hints to unauthenticated callers about body format.

```typescript
let body: any;
try {
  body = await req.json();
} catch {
  return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const { action, suppression_id, email, workspace_id } = body;
```

## No UI Changes Needed

The existing `handleRemove` in `SuppressionList.tsx` throws on `!res.ok`, so 404 surfaces as "Not found" in the error toast automatically.

## Verification

**Test A -- No token -> 401:**
Raw curl (no Authorization header). Note: Lovable tooling auto-injects tokens, so this test is verified by code inspection. For live confirmation, run manually:
```
curl -X POST https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/suppression-admin \
  -H "Content-Type: application/json" \
  -d '{"action":"remove","workspace_id":"00000000-0000-0000-0000-000000000000","suppression_id":"00000000-0000-0000-0000-000000000001"}'
```
Expected: 401

**Test B -- Member token -> 403:**
Requires a real member-role user session token. Cannot be executed without one.

**Test C -- Admin + wrong workspace -> 403:**
Already verified.

**Test D -- Admin + non-existent suppression_id -> 404:**
POST with valid admin token, valid workspace_id, random UUID for suppression_id.
Expected: `404 { error: "Not found" }`

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/suppression-admin/index.ts` | Non-silent delete with `.select("id,email,reason,source")`, 404 on zero rows, structured audit log, JSON parse hardening |

## Acceptance Criteria

1. Delete of non-existent suppression returns `404 { error: "Not found" }`
2. Successful delete returns `{ ok: true, deleted_count: N, deleted: [{ id, email, reason, source }] }`
3. Structured audit log emitted on every successful delete (actor, target, workspace_id, timestamp) -- queryable in edge function logs
4. Invalid JSON body returns 400 before any DB work
5. Test D passes (admin + non-existent ID returns 404)
6. Tests A/C still pass (no regression)
7. `contact_id` and `workspace_id` are NOT included in the deleted record response payload

