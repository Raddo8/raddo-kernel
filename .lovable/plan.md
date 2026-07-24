## Answer · advisor roster source in `mcp-council`

### 1. Source of the roster (per tenant)
There is **no per-tenant roster** today. The roster is a **code-level global** compiled into the `mcp-council` edge function. Nothing in the DB, no env/secret, and no `mcp-proxy` config participates in choosing advisors.

Three code sites, all in `supabase/functions/mcp-council/`:

- **Enabled advisor registry** — `agents/manifest.ts` `AGENT_MANIFEST.agents[]`. Global list of 9 entries (council, knox, lucius, leo, alfred, marcus, felix, aims; abe is deferred via `abe_weighing_in`). Every entry has `tier_min: "any"` and `enabled: true` — no tenant field exists on the entry.
- **Synchronous convene fan-out** — `index.ts` L103 `const CHAIRS = [leo, alfred, marcus, lucius, aims]` (+ Knox appended as `legalChair` at L802). Hard-coded 6-chair board, identical for every tenant.
- **Single-agent bodies** — `index.ts` `loadAgent()` L189, `SINGLE_BODIES` map (knox/lucius/leo/alfred/marcus/felix/aims) → each body is the imported `*_MD` string from `agents/*.ts` (and `council/*.ts` for convene chairs). Persona content is a bundled markdown constant, not tenant-scoped.

**Models** are also global constants in `index.ts` (`MODEL_CHAIR = "claude-sonnet-4-5"`, `MODEL_SYNTHESIS = "claude-opus-4-5"`) with provider overrides in `providers.ts` (`abe → openai gpt-4o`, dissent → `gpt-5`). No per-tenant model selection.

**Tenant-scoped data** is limited to *placeholder substitution* only, via `tenants.ts :: getTenantContext(tenant)` and `getNotionTarget(tenant)`. That injects `{{CLIENT}}`, `{{PRINCIPAL}}`, `{{PRINCIPAL_VALUES}}`, `{{ACTIVE_MATTERS}}`, `{{BEARING_DEFAULT}}`, `{{POSTURE}}` into the *same* shared persona bodies. It does not add, remove, or swap advisors.

`mcp-proxy` (`edge/mcp-proxy/src/index.ts`) has zero tenant/roster logic — pure JSON-RPC passthrough.

### 2. Shape

`AGENT_MANIFEST` entry (`agents/manifest.ts`):
```ts
interface AgentEntry {
  id: string; name: string; lens: string;
  tier_min: "any" | string; enabled: boolean;
  kind: "council" | "single";
  tags?: string[];                    // e.g. felix: ["growth"]
  eval_score?: number; eval_scored_at?: string;  // latent, unused
}
```

`CHAIRS` entry (`index.ts` L103):
```ts
{ id: "leo", name: "Leo", system: LEO_MD /* imported markdown */ }
```

`TENANT_CONTEXT` map (`tenants.ts` L25 · only tenant-shaped thing that exists):
```ts
Record<string, { client; principal; principal_values;
                 active_matters; bearing_default }>
```

### 3. Which tenants are "provisioned"

`TENANT_CONTEXT` in `tenants.ts` has exactly one key: **SPINNEY**. Everyone else falls through to `DEFAULT_CONTEXT` (readable "(capture at onboarding)" placeholders).

| Tenant | Roster provisioned? | Tenant context? |
|---|---|---|
| SPINNEY | yes (global roster) | yes (explicit) |
| COB-HQ  | yes (global roster) | no · default context |
| JAEL / JAEL-PWA | yes (global roster) | no · default context |
| ROC | yes (global roster) | no · default context |
| CAP | yes (global roster) | no · default context |

So the answer to "which tenants have rosters" is effectively **all authenticated tenants get the same global 6-chair roster**; only SPINNEY has custom placeholder text baked in.

Notion write targets are separate: `SPINNEY_NOTION_TOKEN + SPINNEY_BOARDROOM_DB` and `COB_HQ_NOTION_TOKEN + COB_HQ_BOARDROOM_DB` are set as secrets; JAEL/ROC/CAP have no `*_NOTION_TOKEN` / `*_BOARDROOM_DB` pair, so `file_to_office` fails closed with `office_not_configured` for those — but this is unrelated to the advisor roster.

### 4. Failure mode for a tenant "without a roster"

There is no such failure mode, because roster membership is not tenant-gated. Any request that clears the auth gate (`verifySupabaseJwt` returning `app_metadata.tenant`, or the static SPINNEY bearer) reaches identical roster code:

- **`show_council`** → `listSeatedAgentsPublic(tenant)` (`agents/manifest.ts` L121) ignores its `_tenant` arg and returns the global enabled roster. Always non-empty.
- **`convene_council`** → `runCouncil` fans out to the global `CHAIRS` + Knox. Persona bodies render with `DEFAULT_CONTEXT` placeholders ("the principal's company (capture at onboarding)" etc.) rather than empty strings. It runs to a normal minute.

The only *real* failure a tenant sees today is upstream at the auth gate: if the JWT is missing the `app_metadata.tenant` claim entirely, `verifySupabaseJwt` throws `invalid_token` → 401 → Claude reports "no tools available". Once a tenant claim exists (any string), the roster is served. This matches the earlier jake@818.capital diagnostic.

### Bottom line
Roster = hard-coded global in `agents/manifest.ts` + `index.ts CHAIRS` + `loadAgent SINGLE_BODIES`. Tenant only influences placeholder text (`tenants.ts`) and Notion write target. No DB or secret today controls which advisors exist for a given tenant.
