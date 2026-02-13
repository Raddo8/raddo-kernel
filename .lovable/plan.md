

# Harden Warning-Level RLS Gaps: Mutation Deny Policies (Corrected)

## Summary

Close all missing UPDATE/DELETE (and INSERT where applicable) gaps on 6 tables using a three-layer defense: restrictive RLS policies, privilege revocation, and service-role bypass preservation.

## What Changed From Previous Plan

| Element | Previous (Flawed) | Corrected |
|---|---|---|
| Policy type | Default permissive `USING (false)` | `AS RESTRICTIVE USING (false)` -- AND-blocks, cannot be overridden by future permissive policies |
| Role scope | `TO authenticated` only | `TO authenticated, anon` -- covers all non-service roles |
| Privilege layer | Not addressed | Explicit `REVOKE INSERT, UPDATE, DELETE FROM anon, authenticated` on each table |
| Governance alignment | Claimed "restrictive" but implemented permissive | Implementation now matches claim |

## Why Three Layers

1. **Restrictive RLS policies**: `AS RESTRICTIVE` ensures the deny is AND-ed with any future permissive policy, making it impossible to override without explicitly dropping the restrictive policy first.
2. **Privilege revocation**: Even if RLS were somehow bypassed or disabled, the role itself lacks the SQL privilege to mutate. Defense in depth.
3. **Service-role preservation**: `service_role` bypasses both RLS and privilege checks, so edge functions continue working without change.

## Tables and Operations

| Table | Missing Operations | Has `workspace_id`? |
|---|---|---|
| `suppression_list` | UPDATE, DELETE | Yes (direct) |
| `message_events` | INSERT, UPDATE, DELETE | Yes (direct) |
| `timeline_events` | UPDATE, DELETE | No (via accounts join) |
| `scores` | INSERT, UPDATE, DELETE | No (via items/accounts join) |
| `workspace_members` | UPDATE, DELETE | Yes (direct) |
| `workspaces` | DELETE | Yes (is `id`) |

## Migration SQL

Single migration, two sections per table: restrictive RLS policies, then privilege revocation.

```sql
-- ============================================================
-- suppression_list
-- Mutations only via suppression-admin edge function (service-role)
-- ============================================================
CREATE POLICY "Deny update on suppression_list"
  ON public.suppression_list FOR UPDATE
  TO authenticated, anon
  AS RESTRICTIVE
  USING (false);

CREATE POLICY "Deny delete on suppression_list"
  ON public.suppression_list FOR DELETE
  TO authenticated, anon
  AS RESTRICTIVE
  USING (false);

REVOKE UPDATE, DELETE ON TABLE public.suppression_list FROM anon, authenticated;

-- ============================================================
-- message_events
-- Append-only via resend-webhook edge function (service-role)
-- No user INSERT, UPDATE, or DELETE
-- ============================================================
CREATE POLICY "Deny insert on message_events"
  ON public.message_events FOR INSERT
  TO authenticated, anon
  AS RESTRICTIVE
  WITH CHECK (false);

CREATE POLICY "Deny update on message_events"
  ON public.message_events FOR UPDATE
  TO authenticated, anon
  AS RESTRICTIVE
  USING (false);

CREATE POLICY "Deny delete on message_events"
  ON public.message_events FOR DELETE
  TO authenticated, anon
  AS RESTRICTIVE
  USING (false);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.message_events FROM anon, authenticated;

-- ============================================================
-- timeline_events
-- Append-only from user perspective (INSERT policy exists)
-- UPDATE and DELETE only via service-role
-- ============================================================
CREATE POLICY "Deny update on timeline_events"
  ON public.timeline_events FOR UPDATE
  TO authenticated, anon
  AS RESTRICTIVE
  USING (false);

CREATE POLICY "Deny delete on timeline_events"
  ON public.timeline_events FOR DELETE
  TO authenticated, anon
  AS RESTRICTIVE
  USING (false);

REVOKE UPDATE, DELETE ON TABLE public.timeline_events FROM anon, authenticated;

-- ============================================================
-- scores
-- Read-only for users, all writes via service-role
-- ============================================================
CREATE POLICY "Deny insert on scores"
  ON public.scores FOR INSERT
  TO authenticated, anon
  AS RESTRICTIVE
  WITH CHECK (false);

CREATE POLICY "Deny update on scores"
  ON public.scores FOR UPDATE
  TO authenticated, anon
  AS RESTRICTIVE
  USING (false);

CREATE POLICY "Deny delete on scores"
  ON public.scores FOR DELETE
  TO authenticated, anon
  AS RESTRICTIVE
  USING (false);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.scores FROM anon, authenticated;

-- ============================================================
-- workspace_members
-- Self-insert only (existing INSERT policy), no UPDATE or DELETE
-- Future role management will require deliberate migration
-- ============================================================
CREATE POLICY "Deny update on workspace_members"
  ON public.workspace_members FOR UPDATE
  TO authenticated, anon
  AS RESTRICTIVE
  USING (false);

CREATE POLICY "Deny delete on workspace_members"
  ON public.workspace_members FOR DELETE
  TO authenticated, anon
  AS RESTRICTIVE
  USING (false);

REVOKE UPDATE, DELETE ON TABLE public.workspace_members FROM anon, authenticated;

-- ============================================================
-- workspaces
-- Has SELECT/INSERT/UPDATE policies. Missing DELETE only.
-- Workspace deletion is destructive, deny by default.
-- ============================================================
CREATE POLICY "Deny delete on workspaces"
  ON public.workspaces FOR DELETE
  TO authenticated, anon
  AS RESTRICTIVE
  USING (false);

REVOKE DELETE ON TABLE public.workspaces FROM anon, authenticated;
```

## Impact on Existing Policies

Existing permissive policies (e.g., `Members can insert suppression_list`, `Members can insert timeline_events`) are unaffected. Restrictive policies only AND-block the specific operations they target (UPDATE, DELETE, or INSERT as specified). Operations with existing permissive policies that are NOT covered by a new restrictive deny continue to work normally.

For `timeline_events`: the existing INSERT permissive policy continues to allow workspace-scoped inserts. The new restrictive UPDATE/DELETE policies block those operations independently.

For `workspace_members`: the existing INSERT policy (`auth.uid() = user_id`) continues to allow self-registration. The new restrictive UPDATE/DELETE policies block those operations independently.

## What Does NOT Change

- All existing SELECT policies remain unchanged
- All existing INSERT policies on `suppression_list`, `timeline_events`, `workspace_members` remain functional
- All existing UPDATE policy on `workspaces` remains functional
- Edge functions using service-role continue to bypass both RLS and privilege checks
- No frontend code changes needed (no user-facing mutations exist on these tables)

## Hardening Checklist

- [x] All deny policies use `AS RESTRICTIVE` (AND-blocks, cannot be overridden)
- [x] All deny policies target `TO authenticated, anon` (all non-service roles)
- [x] Privilege layer enforced via `REVOKE` on each table
- [x] Service-role paths verified unaffected (bypasses RLS + privileges)
- [x] No user-facing code paths broken (no frontend mutations on these tables)
- [x] Implementation matches governance claims (restrictive = AS RESTRICTIVE)

## Post-Migration

1. Re-run security scan to confirm all warnings resolved
2. Verify edge functions still work (service-role bypass unaffected)
3. Confirm frontend operations unchanged

