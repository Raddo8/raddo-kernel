# A4.3 · Live-probe list for `resolve_hq_authority_v1`

**Honest statement of limitation.** The repository test runner is Vitest (jsdom, no Postgres
container, zero new dependencies permitted by A3.1). It therefore **cannot** execute the
required authority tests as automated DB tests. They are encoded here as live probes to be
run against the database by an operator, not as green checkmarks.

Two probes were already executed live during A3.1 (read-only, no rows written):

| # | probe | executed | result |
|---|---|---|---|
| P1 | unknown user, no session → REFUSED / NO_TENANT_AUTHORITY | ✅ 2026-08-02 | `{"resolution":{"status":"REFUSED","reason":"NO_TENANT_AUTHORITY"},"active_cid":null,"memberships":[],"v2_shadow":{"match_state":"UNMAPPED"}}` |
| P2 | supplied session that does not exist → REFUSED / INVALID_SESSION, no fallback | ✅ 2026-08-02 | `{"resolution":{"status":"REFUSED","reason":"INVALID_SESSION"},"active_cid":null}` |

The remaining probes require session rows. `public.tenant_session_context` currently holds
**0 rows**, so they cannot be executed without writing test data — out of scope for A3.1
(no data change). They are **NOT PROVEN** today.

| # | probe | setup | required outcome | status |
|---|---|---|---|---|
| P3 | foreign session | session row owned by user B; call with user A + that session_id | `REFUSED` / `INVALID_SESSION`, `active_cid` null | NOT PROVEN |
| P4 | expired session | own session with `expires_at < now()` | `REFUSED` / `INVALID_SESSION` | NOT PROVEN |
| P5 | revoked session | own session with `revoked_at` set | `REFUSED` / `INVALID_SESSION` | NOT PROVEN |
| P6 | no fallback after invalid session | user with exactly ONE active membership + an invalid supplied session | `REFUSED`, `active_cid` null — must **not** auto-select the single membership | NOT PROVEN |
| P7 | fleet-only separation | user in `fleet_operators` (ACTIVE) with zero `tenant_members` rows | `OK` / `FLEET_ONLY`, `memberships` `[]`, `active_cid` null, `fleet_role` set | NOT PROVEN (2 fleet rows exist; membership overlap not verified) |
| P8 | workspace-only exclusion | user in `workspace_members` only | `REFUSED` / `NO_TENANT_AUTHORITY`; `workspace_roles` populated but never promoted to tenant/fleet authority | NOT PROVEN |
| P9 | v2_shadow always UNMAPPED | any caller | `v2_shadow.match_state = 'UNMAPPED'` unconditionally until an immutable bridge table exists | PARTIALLY PROVEN (P1, P2 both returned `UNMAPPED`) |
| P10 | egress rule | any caller | no email, issuer, provider_subject, principal_id, membership_id in the payload | PROVEN by inspection of P1/P2 payload shape |

Probe form:

```sql
select public.resolve_hq_authority_v1('<auth_user_id>'::uuid, '<session_id>');
```

Executed as `service_role` only. `PUBLIC`, `anon`, `authenticated` have no EXECUTE grant.
