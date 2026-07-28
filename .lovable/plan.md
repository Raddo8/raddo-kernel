## Tenant-scoping audit · findings only, nothing changed

### Scope of the defect class
The dangerous combination is: a table with `cid` / `tenant` / `tenant_id`, an RLS policy whose qualifier is `is_cob_operator()` (full cross-tenant visibility), and a client read with no effective-tenant predicate. Confirmed via `pg_policies` and a full `src/` sweep.

Only **five** public tables carry both a tenant column and an `is_cob_operator()` policy: `surface_pin`, `surface_version`, `tenants` (see note), `tenant_members`, `tenant_alias`, `client_intake`, `onboarding_progress`, `code_redemptions`. Every other tenant-column table is scoped by `auth.uid()`, by `is_onboarding_admin()`, or has no policy at all — so the operator-multiplicity failure mode cannot arise there from the client.

---

### FAIL-OPEN findings (wrong tenant's data could render)

**None remaining.** The only fail-open instance in the codebase was `src/lib/surface.ts:109` (`tenants` read feeding `window.TENANT_ID` / `window.CID` / `window.COB_NAME`), and it is now scoped by `.eq("cid", cid)`.

Note on `tenants`: it has **no** `is_cob_operator()` policy — its only SELECT policy is `t_self` (`cid = current_cid()`). So the original leak was narrower than assumed: an operator sees only their own tenant row through RLS. `.limit(1)` was still wrong (unscoped, arbitrary-row semantics), and the fix is correct defense in depth, but there was no live cross-tenant identity render.

---

### FAIL-CLOSED findings (blank/error, no leak)

1. **`src/lib/surface.ts:96` · `surface_version`** — `.eq("surface_key")` + `.eq("version")`, no tenant predicate, `.maybeSingle()`. Operator-reachable via `sv_operator: ALL is_cob_operator()`. `surface_version` has no `cid` column and `(surface_key, version)` is effectively unique, so multiplicity is unlikely but not structurally guaranteed. Fail-closed (`"no-version"`). Lowest severity finding in the file; left as instructed.

2. **`src/pages/SurfacesAdmin.tsx:196-197` · `surface_version`** — `.eq("id", …).maybeSingle()`, primary key. Intentionally cross-tenant; page is operator-gated (`is_cob_operator()` at line 81, `NotFound` otherwise). Not a defect.

---

### Pattern 2 · `.limit(1)` on tenant-scoped tables

- `src/lib/surface.ts` — removed (fixed).
- `src/components/DossierPanel.tsx:52`, `src/lib/work-orders.ts:54`, `src/lib/labels-context.tsx:106` — all `.limit(1)`, but against `contacts` / `work_orders` / `vertical_packs`, which are `workspace_id`-scoped, not `cid`-scoped, and each already carries an explicit `.eq("account_id" | "item_id" | "workspace_id", …)`. Out of the defect class.

No other `.limit(1)` on a `cid`/`tenant`/`tenant_id` table exists in `src/`.

---

### Pattern 3 · reads flowing into rendered identity

- `src/lib/surface.ts:57-72` `injectBootstrap` — the only place a tenant identifier is injected as a `window.*` global. Scope now established in the same function from `current_cid()`.
- `src/pages/SurfacesAdmin.tsx:118` `tenantName(cid)` — renders `display_name` for arbitrary cids from the operator-only `tenants` list. Deliberate operator tooling, gated. Not a defect.
- No page title, header, or nav string in `src/` is sourced from an unscoped tenant read.

---

### Pattern 4 · tenant identifier from URL / route / storage / prop

- No route param, query param, or storage key anywhere in `src/` supplies a `cid`. `useParams` occurrences (`ItemDetail`, `AccountDetail`, `PolicyDetail`, `PlaybookDetail`, `RespondPage`) carry row ids or a response token, all RLS-enforced server-side.
- `src/lib/workspace-context.tsx:63` reads an active `workspace_id` from `localStorage` and uses it in queries. Authorization is enforced server-side by `is_workspace_member()` in RLS, so a tampered value fails closed. Adjacent class, not the `cid` class, no action needed.
- `src/pages/SurfacesAdmin.tsx:75-77` — operator picks `singleCid` / `cohort` from component state and writes pins for those cids. Correct by design; server-side gate is `sp_operator`.

---

### Pattern 5 · effective tenant resolved more than once per render path

- **`src/lib/surface.ts`** — resolves `current_cid()` (line 83) and `is_cob_operator()` (line 115) in one path. Different questions, cannot disagree.
- **`src/pages/HqSurface.tsx` → `SurfaceFrame` → `loadSurface`** — single resolution. Clean.
- **`src/pages/StartGate.tsx:35`** uses `my_tenant()`; **`src/lib/surface.ts`** uses `current_cid()`. These are different resolvers with **different ordering**: `current_cid()` orders `role='operator'` first, `my_tenant()` takes an unordered `limit 1`. For any user belonging to more than one tenant, the two can legitimately disagree. They are not in the same render path today (gate vs. surface), so this is latent, not live — but it is the one real structural risk left in the inventory.

---

### Complete inventory · tenant-column tables with an `is_cob_operator()` policy

Unscoped client reads against these are dangerous by construction:

| Table | Tenant column | Operator policy |
|---|---|---|
| `surface_pin` | `cid` | `sp_operator` · ALL |
| `surface_version` | (none; joined via pin) | `sv_operator` · ALL |
| `tenant_members` | `cid` | `tm_operator` · ALL |
| `tenant_alias` | `cid` | `ta_operator` · ALL |
| `client_intake` | `cid` | `ci_operator` · ALL |
| `onboarding_progress` | `cid` | `op_operator` · ALL |
| `code_redemptions` | `cid` | `cr_operator` · SELECT |

Of these, only `surface_pin`, `surface_version` and `tenants` are read from `src/` at all. `tenant_members`, `tenant_alias`, `client_intake`, `onboarding_progress` and `code_redemptions` are currently reached only from edge functions, so no client-side exposure exists yet — they are the surfaces to guard when future UI touches them.

Tenant-column tables **without** an operator policy (safe from this class, listed for completeness): `blueprints`, `boot_log`, `bulletins`, `change_log`, `council_minutes`, `decisions`, `deletion_requests`, `directive_log`, `directives`, `document_registry`, `goals`, `improvement_signals`, `intake_facts`, `intake_files`, `intake_state`, `kernels`, `knowledge_files`, `mcp_usage_events`, `memory_entries`, `onboarding_escalations`, `onboarding_tenants`, `open_loops`, `ritual_runs`, `scheduled_actions`, `session_checkpoints`, `sessions`, `storyline`, `study_agents`, `study_skills`, `taylor_questions`, `tenant_offices`, `tenant_surfaces`, `tenants`.

---

### Next step (not executed)
No fixes proposed, per instruction. If you want remediation, the two candidates are: (a) scope the `surface_version` read behind the pin, and (b) collapse `my_tenant()` and `current_cid()` onto one resolver so the two can never disagree.
