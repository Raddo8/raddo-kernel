// supabase/functions/world-graph/identity.ts
//
// W1b · Server-side authority derivation for the world graph.
//
// The cid is NEVER read from the request body. Two accepted principals,
// mirroring the existing resolve-authority path:
//   1. connector OAuth JWT  -> app_metadata.tenant -> resolveEffectiveIdentity
//   2. app user JWT         -> resolve_hq_authority_v1(auth_user_id).active_cid
//
// `owner` marks a principal transacting on its own tenant membership. Only an
// owning principal may see rows marked sensitivity 'sensitive'.

import { verifySupabaseJwt } from "./auth.ts";
import { resolveEffectiveIdentity } from "./effective-identity.ts";
import { resolveIdentityKeyed } from "../_shared/identity-keyed.ts";

export type Principal = Readonly<{
  cid: string;
  owner: boolean;
  mode: "oauth" | "user";
  subject: string | null;
  tenant_claim: string | null;
}>;

export type AuthFailure = Readonly<{ error: string; status: number }>;

export function bearer(req: Request): string | null {
  const m = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function derivePrincipal(
  req: Request,
  admin: any,
): Promise<Principal | AuthFailure> {
  const token = bearer(req);
  if (!token) return { error: "missing_bearer_token", status: 401 };
  if (!admin) return { error: "admin_client_unavailable", status: 503 };

  // 1 · connector OAuth JWT (separate authorization server)
  try {
    const id = await verifySupabaseJwt(token);

    // AUTH v2 · identity-keyed resolution is PRIMARY.
    const keyed = await resolveIdentityKeyed(admin, {
      email: id.email,
      emailVerified: id.emailVerified,
      sub: id.sub,
    });
    if (keyed.status === "RESOLVED") {
      return {
        cid: keyed.cid,
        owner: true,
        mode: "oauth",
        subject: id.sub ?? null,
        tenant_claim: id.tenantClaim ?? null,
      };
    }

    // Legacy fallback · app_metadata.tenant claim (keeps live tokens working).
    const res = await resolveEffectiveIdentity(admin, id.tenantClaim ?? id.tenant);
    if (res.status === "RESOLVED") {
      return {
        cid: res.cid,
        owner: true,
        mode: "oauth",
        subject: id.sub ?? null,
        tenant_claim: id.tenantClaim ?? null,
      };
    }
    if (keyed.status === "AMBIGUOUS" || res.status === "AMBIGUOUS") {
      return { error: "identity_ambiguous", status: 409 };
    }
    return { error: "identity_unresolved", status: 403 };
  } catch (_e) {
    // fall through to the app-user path
  }

  // 2 · app user JWT issued by this project
  let userId: string | null = null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error) return { error: "invalid_token", status: 401 };
    userId = data?.user?.id ?? null;
  } catch (_e) {
    return { error: "invalid_token", status: 401 };
  }
  if (!userId) return { error: "invalid_token", status: 401 };

  try {
    const { data, error } = await admin.rpc("resolve_hq_authority_v1", {
      p_auth_user_id: userId,
      p_session_id: null,
    });
    if (error) return { error: "authority_resolution_failed", status: 403 };
    const cid = typeof data?.active_cid === "string" ? data.active_cid : null;
    if (!cid) return { error: "no_active_tenant", status: 403 };
    const owner = typeof data?.tenant_role === "string" && data.tenant_role.length > 0;
    return { cid, owner, mode: "user", subject: userId, tenant_claim: null };
  } catch (_e) {
    return { error: "authority_resolution_failed", status: 403 };
  }
}

export function isFailure(p: Principal | AuthFailure): p is AuthFailure {
  return (p as AuthFailure).error !== undefined;
}

/** Sensitivity levels this principal is allowed to read. */
export function readableSensitivities(p: Principal): string[] {
  return p.owner ? ["operational", "sensitive"] : ["operational"];
}
