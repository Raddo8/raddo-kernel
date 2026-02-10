

## Fix: Backfill Policy Rules with Self-Healing Template Resolution

### Problem

Line 37 (`if (existing) return`) exits before the `policy_rules` block (lines 83-135) is ever reached. Existing workspaces have zero policy_rules seeded.

### Solution

Restructure `seedCaseyPack` into three parts:

1. **New helper: `ensureCaseyTemplates(workspaceId, missingKeys)`** -- Filters `CASEY_TEMPLATES` to only the missing keys, inserts them, returns the inserted rows. Reuses the same template definitions from the `CASEY_TEMPLATES` constant (same subject, body, channel, tone). This is not a guess -- it is the identical seeding logic used on first-time seed.

2. **New helper: `backfillPolicyRules(workspaceId)`** -- Self-contained, independently idempotent:
   - Guard: check `policy_rules` where `workspace_id` + `vertical_pack_key = "casey"` + `sort_order` 100-300. If any exist, return false.
   - Fetch the 3 required templates by `template_type` from the `templates` table for this workspace.
   - Compute missing keys. If any missing: call `ensureCaseyTemplates(workspaceId, missing)` to create them, then re-fetch.
   - Build `tMap`, insert the 3 rules. Return true.

3. **Modified early-return block** (line 37):
   ```
   if (existing) {
     const rulesBackfilled = await backfillPolicyRules(workspaceId);
     return { alreadySeeded: true, rulesBackfilled };
   }
   ```

4. **First-time seed path** (lines 83-135): Replace with a call to `backfillPolicyRules(workspaceId)`. This eliminates the duplicated insertion logic and the `if (templatesData)` guard -- `backfillPolicyRules` resolves templates from the DB independently.

### File Changed

**`src/lib/seed-casey.ts`**

### What Changes

- Add `ensureCaseyTemplates(workspaceId, missingKeys)` helper before `seedCaseyPack`
- Add `backfillPolicyRules(workspaceId)` helper before `seedCaseyPack`
- Line 37: replace `return { alreadySeeded: true }` with backfill call + return
- Lines 83-135: replace inline policy_rules block with `await backfillPolicyRules(workspaceId)`
- Return type on backfill path becomes `{ alreadySeeded: true, rulesBackfilled: boolean }`

### Key Behaviors

- `ensureCaseyTemplates` only inserts templates for the specific missing keys, not all 9
- `backfillPolicyRules` is fully self-contained: fetches its own template IDs from DB, never depends on variables from the outer scope
- If templates exist: no re-insertion (upsert not needed, the fetch resolves them)
- If templates are missing: creates them deterministically from `CASEY_TEMPLATES` constant
- Idempotency guard on rules prevents duplicate insertion on repeated calls
- No other files modified

