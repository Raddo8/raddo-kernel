// supabase/functions/mcp-gateway/index.ts
//
// Interim Supabase-only MCP gateway · stands in for the production
// Cloudflare Worker at mcp.chiefofbusiness.ai. Lets SPINNEY test the
// Claude custom-connector handshake without DNS or Cloudflare.
//
// Responsibilities:
//   1. Serve RFC 9728 protected-resource metadata at
//      /.well-known/oauth-protected-resource (resource = this gateway's
//      own URL; authorization_servers = Jake-owned Supabase AS).
//   2. Serve /.well-known/oauth-authorization-server (RFC 8414) inline with
//      canonical endpoint URLs on the real AS rnjqpwmzmbnnaonppfkm.
//   3. Reverse-proxy every other request to the mcp-council Edge Function
//      on this same project, forwarding Authorization + body untouched.
//   4. On upstream 401, inject WWW-Authenticate with resource_metadata=
//      pointing at this gateway's own well-known, so MCP clients can
//      self-discover the AS and run DCR + PKCE.
//
// verify_jwt is false (set in supabase/config.toml) — the function does
// its own auth handling by proxying to mcp-council, which validates the
// OAuth JWT against the AS JWKS.

const GATEWAY_URL =
  "https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/mcp-gateway";
const UPSTREAM_URL =
  "https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/mcp-council";
const AS_BASE = "https://rnjqpwmzmbnnaonppfkm.supabase.co";
const AS_ISSUER = `${AS_BASE}/auth/v1`;
const AS_METADATA = {
  issuer: AS_ISSUER,
  authorization_endpoint: `${AS_ISSUER}/authorize`,
  token_endpoint: `${AS_ISSUER}/token`,
  jwks_uri: `${AS_ISSUER}/.well-known/jwks.json`,
  userinfo_endpoint: `${AS_ISSUER}/userinfo`,
  registration_endpoint: `${AS_ISSUER}/register`,
  scopes_supported: ["openid", "profile", "email", "phone", "mcp:council"],
  response_types_supported: ["code"],
  response_modes_supported: ["query"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256", "HS256", "ES256"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
  claims_supported: [
    "sub",
    "aud",
    "iss",
    "exp",
    "iat",
    "auth_time",
    "nonce",
    "email",
    "email_verified",
    "phone_number",
    "phone_number_verified",
    "name",
    "picture",
    "preferred_username",
    "updated_at",
  ],
  code_challenge_methods_supported: ["S256", "plain"],
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-session-id, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function getPath(req: Request): string {
  // Normalize path so /.well-known/* matches regardless of whether the
  // runtime exposes the URL as /mcp-gateway/... or /functions/v1/mcp-gateway/...
  const url = new URL(req.url);
  let p = url.pathname;
  for (const prefix of ["/functions/v1/mcp-gateway", "/mcp-gateway"]) {
    if (p === prefix) return "/";
    if (p.startsWith(prefix + "/")) { p = p.slice(prefix.length); break; }
  }
  if (!p) p = "/";
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const path = getPath(req);

  // RFC 8414 · AS discovery. Serve INLINE as 200 JSON (not a 302). Do not
  // rewrite these endpoints to the gateway host and do not strip /auth/v1;
  // Claude follows these values literally during authorize/token/DCR.
  if (path === "/.well-known/oauth-authorization-server") {
    return new Response(JSON.stringify(AS_METADATA, null, 2), {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  // RFC 9728 · Protected-resource metadata.
  if (path === "/.well-known/oauth-protected-resource") {
    const body = {
      resource: GATEWAY_URL,
      authorization_servers: [AS_ISSUER],
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

  // Reverse-proxy everything else to mcp-council. Strip hop-by-hop headers;
  // preserve Authorization + body unchanged.
  const fwdHeaders = new Headers();
  for (const [k, v] of req.headers) {
    const lk = k.toLowerCase();
    if (lk === "host" || lk === "x-forwarded-host" || lk.startsWith("cf-")) continue;
    fwdHeaders.set(k, v);
  }

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: req.method,
      headers: fwdHeaders,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      redirect: "manual",
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "upstream_unavailable", detail: String(e) }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const respHeaders = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);

  // Inject discovery hint on 401 if upstream didn't already point at this
  // gateway's resource-metadata URL.
  if (upstream.status === 401) {
    const existing = respHeaders.get("WWW-Authenticate") ?? "";
    if (!/resource_metadata=/i.test(existing)) {
      respHeaders.set(
        "WWW-Authenticate",
        `Bearer realm="cob-council", error="invalid_token", resource_metadata="${GATEWAY_URL}/.well-known/oauth-protected-resource"`,
      );
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
});
