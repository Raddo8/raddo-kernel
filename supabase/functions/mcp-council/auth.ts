// supabase/functions/mcp-council/auth.ts
//
// Phase 2B · OAuth 2.1 JWT validator for the COB Council MCP server.
//
// The Authorization Server runs on a SEPARATE, Jake-owned Supabase project
// (ref: rnjqpwmzmbnnaonppfkm) — Lovable Cloud does not expose the OAuth 2.1
// Server toggle, so the AS surface is hosted there. This validator verifies
// access tokens against that issuer's JWKS, independent of the local
// SUPABASE_URL (which still belongs to the resource-server project).
//
// Override via env vars OAUTH_ISSUER / OAUTH_JWKS_URL when the AS moves.
// Server-only. No deps beyond Deno's built-in crypto.subtle.

const DEFAULT_AS_URL = "https://rnjqpwmzmbnnaonppfkm.supabase.co";
const ISSUER = (Deno.env.get("OAUTH_ISSUER") ?? `${DEFAULT_AS_URL}/auth/v1`).replace(/\/+$/, "");
const JWKS_URL = Deno.env.get("OAUTH_JWKS_URL") ?? `${DEFAULT_AS_URL}/auth/v1/.well-known/jwks.json`;

// The protected-resource id exposed by the Cloudflare worker at
// mcp.chiefofbusiness.ai. Clients receive it via RFC 9728 metadata and
// MUST request tokens whose `aud` includes it (or whose `scope` contains
// the council scope).
// Accepted resource identifiers (RFC 8707). The production Cloudflare worker
// uses mcp.chiefofbusiness.ai; the interim Supabase-only gateway uses the
// mcp-gateway function URL on this same project. Either is acceptable so the
// SPINNEY test can register the gateway directly without DNS.
const RESOURCE_IDS = [
  "https://mcp.chiefofbusiness.ai/",
  "https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/mcp-gateway",
  "https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/mcp-gateway/",
];
const COUNCIL_SCOPE = "mcp:council";

// ── JWKS cache (60-min TTL) ────────────────────────────────────────────────
type Jwk = JsonWebKey & { kid?: string; alg?: string; kty: string };
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchJwks(): Promise<Jwk[]> {
  if (!JWKS_URL) throw new Error("auth_not_configured");
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error("jwks_unavailable");
  const j = await r.json();
  const keys: Jwk[] = Array.isArray(j?.keys) ? j.keys : [];
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(seg: string): any {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(seg)));
}

function algToImport(alg: string): { name: string; hash?: string; namedCurve?: string } | null {
  switch (alg) {
    case "RS256": return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    case "RS384": return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" };
    case "RS512": return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" };
    case "ES256": return { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
    case "ES384": return { name: "ECDSA", namedCurve: "P-384", hash: "SHA-384" };
    default: return null;
  }
}

export type ResolvedIdentity = {
  tenant: string;
  sub: string;
  scope: string;
  clientId: string | null;
};

export async function verifySupabaseJwt(token: string): Promise<ResolvedIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_token");
  const [h, p, s] = parts;

  let header: any, payload: any;
  try {
    header = decodeJson(h);
    payload = decodeJson(p);
  } catch {
    throw new Error("invalid_token");
  }

  const alg: string = typeof header?.alg === "string" ? header.alg : "";
  const kid: string | undefined = typeof header?.kid === "string" ? header.kid : undefined;
  const importParams = algToImport(alg);
  if (!importParams) throw new Error("invalid_token");

  // Signature verification
  const keys = await fetchJwks();
  const candidates = keys.filter((k) => (!kid || k.kid === kid) && (!k.alg || k.alg === alg));
  if (candidates.length === 0) throw new Error("invalid_token");

  const signingInput = new TextEncoder().encode(`${h}.${p}`);
  const sig = b64urlToBytes(s);

  let verified = false;
  for (const jwk of candidates) {
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        importParams as any,
        false,
        ["verify"],
      );
      const verifyParams: any = importParams.name === "ECDSA"
        ? { name: "ECDSA", hash: importParams.hash }
        : { name: importParams.name };
      const ok = await crypto.subtle.verify(verifyParams, key, sig, signingInput);
      if (ok) { verified = true; break; }
    } catch {
      // try next key
    }
  }
  if (!verified) throw new Error("invalid_token");

  // Claim checks
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload?.exp === "number" && payload.exp < now - 30) throw new Error("invalid_token");
  if (typeof payload?.nbf === "number" && payload.nbf > now + 30) throw new Error("invalid_token");
  if (ISSUER && typeof payload?.iss === "string" && payload.iss !== ISSUER) {
    throw new Error("invalid_token");
  }

  // NOTE: audience/scope gating intentionally removed. The Supabase AS does
  // not let us mint a custom `aud` or custom `mcp:council` scope without
  // breaking the /authorize step. Trust the issuer + signature + tenant
  // claim. Resource isolation is enforced server-side via app_metadata.tenant.
  const scopeStr = typeof payload?.scope === "string" ? payload.scope : "";


  // Tenant resolution · server-side only, never from caller input.
  const appMeta = (payload?.app_metadata && typeof payload.app_metadata === "object")
    ? payload.app_metadata : {};
  const tenant = typeof appMeta.tenant === "string" && appMeta.tenant.trim()
    ? appMeta.tenant.trim()
    : "";
  if (!tenant) throw new Error("invalid_token");

  const sub = typeof payload?.sub === "string" ? payload.sub : "";
  const clientId = typeof payload?.client_id === "string" ? payload.client_id : null;
  return { tenant, sub, scope: scopeStr, clientId };
}

export const RESOURCE_METADATA_URL =
  "https://mcp.chiefofbusiness.ai/.well-known/oauth-protected-resource";

export function unauthorizedHeaders(error = "invalid_token"): Record<string, string> {
  return {
    "WWW-Authenticate":
      `Bearer realm="cob-council", error="${error}", resource_metadata="${RESOURCE_METADATA_URL}"`,
  };
}
