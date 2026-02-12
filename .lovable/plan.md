

# Fix: Replace Broken base64url Import with JSR + Expand Action Reset

## 1. Replace broken import with pinned JSR import

**File:** `supabase/functions/_shared/execute-action-core.ts` (lines 342-345)

Replace:
```typescript
const { encode: base64urlEncode } = await import("https://deno.land/std@0.224.0/encoding/base64url.ts");
const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
const token = base64urlEncode(tokenBytes);
```

With:
```typescript
import { encodeBase64Url } from "jsr:@std/encoding@1.0.10/base64url";
// ... (at top of file, static import)
```

And at line 342-345:
```typescript
const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
const token = encodeBase64Url(tokenBytes);
```

The import moves to the top of the file as a static import (not dynamic), pinned to `@std/encoding@1.0.10`. This is the official JSR path for Deno's standard library base64url encoder.

## 2. Reset stuck action with full execution marker cleanup

The `actions` table has these execution-related columns: `status`, `claimed_at`, `claimed_by`, `executed_at`, `result_json`, `provider`, `provider_message_id`, `source`.

Reset SQL (to be run via data tool after deploy):
```sql
UPDATE actions
SET status = 'scheduled',
    claimed_at = NULL,
    claimed_by = NULL,
    executed_at = NULL,
    result_json = NULL,
    provider = NULL,
    provider_message_id = NULL
WHERE id = '593328e8-a421-4278-ba89-13cc03e1a1f8';
```

This clears every execution marker so the scheduler treats it as a fresh schedulable action.

## 3. After deploy: Resume E2E validation

1. Deploy updated edge function
2. Run the reset SQL
3. Scheduler picks up the action (or trigger manually)
4. Continue validation: email, respond page, integrity checks, negative tests

## Summary

| Item | Detail |
|---|---|
| File changed | `supabase/functions/_shared/execute-action-core.ts` |
| Import | `jsr:@std/encoding@1.0.10/base64url` (static, pinned) |
| Stuck action reset | Clears `status`, `claimed_at`, `claimed_by`, `executed_at`, `result_json`, `provider`, `provider_message_id` |

