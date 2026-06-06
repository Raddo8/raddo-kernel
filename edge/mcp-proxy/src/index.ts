// edge/mcp-proxy/src/index.ts
//
// Cloudflare Worker · mcp.chiefofbusiness.ai
//
// Three jobs:
//   1. Serve RFC 9728 protected-resource metadata at
//      /.well-known/oauth-protected-resource (points clients at Supabase AS).
//   2. Redirect /.well-known/oauth-authorization-server to the Supabase
//      discovery doc (RFC 8414).
//   3. Reverse-proxy every other request to the mcp-council Edge Function,
//      forwarding method/headers/body unchanged. On upstream 401, inject
//      WWW-Authenticate with the resource_metadata pointer so MCP clients
//      can self-discover the AS and run the OAuth handshake.

export interface Env {
  UPSTREAM_URL: string;
  AS_DISCOVERY_URL: string;
  RESOURCE_ID: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-session-id, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: CORS });
    }

    // RFC 8414 · AS discovery → redirect to the Supabase discovery doc.
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return Response.redirect(env.AS_DISCOVERY_URL, 302);
    }

    // RFC 9728 · Protected-resource metadata.
    if (url.pathname === "/.well-known/oauth-protected-resource") {
      const body = {
        resource: env.RESOURCE_ID,
        authorization_servers: [env.AS_DISCOVERY_URL.replace(/\/\.well-known\/.*$/, "/auth/v1")],
        bearer_methods_supported: ["header"],
        scopes_supported: ["mcp:council"],
        resource_documentation: "https://chiefofbusiness.ai",
      };
      return new Response(JSON.stringify(body, null, 2), {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // Reverse-proxy everything else to mcp-council. Strip Cloudflare
    // hop-by-hop headers; preserve Authorization + body.
    const fwdHeaders = new Headers();
    for (const [k, v] of req.headers) {
      const lk = k.toLowerCase();
      if (lk.startsWith("cf-") || lk === "host" || lk === "x-forwarded-host") continue;
      fwdHeaders.set(k, v);
    }

    const upstream = await fetch(env.UPSTREAM_URL, {
      method: req.method,
      headers: fwdHeaders,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      redirect: "manual",
    });

    const respHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);

    // Inject discovery hint on 401 if upstream did not already provide one
    // pointing at the resource-metadata URL.
    if (upstream.status === 401) {
      const existing = respHeaders.get("WWW-Authenticate") ?? "";
      if (!/resource_metadata=/i.test(existing)) {
        respHeaders.set(
          "WWW-Authenticate",
          `Bearer realm="cob-council", error="invalid_token", resource_metadata="${env.RESOURCE_ID}.well-known/oauth-protected-resource"`,
        );
      }
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  },
};
