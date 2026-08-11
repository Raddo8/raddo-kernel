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

// ── RESOURCE BINDING · NOT ENFORCED · read this before trusting it ─────────
// State of play, stated accurately so nobody reads a control into this file
// that does not exist:
//
//   VERIFIED on every request:  signature (JWKS, ES256/RS256), `exp`, `nbf`
//                               when present, `iss` (exact, required),
//                               non-empty `sub`.
//   NOT VERIFIED:               `aud`, `scope`, RFC 8707 `resource`, and the
//                               calling `client_id`.
//
// The consequence, said plainly: any token the Authorization Server project
// mints, for any purpose, is accepted here. There is no binding between a
// token and this resource. That is the confused-deputy exposure RFC 8707
// resource indicators exist to close.
//
// The two lists below are the identifiers we WOULD bind to. They are retained
// deliberately, and are referenced only by `recordClaimShape` below, which
// records what claims live tokens actually carry so the gate can be written
// against evidence rather than against a guess. Nothing here gates a request.
const RESOURCE_IDS = [
  "https://mcp.chiefofbusiness.ai/",
  "https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/mcp-gateway",
  "https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/mcp-gateway/",
];
const COUNCIL_SCOPE = "mcp:council";

// ── Rejection record ───────────────────────────────────────────────────────
// Every rejection below returns the same generic `invalid_token` to the
// caller · an attacker must never learn which check failed. The distinct
// reason goes to our record only.
export type AuthRejectReason =
  | "malformed"
  | "alg_unsupported"
  | "jwks_unavailable"
  | "no_matching_key"
  | "sig_invalid"
  | "exp_missing"
  | "exp_past"
  | "nbf_future"
  | "iss_missing"
  | "iss_mismatch"
  | "sub_missing"
  | "resource_mismatch";

// Fleet-level home for auth rejections · there is, by definition, no tenant
// on a rejected token. CID-100001 is the operator tenant.
const AUTH_SIGNAL_CID = Deno.env.get("AUTH_SIGNAL_CID") ?? "CID-100001";

async function signalAuthRejected(reason: AuthRejectReason, detail: string): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/rpc/cob_signal_raise`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        p_cid: AUTH_SIGNAL_CID,
        p_key: "auth-rejected",
        p_detail: `reason=${reason} · ${detail}`,
        p_tool: "mcp-council",
        p_surface: "connector:auth",
        p_subject: reason,
        p_link: { reason },
      }),
    });
  } catch { /* the record of a failure must never become a failure */ }
}

/** Reject with a named internal reason; the caller still sees `invalid_token`. */
function reject(reason: AuthRejectReason, detail = ""): never {
  void signalAuthRejected(reason, detail);
  throw new Error("invalid_token");
}

// EVIDENCE GATHERING · records the claim KEY NAMES a live token carries (never
// values), once per issuer/client shape, so the resource gate above can be
// written against what the AS actually mints. Fire-and-forget.
const seenShapes = new Set<string>();
async function recordClaimShape(payload: Record<string, unknown>): Promise<void> {
  try {
    const clientId = typeof payload.client_id === "string" ? payload.client_id : "(none)";
    const iss = typeof payload.iss === "string" ? payload.iss : "(none)";
    const shape = `${iss}|${clientId}|${Object.keys(payload).sort().join(",")}`;
    if (seenShapes.has(shape)) return;
    seenShapes.add(shape);
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const appMeta = (payload.app_metadata && typeof payload.app_metadata === "object")
      ? payload.app_metadata as Record<string, unknown>
      : {};
    await fetch(`${url}/rest/v1/connector_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        cid: AUTH_SIGNAL_CID,
        event: "auth_claim_shape",
        surface: "connector:auth",
        client_id: typeof payload.client_id === "string" ? payload.client_id : null,
        detail: {
          iss,
          claim_keys: Object.keys(payload).sort(),
          app_metadata_keys: Object.keys(appMeta).sort(),
          // The three places an RFC 8707 resource could surface. Values, not
          // just presence · this is the question the gate is waiting on.
          aud: (payload as any).aud ?? null,
          resource: (payload as any).resource ?? null,
          app_metadata_resource: (appMeta as any).resource ?? null,
          scope: typeof payload.scope === "string" ? payload.scope : null,
          candidate_resource_ids: RESOURCE_IDS,
          candidate_scope: COUNCIL_SCOPE,
        },
      }),
    });
  } catch { /* evidence gathering never breaks a request */ }
}

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
  /** Raw `iss` claim. Item 2: the issuer is invisible client-side; only the
   *  server can record it. */
  iss?: string | null;
  /** Raw tenant string the token carried, before any resolution. */
  tenantClaim?: string | null;
  /** AUTH v2 · verified OAuth identity, used for identity-keyed resolution. */
  email?: string | null;
  emailVerified?: boolean;
};

export async function verifySupabaseJwt(token: string): Promise<ResolvedIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) reject("malformed", "not three segments");
  const [h, p, s] = parts;

  let header: any, payload: any;
  try {
    header = decodeJson(h);
    payload = decodeJson(p);
  } catch {
    reject("malformed", "header or payload not decodable json");
  }

  const alg: string = typeof header?.alg === "string" ? header.alg : "";
  const kid: string | undefined = typeof header?.kid === "string" ? header.kid : undefined;
  const importParams = algToImport(alg);
  if (!importParams) reject("alg_unsupported", `alg=${alg || "(absent)"}`);

  // Signature verification
  let keys: Jwk[];
  try {
    keys = await fetchJwks();
  } catch (e) {
    reject("jwks_unavailable", e instanceof Error ? e.message : String(e));
  }
  const candidates = keys.filter((k) => (!kid || k.kid === kid) && (!k.alg || k.alg === alg));
  if (candidates.length === 0) reject("no_matching_key", `kid=${kid ?? "(absent)"} alg=${alg}`);

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
  if (!verified) reject("sig_invalid", `kid=${kid ?? "(absent)"}`);

  // ── Claim checks ─────────────────────────────────────────────────────────
  // House rule, learned the hard way: a check that only runs when the claim is
  // present is not a check. An omitted claim must fail, not pass.
  const now = Math.floor(Date.now() / 1000);

  // `exp` is REQUIRED. Absent, non-numeric, or past · all rejected. A token
  // with no expiry would otherwise be valid forever.
  if (typeof payload?.exp !== "number" || !Number.isFinite(payload.exp)) {
    reject("exp_missing", "no numeric exp claim");
  }
  if (payload.exp < now - 30) reject("exp_past", `exp=${payload.exp} now=${now}`);

  // `nbf` may legitimately be absent; when present it must not be in the future.
  if (typeof payload?.nbf === "number" && payload.nbf > now + 30) {
    reject("nbf_future", `nbf=${payload.nbf} now=${now}`);
  }

  // `iss` is REQUIRED and exact. Defence in depth behind the JWKS check ·
  // but an optional identity check is not a check.
  if (typeof payload?.iss !== "string" || !payload.iss) reject("iss_missing", "no iss claim");
  if (payload.iss !== ISSUER) reject("iss_mismatch", `iss=${payload.iss}`);

  // A token with no subject has no principal behind it.
  const sub = typeof payload?.sub === "string" ? payload.sub.trim() : "";
  if (!sub) reject("sub_missing", "empty or absent sub");

  // RESOURCE BINDING · see the block at the top of this file. Not enforced;
  // this call records what the AS actually mints so it can be.
  void recordClaimShape(payload as Record<string, unknown>);
  const scopeStr = typeof payload?.scope === "string" ? payload.scope : "";



  // Tenant resolution · server-side only, never from caller input.
  const appMeta = (payload?.app_metadata && typeof payload.app_metadata === "object")
    ? payload.app_metadata : {};
  const tenant = typeof appMeta.tenant === "string" && appMeta.tenant.trim()
    ? appMeta.tenant.trim()
    : "";
  // AUTH v2: a missing tenant claim is NO LONGER fatal. The caller resolves the
  // tenant from the verified identity (email / provider subject) and falls back
  // to this claim only when identity-keyed resolution finds nothing.

  const clientId = typeof payload?.client_id === "string" ? payload.client_id : null;
  const iss = payload.iss as string;
  const rawTenantClaim = typeof appMeta.tenant === "string" ? appMeta.tenant : null;
  const email = typeof payload?.email === "string" ? payload.email : null;
  const emailVerified = payload?.email_verified === true ||
    (payload?.user_metadata && payload.user_metadata.email_verified === true);
  return {
    tenant,
    sub,
    scope: scopeStr,
    clientId,
    iss,
    tenantClaim: rawTenantClaim,
    email,
    emailVerified: emailVerified === true,
  };
}

export const RESOURCE_METADATA_URL =
  "https://mcp.chiefofbusiness.ai/.well-known/oauth-protected-resource";

export function unauthorizedHeaders(error = "invalid_token"): Record<string, string> {
  return {
    "WWW-Authenticate":
      `Bearer realm="cob-council", error="${error}", resource_metadata="${RESOURCE_METADATA_URL}"`,
  };
}
