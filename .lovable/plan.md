# Legal Seat: add LEXI, reconcile KNOX

Scope: `supabase/functions/mcp-council/` only. No DB schema changes (no tenants table exists yet — seats and context live in code, ejectable to DB later).

## 1. Tenant context + legal-seat map (new file)

Create `supabase/functions/mcp-council/tenants.ts`:

- `LEGAL_SEAT_BY_TENANT: Record<string,"lexi"|"knox">` with `SPINNEY: "knox"`. Default `"lexi"` for any tenant not listed.
- `TENANT_CONTEXT: Record<string, { client: string; principal: string; principal_values: string; active_matters: string; bearing_default: string }>` — seed entry for SPINNEY. Default for unlisted tenants returns degraded-but-readable strings, not the literal word "unspecified", e.g.:
  - `client`: "the principal's company (capture at onboarding)"
  - `principal`: "the principal (capture at onboarding)"
  - `principal_values`: "the principal's stated values (capture at onboarding)"
  - `active_matters`: "no active matters on file (capture at onboarding)"
  - `bearing_default`: "85/60"
- `getLegalSeat(tenant)` and `getTenantContext(tenant)` helpers.

## 2. Tenant source — security gate (must-fix)

Tenant MUST be sourced exclusively from the validated identity:

- Static SPINNEY bearer path → `tenant = "SPINNEY"` (already so).
- OAuth path → `tenant = identity.tenant` (= verified `app_metadata.tenant` from `verifySupabaseJwt`, ES256, iss+exp checked). Already so in `auth.ts`.
- Hard rule, enforced and commented in `index.ts`: `tenant` is NEVER read from `req.json()` body, tool `arguments`, query string, or any client-controlled header. No `args.tenant`, no `X-Tenant`, no override path.
- Add an inline comment in `index.ts` next to the tenant assignment stating this invariant so future edits don't regress.

## 3. Registry update

`supabase/functions/mcp-council/agents/manifest.ts`:

- Add `lexi` (`name: "LEXI"`, `lens: "Legal & compliance advisory"`, `kind: "single"`).
- Keep `knox` as-is (lens `"Legal & compliance intelligence"`).
- Add `listSeatedAgentsPublic(tenant)` — returns the public roster filtered so only the seated legal advisor of `{lexi, knox}` is included.

## 4. New persona files

- `agents/lexi.ts` — runtime system prompt per spec §6, with `{{CLIENT}} / {{PRINCIPAL}} / {{PRINCIPAL_VALUES}} / {{ACTIVE_MATTERS}}` placeholders. Same JSON output contract as other single agents (`agent / assessment / recommendation / risk_flags / severity / confidence / escalation / signature`) so `validateSingleMinute` works unchanged.
- `agents/knox.ts` — **replace** body with the reconciled persona per spec §5, adding `{{BEARING_DEFAULT}}` placeholder. Same JSON output contract.

Both files: `// Auto-bundled. Server-only. Never echoed to clients.` header and `export default String.raw\`...\`` shape.

## 5. Tenant-context injection in `index.ts`

- Add `renderTenantPlaceholders(body, ctx)` that substitutes `{{CLIENT}}`, `{{PRINCIPAL}}`, `{{PRINCIPAL_VALUES}}`, `{{ACTIVE_MATTERS}}`, `{{BEARING_DEFAULT}}` from `getTenantContext(tenant)`. Missing fields fall back to the degraded strings in §1 (never a bare "unspecified" in the middle of a sentence).
- Extend `loadAgent(id, clientContext, tenant)` to add `lexi` to `SINGLE_BODIES` and run the body through `renderTenantPlaceholders` before composing the final system prompt.

## 6. Legal-seat enforcement in tool handlers

In `index.ts` `tools/call`:

- **`show_council`**: call `listSeatedAgentsPublic(tenant)` so the response shows exactly one of `{LEXI, KNOX}` per tenant.
- **`consult_advisor`**: before `loadAgent`, if `agentId` ∈ `{"lexi","knox"}` and ≠ `getLegalSeat(tenant)`, silently remap to the seated id. `console.log("legal_id_remap", { from, to, tenant })` server-only. No error, no client-visible signal. This is operator-loop by design — LEXI persona may recommend escalating to KNOX, but runtime stays on LEXI until the operator flips the entitlement.
- **`convene_council`**: add the seated legal advisor as a 6th chair.
  - `runCouncil(question, context, clientContext, tenant)`: load seated legal body via `loadAgent(seatedId, clientContext, tenant)` to get tenant placeholders rendered, then build `chairs = [...CHAIRS, { name: seatedName, system: <preamble + rendered legal body + approach principles> }]`.
  - **Chair-shape compatibility (#2):** the persona files in `agents/{knox,lexi}.ts` define the single-advisor JSON output. For Stage-1 chair use, override the output instruction by appending a chair-mode addendum to the system prompt: "**Council mode (override output spec):** Contribute ONLY your legal lens as a chair would — 2–5 tight prose points covering exposure, the safeguard, and the escalation call. Do NOT emit JSON. Leo synthesizes the final minute." This keeps Stage-1 prose-shaped so Leo's Stage-2 horizon and Opus Stage-3 synthesis (which expect free-text chair contributions) work unchanged.
  - Update `validateMinute` to set `participating_chairs = ["Leo","Spock","Alfred","Iroh","Lucius", seatedName]` dynamically (no longer hard-coded).
  - `file_to_office` inherits via the same `runCouncil` path.

## 7. Cost note (decision, not a surprise)

Adding a 6th chair adds one Sonnet call per `convene_council` / `file_to_office` — roughly +20% per convene. Captured here so it's an explicit, accepted cost of putting legal in the room every time. Not gated; not configurable in this slice.

## 8. Out of scope (called out, not done)

- SPINNEY_AGENT_MANIFEST.md doc reconciliation (spec §4 marks "tracked separately, not blocking").
- DB `tenants` table — deferred per Phase-1/Phase-2 doctrine.
- Operator UI for switching seats — entitlement is in-code for now.

## Files touched

- new: `supabase/functions/mcp-council/tenants.ts`
- new: `supabase/functions/mcp-council/agents/lexi.ts`
- edit: `supabase/functions/mcp-council/agents/knox.ts` (full body replace)
- edit: `supabase/functions/mcp-council/agents/manifest.ts` (add lexi, add seated-roster helper)
- edit: `supabase/functions/mcp-council/index.ts` (tenant placeholder render, loadAgent signature, tenant-only-from-JWT comment, show_council/consult_advisor/runCouncil tenant-aware, chair-mode addendum)

## Acceptance verification (after deploy)

Via `supabase--curl_edge_functions` against `/mcp-council`:

1. Static SPINNEY bearer → `show_council` lists KNOX, no LEXI.
2. Static SPINNEY bearer → `consult_advisor("lexi", …)` returns a KNOX minute (silent remap, server-side log line).
3. OAuth token for a non-SPINNEY tenant → roster shows LEXI only; `consult_advisor("knox", …)` returns a LEXI minute. (If no non-SPINNEY OAuth fixture is available, temporarily map a test tenant to `"lexi"` for the curl, then revert.)
4. `convene_council` minute includes the seated legal advisor in `participating_chairs`; output JSON parses cleanly (proves chair-mode override worked — Stage-1 legal wasn't JSON that broke Leo).
5. **Security:** a token whose `app_metadata.tenant = "ACME"` calling `show_council` with `{"tenant":"SPINNEY"}` in the JSON-RPC arguments or an `X-Tenant: SPINNEY` header still returns the ACME (default-LEXI) roster, never SPINNEY's. No path to spoof.
