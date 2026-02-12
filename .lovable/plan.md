

# Execute 5 Correctness Fixes -- Build-Ready

All patches verified against current file contents. No schema changes needed. One minor improvement applied to Fix 3 (check `submitted_at` before expiry for deterministic ordering).

---

## Fix 1: `supabase/functions/_shared/write-timeline.ts`

Add `rawJson` to the params interface and pass it through to the insert.

- **Line 13**: Add `rawJson?: Record<string, unknown> | null;` after the `body` field
- **Line 34**: Add `raw_json: params.rawJson ?? null,` after the `body` line in the insert object

---

## Fix 2 + 3: `supabase/functions/submit-response/index.ts`

Two changes in this file:

**Disambiguation (lines 71-73)**: Replace the blind `ALREADY_RESPONDED` return with a re-query that checks `submitted_at` first, then expiry:

```typescript
if (updateErr || !updated) {
  const { data: recheck } = await supabase
    .from("action_responses")
    .select("submitted_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (recheck?.submitted_at) {
    return json({ valid: false, reason_code: "ALREADY_RESPONDED" });
  }
  if (recheck && new Date(recheck.expires_at) <= new Date()) {
    return json({ valid: false, reason_code: "TOKEN_EXPIRED" });
  }
  return json({ valid: false, reason_code: "ALREADY_RESPONDED" });
}
```

**Timeline raw_json (lines 85-91)**: Add structured `rawJson` payload to the `writeTimeline` call:

```typescript
rawJson: {
  event_type: "recipient_response",
  selected_option,
  submitted_at: now,
  token_hash_prefix: prefix,
},
```

---

## Fix 4: `src/lib/render-template.ts`

Two changes:

**TemplateContext interface (line 36)**: Add `response_url?: string;` as a top-level field.

**resolve() function (lines 45-52)**: Add early return for single-segment (no-dot) paths before the existing two-segment logic:

```typescript
if (!path.includes(".")) {
  const val = (ctx as Record<string, unknown>)[path];
  if (val === undefined) return undefined;
  if (val === null) return "";
  return String(val);
}
```

---

## Fix 5: `src/App.tsx`

Replace dual `<Routes>` blocks with a single tree. Public `/respond/:token` at top level, authenticated routes nested under a layout route wrapped by AuthGate/WorkspaceProvider/AppLayout, and `NotFound` at the outer level so unauthenticated users see 404 instead of login.

---

## Implementation Order

1. `write-timeline.ts` (2 line additions)
2. `submit-response/index.ts` (disambiguation + rawJson)
3. `render-template.ts` (interface + resolve fix)
4. `App.tsx` (single Routes block)
5. Redeploy `submit-response`

## Post-Fix Verification

- Timeline events from submit-response contain `raw_json` with `event_type`, `selected_option`, `submitted_at`, `token_hash_prefix`
- `/respond/:token` renders without AuthGate interference
- Authenticated routes still require login
- `{{response_url}}` in template preview resolves without render errors
- Race-condition expiry during submit returns `TOKEN_EXPIRED`, not `ALREADY_RESPONDED`

