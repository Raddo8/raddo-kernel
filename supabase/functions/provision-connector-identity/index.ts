// UNIT 1 · CONNECTOR BACKBONE — connector identity mirror.
//
// One identity: the email and password a client creates during onboarding
// (minted in the onboarding auth pool) IS the login their COB connector uses
// at the OAuth Authorization Server. This function mirrors that credential
// onto the AS and stamps the AUTHORITATIVE CID as the tenant claim.
//
// START-0A containment is lifted here because the defect it contained is
// fixed: the tenant claim is no longer derived from the onboarding slug
// (a display label). It is now the CID resolved from tenant_members /
// onboarding_tenants, which is the only identity key. If no CID can be
// resolved the function refuses; it never invents one.
//
// SECURITY:
//   - Requires a valid onboarding-pool JWT (caller-authenticated).
//   - Claims email MUST match the email in the body.
//   - Password is NEVER logged and never appears in any error surface.
//   - Fails closed when AS_SERVICE_ROLE_KEY or AS_URL is absent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AS_URL = (Deno.env.get("AS_URL") || "").replace(/\/$/, "");
const AS_SERVICE_ROLE_KEY = Deno.env.get("AS_SERVICE_ROLE_KEY") || "";

function ok(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function asFetch(path: string, init: RequestInit) {
  return fetch(`${AS_URL}${path}`, {
    ...init,
    headers: {
      apikey: AS_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${AS_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

// Authoritative CID for the caller. Membership first (the identity spine),
// onboarding record second. Never a slug, never a display name.
async function resolveAuthoritativeCid(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const member = await admin
    .from("tenant_members")
    .select("cid")
    .eq("auth_user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (member.data?.cid) return String(member.data.cid);

  const onboarding = await admin
    .from("onboarding_tenants")
    .select("cid, identity_state")
    .eq("user_id", userId)
    .maybeSingle();
  if (onboarding.data?.cid && onboarding.data.identity_state !== "QUARANTINED") {
    return String(onboarding.data.cid);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!AS_URL || !AS_SERVICE_ROLE_KEY) {
      console.warn("as_credentials_missing");
      return ok({ provisioned: false, error: "as_key_missing" });
    }

    // --- Auth guard: caller must be signed in, claims email must match body.
    const authz = req.headers.get("Authorization") || "";
    const jwt = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!jwt) return ok({ provisioned: false, error: "unauthenticated" });

    const localAnon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const claimsRes = await localAnon.auth.getClaims(jwt);
    const claims = claimsRes.data?.claims as { sub?: string; email?: string } | undefined;
    if (!claims?.sub || !claims?.email) {
      return ok({ provisioned: false, error: "invalid_token" });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const email = String(body.email || "").trim().toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return ok({ provisioned: false, error: "bad_request" });
    if (email !== String(claims.email).toLowerCase()) {
      return ok({ provisioned: false, error: "email_mismatch" });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const cid = await resolveAuthoritativeCid(admin, claims.sub);
    if (!cid) {
      // Refuse rather than stamp a guess. The caller is not yet bound to a
      // tenant, so there is nothing truthful to mirror.
      return ok({ provisioned: false, error: "cid_unresolved" });
    }

    // Create the AS user, pre-confirmed, carrying the CID as tenant claim.
    const createRes = await asFetch("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        app_metadata: { tenant: cid, cid },
      }),
    });

    if (createRes.ok) {
      return ok({ provisioned: true, cid });
    }

    // Already exists → reconcile password and tenant claim so the onboarding
    // credential stays the connector credential.
    if (createRes.status === 409 || createRes.status === 422) {
      const listRes = await asFetch(
        `/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
        { method: "GET" },
      );
      if (listRes.ok) {
        const data = await listRes.json().catch(() => ({} as Record<string, unknown>));
        const user = Array.isArray((data as any)?.users) ? (data as any).users[0] : data;
        const uid = (user as any)?.id;
        if (uid) {
          const patchRes = await asFetch(`/auth/v1/admin/users/${uid}`, {
            method: "PUT",
            body: JSON.stringify({
              password,
              email_confirm: true,
              app_metadata: { ...((user as any).app_metadata || {}), tenant: cid, cid },
            }),
          });
          if (!patchRes.ok) {
            console.error("as_patch_failed", { status: patchRes.status });
            return ok({ provisioned: false, error: "as_upstream_error" });
          }
        }
      }
      return ok({ provisioned: true, cid });
    }

    // Never leak upstream detail (could echo the password payload).
    console.error("as_create_failed", { status: createRes.status });
    return ok({ provisioned: false, error: "as_upstream_error" });
  } catch (e) {
    console.error("provision_exception", { message: (e as Error)?.message });
    return ok({ provisioned: false, error: "exception" });
  }
});
