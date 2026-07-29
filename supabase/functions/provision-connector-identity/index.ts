// Provisions a mirror identity on the Authorization Server (rnjqpw) so the
// client's Claude MCP connector at mcp.chiefofbusiness.ai can sign in with
// the same email + password they just created here. Idempotent.
//
// SECURITY:
//   - Requires a valid local Supabase JWT (caller-authenticated).
//   - Claims email MUST match the email in the body.
//   - Password is NEVER logged and never appears in any error surface.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AS_URL = Deno.env.get("AS_URL")!;
const AS_SERVICE_ROLE_KEY = Deno.env.get("AS_SERVICE_ROLE_KEY") || "";

function ok(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function slugify(s: string) {
  const b = (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const suf = Math.random().toString(36).slice(2, 8);
  return (b || "client") + "-" + suf;
}

async function loadOrCreateTenantKey(admin: ReturnType<typeof createClient>, userId: string, email: string) {
  const existing = await admin.from("onboarding_tenants").select("tenant_key").eq("user_id", userId).maybeSingle();
  if (existing.data?.tenant_key) return existing.data.tenant_key as string;
  const ins = await admin.from("onboarding_tenants")
    .insert({ user_id: userId, tenant_key: slugify((email || "").split("@")[0]), status: "intake", current_step: "welcome" })
    .select("tenant_key").single();
  return (ins.data?.tenant_key as string) || slugify((email || "").split("@")[0]);
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

// START-0A containment: this path stamped a tenant claim from the onboarding
// slug, which is not an authority. Rebuilt in START-3. Refuses until then.
const CONNECTOR_PROVISIONING_ENABLED = false;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!CONNECTOR_PROVISIONING_ENABLED) {
    console.warn("connector_provisioning_disabled", { path: new URL(req.url).pathname });
    return ok({
      provisioned: false,
      error: "connector_provisioning_disabled",
      message: "Connector provisioning is temporarily unavailable.",
    });
  }

  try {
    if (!AS_SERVICE_ROLE_KEY) {
      return ok({ provisioned: false, error: "as_key_missing" });
    }


    // --- Auth guard: caller must be signed in, and claims email must match body email.
    const authz = req.headers.get("Authorization") || "";
    const jwt = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!jwt) return ok({ provisioned: false, error: "unauthenticated" }, 200);

    const localAnon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const claimsRes = await localAnon.auth.getClaims(jwt);
    const claims = claimsRes.data?.claims as { sub?: string; email?: string } | undefined;
    if (!claims?.sub || !claims?.email) {
      return ok({ provisioned: false, error: "invalid_token" });
    }

    const body = await req.json().catch(() => ({} as any));
    const email = String(body.email || "").trim().toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return ok({ provisioned: false, error: "bad_request" });
    if (email !== String(claims.email).toLowerCase()) {
      return ok({ provisioned: false, error: "email_mismatch" });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const tenantKey = await loadOrCreateTenantKey(admin, claims.sub, email);

    // Create the AS user.
    const createRes = await asFetch("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        app_metadata: { tenant: tenantKey },
      }),
    });

    if (createRes.ok) {
      return ok({ provisioned: true, tenant: tenantKey });
    }

    // Already exists → patch app_metadata.tenant if missing.
    if (createRes.status === 409 || createRes.status === 422) {
      const listRes = await asFetch(`/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { method: "GET" });
      if (listRes.ok) {
        const data = await listRes.json().catch(() => ({} as any));
        const user = Array.isArray(data?.users) ? data.users[0] : data;
        const uid = user?.id;
        const existingTenant = user?.app_metadata?.tenant;
        if (uid && !existingTenant) {
          await asFetch(`/auth/v1/admin/users/${uid}`, {
            method: "PUT",
            body: JSON.stringify({ app_metadata: { ...(user.app_metadata || {}), tenant: tenantKey } }),
          });
        }
      }
      return ok({ provisioned: true, tenant: tenantKey });
    }

    // Never leak upstream detail (could echo password payload in some errors).
    console.error("as_create_failed", { status: createRes.status });
    return ok({ provisioned: false, error: "as_upstream_error" });
  } catch (e) {
    console.error("provision_exception", { message: (e as Error)?.message });
    return ok({ provisioned: false, error: "exception" });
  }
});
