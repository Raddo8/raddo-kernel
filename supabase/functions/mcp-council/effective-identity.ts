// supabase/functions/mcp-council/effective-identity.ts
//
// PKT-0A batch 2 · Effective identity resolution.
//
// Replaces silent name-to-CID resolution. Proven necessary 2026-07-28: tenants
// holds two rows named COB and two named JAEL. The prior resolver returned one
// CID for the name COB-HQ with a fifty percent chance of being wrong.
//
// Contract: authenticated subject -> RESOLVED | AMBIGUOUS | UNRESOLVED.
// Never guess. An ambiguous name is a finding, not a value.

export type IdentityResolution =
  | { status: "RESOLVED"; cid: string; matched_name: string }
  | { status: "AMBIGUOUS"; candidates: string[]; matched_name: string }
  | { status: "UNRESOLVED"; reason: string; matched_name: string | null };

export function normalizeTenantClaim(claim: string): string {
  return String(claim ?? "")
    .trim()
    .toUpperCase()
    .replace(/-HQ$/, "");
}

export async function resolveEffectiveIdentity(
  supabaseAdmin: any | null,
  tenantClaim: string,
): Promise<IdentityResolution> {
  const raw = String(tenantClaim ?? "").trim();
  const name = normalizeTenantClaim(tenantClaim);

  if (!supabaseAdmin) {
    return { status: "UNRESOLVED", reason: "no_admin_client", matched_name: name };
  }
  if (!name) {
    return { status: "UNRESOLVED", reason: "empty_claim", matched_name: null };
  }

  // UNIT 1 · CID-FIRST. A connector identity minted by the onboarding
  // provisioner carries the CID itself in app_metadata.tenant. A CID is an
  // exact key and can never be ambiguous, so it is tried before any
  // display-name lookup. Alias rows resolve through the same path.
  try {
    const { data, error } = await supabaseAdmin.rpc("resolve_cid", { k: raw });
    const cid = typeof data === "string" && data.trim() ? data.trim() : null;
    if (!error && cid) {
      return { status: "RESOLVED", cid, matched_name: raw };
    }
  } catch (_e) {
    // fall through to the display-name path
  }


  try {
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("cid")
      .eq("cob_name", name);

    if (error) {
      return { status: "UNRESOLVED", reason: `lookup_error:${error.code ?? "unknown"}`, matched_name: name };
    }

    const rows = (data ?? []) as Array<{ cid: string }>;
    const cids = rows.map((r) => r.cid).filter(Boolean).sort();

    if (cids.length === 0) {
      return { status: "UNRESOLVED", reason: "no_match", matched_name: name };
    }
    if (cids.length > 1) {
      return { status: "AMBIGUOUS", candidates: cids, matched_name: name };
    }
    return { status: "RESOLVED", cid: cids[0], matched_name: name };
  } catch (e) {
    return {
      status: "UNRESOLVED",
      reason: `exception:${e instanceof Error ? e.name : "unknown"}`,
      matched_name: name,
    };
  }
}

export function cidOrNull(r: IdentityResolution): string | null {
  return r.status === "RESOLVED" ? r.cid : null;
}

export function mustHardStop(r: IdentityResolution): boolean {
  return r.status !== "RESOLVED";
}
