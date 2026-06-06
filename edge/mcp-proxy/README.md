# cob-mcp-proxy · Cloudflare Worker

Serves `mcp.chiefofbusiness.ai`:

- `/.well-known/oauth-authorization-server` → 302 to the Supabase AS discovery doc.
- `/.well-known/oauth-protected-resource` → RFC 9728 JSON pointing at the Supabase AS.
- Everything else → reverse-proxied to the `mcp-council` Supabase Edge Function. On upstream `401`, the worker adds a `WWW-Authenticate` header with the resource-metadata pointer so MCP clients can self-discover the AS.

## Deploy

```bash
cd edge/mcp-proxy
npm i -g wrangler   # if needed
wrangler login
wrangler deploy
```

## DNS

At the registrar for `chiefofbusiness.ai`:

```
CNAME  mcp  cob-mcp-proxy.<account>.workers.dev    # proxy OFF if you go through Cloudflare DNS
```

If the zone is on Cloudflare, the `routes` block in `wrangler.toml` will bind the route automatically once the zone is added to the same account.

## Verify

```bash
curl -i https://mcp.chiefofbusiness.ai/.well-known/oauth-protected-resource
curl -i https://mcp.chiefofbusiness.ai/.well-known/oauth-authorization-server
```

The first returns the RFC 9728 JSON; the second 302s to the Supabase discovery doc.
