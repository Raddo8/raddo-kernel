// supabase/functions/_shared/identity-keyed.ts
//
// AUTH v2 · identity-keyed authorization.
//
// The tenant is resolved from the VERIFIED OAuth identity (email or provider
// subject), not from a pre-stamped app_metadata.tenant claim. Callers keep the
// legacy claim path as a fallback so live connector tokens never break.
//
// Binding rules:
//   · never resolve on an unverified email (spoofable)
//   · never read a cid/tenant from request input
//   · more than one active membership is AMBIGUOUS, never a guess

export type KeyedResolution =
  | { status: "RESOLVED"; cid: string; via: "email_alias" | "principal_binding" }
  | { status: "AMBIGUOUS"; candidates: string[]; via: "email_alias" }
  | { status: "UNRESOLVED"; reason: string };

export type VerifiedIdentityInput = {
  email?: string | null;
  emailVerified?: boolean | null;
  sub?: string | null;
};

/** Escape LIKE wildcards so an email can be matched case-insensitively but literally. */
function likeLiteral(s: string): string {
  return s.replace(/([%_\\])/g, "\\$1");
}

export async function resolveIdentityKeyed(
  admin: any | null,
  input: VerifiedIdentityInput,
): Promise<KeyedResolution> {
  if (!admin) return { status: "UNRESOLVED", reason: "no_admin_client" };

  const email = typeof input.email === "string" ? input.email.trim() : "";
  const verified = input.emailVerified === true;
  const sub = typeof input.sub === "string" ? input.sub.trim() : "";

  // SECURITY: an unverified email is never an identity key.
  if (!verified || !email) return { status: "UNRESOLVED", reason: "email_not_verified" };

  // (a) verified email -> principal_email_alias -> tenant_memberships_v2
  try {
    const { data: aliases, error: aliasErr } = await admin
      .from("principal_email_alias")
      .select("principal_id")
      .ilike("email", likeLiteral(email));

    if (!aliasErr && Array.isArray(aliases) && aliases.length > 0) {
      const principalIds = Array.from(
        new Set(aliases.map((a: any) => a?.principal_id).filter(Boolean)),
      );
      if (principalIds.length > 0) {
        const { data: memberships, error: memErr } = await admin
          .from("tenant_memberships_v2")
          .select("cid, status, revoked_at")
          .in("principal_id", principalIds)
          .eq("status", "ACTIVE")
          .is("revoked_at", null);

        if (!memErr) {
          const cids = Array.from(
            new Set((memberships ?? []).map((m: any) => m?.cid).filter(Boolean)),
          ).sort();
          if (cids.length === 1) {
            return { status: "RESOLVED", cid: cids[0] as string, via: "email_alias" };
          }
          if (cids.length > 1) {
            return { status: "AMBIGUOUS", candidates: cids as string[], via: "email_alias" };
          }
        }
      }
    }
  } catch (_e) {
    // fall through to the binding path
  }

  // (b) provider subject -> principal_binding
  if (sub) {
    try {
      const { data, error } = await admin
        .from("principal_binding")
        .select("cid")
        .eq("provider", "google")
        .eq("provider_subject", sub)
        .eq("status", "ACTIVE");

      if (!error) {
        const cids = Array.from(
          new Set((data ?? []).map((r: any) => r?.cid).filter(Boolean)),
        );
        if (cids.length === 1) {
          return { status: "RESOLVED", cid: cids[0] as string, via: "principal_binding" };
        }
      }
    } catch (_e) {
      // fall through
    }
  }

  return { status: "UNRESOLVED", reason: "no_identity_match" };
}
