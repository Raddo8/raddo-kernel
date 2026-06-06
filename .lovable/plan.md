
# Phase 2B · OAuth AS + client-registerable MCP connector

## STEP 0 verdict (research, not a step to build)

**Path: Supabase-native OAuth 2.1 AS.** Public beta went live 2025-11-26 with explicit MCP authentication support: PKCE, `/.well-known/oauth-authorization-server`, Dynamic Client Registration (DCR), JWKS, refresh-token rotation. Discovery doc is hosted at `https://vacpgxxgdfhgvkduljgs.supabase.co/.well-known/oauth-authorization-server/auth/v1`. This is the path Anthropic/Claude custom connectors expect. Stytch fallback is **not** needed.

Source: Supabase docs · `Auth → OAuth 2.1 Server → MCP Authentication` and `OAuth 2.1 Server Capabilities` changelog (Nov 26, 2025: "Public beta is live now").

Reported up front per the dispatch's STEP 0 gate.

## What Lovable builds vs. what needs operator action

**Lovable (this build):**
- Edge-function changes in `mcp-council` (JWT validation, tenant resolution, security cleanup)
- Cloudflare Worker source + wrangler config checked into the repo at `edge/mcp-proxy/`
- `/.well-known/oauth-protected-resource` JSON (served by the Worker; points clients at the Supabase AS)
- Docs + DNS instructions in `docs/PHASE_2B_DEPLOY.md`

**Operator (out of Lovable's reach, called out explicitly):**
- Toggle **Authentication → OAuth Server** ON in the Supabase project, enable **Dynamic Client Registration**, set consent screen copy
- Deploy the Worker (`wrangler deploy`) and bind the route to `mcp.chiefofbusiness.ai/*`
- Add the `CNAME mcp → <worker>.workers.dev` record (proxy off) at the DNS registrar
- Register the connector in a test Claude/Cowork account and run the handshake

Lovable cannot toggle the OAuth server, cannot create Cloudflare Workers, and cannot edit DNS. The build will be inert until the operator completes those three.

## STEP 1 · Authorization Server (operator toggle; we document)

Nothing to author in our codebase — the AS is `https://vacpgxxgdfhgvkduljgs.supabase.co/auth/v1` once the toggle is on. We write the operator runbook only (see `docs/PHASE_2B_DEPLOY.md` below) so the Cowork/Claude side knows where to discover.

Tenant identity: each end-user authenticates as themselves (a Supabase Auth user). Tenant assignment is derived server-side from `app_metadata.tenant` on that user; we add a `profiles.tenant` mirror later if needed. For 2B's SPINNEY proof, the single seeded operator user has `app_metadata.tenant = "SPINNEY"`.

## STEP 2 · `mcp.chiefofbusiness.ai` Cloudflare Worker proxy

New folder `edge/mcp-proxy/`:

- `wrangler.toml` — name `cob-mcp-proxy`, route `mcp.chiefofbusiness.ai/*`, compatibility date 2026-06-01.
- `src/index.ts` — minimal Worker:
  - `GET /.well-known/oauth-authorization-server` → 302 to `https://vacpgxxgdfhgvkduljgs.supabase.co/.well-known/oauth-authorization-server/auth/v1` (Anthropic clients follow redirects per RFC 8414).
  - `GET /.well-known/oauth-protected-resource` → static JSON `{ resource: "https://mcp.chiefofbusiness.ai/", authorization_servers: ["https://vacpgxxgdfhgvkduljgs.supabase.co/auth/v1"], bearer_methods_supported: ["header"], scopes_supported: ["mcp:council"] }` per RFC 9728.
  - Any other path (incl. `POST /`) → reverse-proxy to `https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/mcp-council`, forwarding method/headers/body unchanged, stripping `cf-*` headers, and on 401 adding `WWW-Authenticate: Bearer resource_metadata="https://mcp.chiefofbusiness.ai/.well-known/oauth-protected-resource"` so MCP clients can self-discover the AS.

DNS: `CNAME mcp cob-mcp-proxy.<account>.workers.dev` (proxy OFF — Worker route handles TLS via Cloudflare for SaaS or the workers.dev cert). Documented in the runbook; not auto-applied.

## STEP 3 · `mcp-council` accepts OAuth JWTs (token validator)

In `supabase/functions/mcp-council/index.ts`, replace the single bearer gate with a dual-mode validator:

```text
1. Read Authorization: Bearer <token>
2. If token === COUNCIL_TENANT_TOKEN_SPINNEY → tenant = "SPINNEY" (legacy curl path, kept for regression)
3. Else verify as Supabase JWT:
   - fetch + cache JWKS from https://<ref>.supabase.co/auth/v1/.well-known/jwks.json (60-min TTL)
   - verify RS256/ES256 signature, exp, iat, iss=https://<ref>.supabase.co/auth/v1
   - require aud contains "https://mcp.chiefofbusiness.ai/" (the protected-resource id) OR scope contains "mcp:council"
   - tenant := app_metadata.tenant (string); reject if missing → 401 invalid_token
4. On any failure → 401 with WWW-Authenticate: Bearer error="invalid_token", resource_metadata="https://mcp.chiefofbusiness.ai/.well-known/oauth-protected-resource"
```

New file `supabase/functions/mcp-council/auth.ts` holds JWKS fetch/cache + `verifySupabaseJwt(token)` returning `{ tenant, sub, scope }`. Uses Deno's built-in `crypto.subtle` (no new deps).

Tenant is then threaded into `runCouncil` / `runSingleAgent` / `recordMcpUsage` in place of the hard-coded `"SPINNEY"` literal. SPINNEY remains the only seeded tenant; other tenant values are accepted but route to the same OFFICE until 3+.

## STEP 4 · Security cleanup (`_client_context` hardening)

Two-line discipline change in the `tools/call` handler:

- When the request is OAuth-authenticated, **ignore** any incoming `_client_context` field entirely (`clientContext = ""`). The Standing Context Refresh, when wired in Phase 2/3, will populate the slot server-side from the verified tenant only.
- When the request is on the legacy static-bearer SPINNEY path, **still** accept `_client_context` (gated by a new env `COUNCIL_ALLOW_TEST_CONTEXT=1`, default off in prod) so curl validation of the Tier-1 seam keeps working during the transition. Without the env, the field is dropped on both paths.

This removes the OAuth-side prompt-injection surface without losing the curl seam.

## STEP 5 · Register + prove (operator runs, we document)

`docs/PHASE_2B_DEPLOY.md` walks the operator through:
1. Supabase: enable OAuth Server, enable DCR, consent copy.
2. Create one Supabase Auth user; set `app_metadata.tenant = "SPINNEY"` via SQL.
3. Deploy Worker (`cd edge/mcp-proxy && wrangler deploy`).
4. Add the CNAME; verify `curl https://mcp.chiefofbusiness.ai/.well-known/oauth-protected-resource` returns the JSON.
5. In Claude.ai → Custom Connectors → Add → URL `https://mcp.chiefofbusiness.ai/`. Confirm discovery → consent → PKCE → token → `cob_run_council` returns a minute.
6. Regression `curl` with `Authorization: Bearer $COUNCIL_TENANT_TOKEN_SPINNEY` still works.
7. Negative: random bearer → 401 with `invalid_token` and `WWW-Authenticate` pointing at the resource-metadata URL.

## Acceptance gates (mirrored from dispatch)

- STEP 0 verdict reported above (Supabase-native).
- `/.well-known/*` reachable at `mcp.chiefofbusiness.ai` — verified after operator DNS+Worker.
- Full OAuth handshake completes through Claude custom connector — verified by operator.
- Unauthorized / bad-token → 401 `invalid_token`, no body leakage — covered by validator.
- `_client_context` ignored on OAuth path; gated behind env on legacy path.
- Static-bearer SPINNEY curl + Notion write-back unchanged — same code path, just an additional branch above it.

## Files

- ADD `supabase/functions/mcp-council/auth.ts` (JWKS + JWT verifier)
- MODIFY `supabase/functions/mcp-council/index.ts` (dual-mode auth, tenant threading, `_client_context` gating, 401 `WWW-Authenticate` with resource-metadata pointer)
- ADD `edge/mcp-proxy/wrangler.toml`
- ADD `edge/mcp-proxy/src/index.ts`
- ADD `edge/mcp-proxy/README.md`
- ADD `docs/PHASE_2B_DEPLOY.md` (operator runbook · STEPs 1, 2, 5)

## Out of scope (per dispatch)

Per-tenant entitlements + Stripe (Phase 3) · real customer data + Jake-owned Supabase eject (Phase 4) · multi-client OFFICE provisioning · Standing Context Refresh wiring of `<<CLIENT_CONTEXT>>`.

## Operator hand-off note

After the build lands, Lovable will post the runbook path and the exact strings needed (Supabase project ref, AS discovery URL, Worker route). The handshake itself requires the three operator actions above before any connector test can pass.
