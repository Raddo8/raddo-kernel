# PHASE 2B · Deploy runbook (operator)

Lovable shipped the code. Three operator actions are required before the
client-registerable connector handshake can succeed. None of these can be
done by Lovable — most importantly, **Lovable Cloud does not expose the
OAuth 2.1 Server toggle**, so the Authorization Server is hosted on a
SEPARATE, Jake-owned Supabase project. The Lovable Cloud project
(`vacpgxxgdfhgvkduljgs`) is the resource server only.

| Role              | Supabase project ref     | Surface                                                          |
| ----------------- | ------------------------ | ---------------------------------------------------------------- |
| Authorization Srv | `rnjqpwmzmbnnaonppfkm`   | `/auth/v1/*` · DCR · JWKS · consent screen · tenant user records |
| Resource server   | `vacpgxxgdfhgvkduljgs`   | `mcp-council` Edge Function (verifies tokens against AS JWKS)    |

## 1 · Enable OAuth 2.1 Server on the AS project

In the Supabase dashboard for project ref `rnjqpwmzmbnnaonppfkm`:

1. **Authentication → OAuth Server** → toggle **Enable** ON.
2. Toggle **Dynamic Client Registration** ON.
3. Set the consent screen application name to `COB Council` and the
   description to `Convene the COB Council from your AI client.`
4. Save.

Verify:

```bash
curl -s https://rnjqpwmzmbnnaonppfkm.supabase.co/.well-known/oauth-authorization-server/auth/v1 | jq
```

Should return the discovery doc with `authorization_endpoint`,
`token_endpoint`, `registration_endpoint`, `jwks_uri`, and
`code_challenge_methods_supported: ["S256"]`.

## 2 · Seed the SPINNEY operator user (on the AS project)

In the SQL editor of the AS project (`rnjqpwmzmbnnaonppfkm`):

```sql
-- Create the SPINNEY operator (one-time; replace email/password)
SELECT auth.uid();  -- after you sign in as the seeded user in the dashboard
-- OR create via dashboard → Authentication → Users → Add user

-- Stamp the tenant. Replace <user-id> with the new user's UUID.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                        || jsonb_build_object('tenant', 'SPINNEY')
WHERE id = '<user-id>';
```

The `app_metadata.tenant` claim is what `mcp-council` reads to scope
deliberation. Without it the token is rejected with `invalid_token`.

## 3 · Cloudflare Worker + DNS

```bash
cd edge/mcp-proxy
wrangler login
wrangler deploy
```

DNS at the `chiefofbusiness.ai` registrar (or Cloudflare DNS if the zone is
already on Cloudflare and the worker route auto-binds):

```
CNAME  mcp  cob-mcp-proxy.<account>.workers.dev
```

Verify:

```bash
curl -i https://mcp.chiefofbusiness.ai/.well-known/oauth-protected-resource
# 200 + JSON pointing at the Supabase AS

curl -i https://mcp.chiefofbusiness.ai/.well-known/oauth-authorization-server
# 302 → https://rnjqpwmzmbnnaonppfkm.supabase.co/.well-known/oauth-authorization-server/auth/v1
```

## 4 · Register the connector

In Claude.ai (or Cowork):

1. Settings → Custom Connectors → **Add custom connector**.
2. URL: `https://mcp.chiefofbusiness.ai/`
3. The client auto-discovers the AS, runs DCR, opens the Supabase consent
   screen, completes PKCE, and receives an access token.
4. Try `cob_run_council` with a real question. A structured minute should
   come back.

## 5 · Acceptance checks

- **Discovery:** both `.well-known` URLs resolve as above.
- **Handshake:** Claude connector goes through consent → token without
  manual paste; first tool call returns a minute.
- **Unauthorized:** `curl -i https://mcp.chiefofbusiness.ai/ -X POST -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'`
  returns `401` with `WWW-Authenticate: Bearer ... resource_metadata=...`.
- **Legacy bearer:** `curl` with `Authorization: Bearer $COUNCIL_TENANT_TOKEN_SPINNEY`
  still works against `https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/mcp-council`
  (and through the proxy).
- **Prompt-injection surface:** sending `_client_context` in a tools/call
  while authenticated with an OAuth JWT is silently dropped. The static
  bearer path only accepts it when `COUNCIL_ALLOW_TEST_CONTEXT=1` is set.

## Out of scope (Phase 2B)

Per-tenant entitlements + Stripe (Phase 3) · real customer data + Jake-owned
Supabase eject (Phase 4) · multi-client OFFICE provisioning · Standing
Context Refresh wiring of `<<CLIENT_CONTEXT>>`.
