// supabase/functions/_shared/onboarding-routing.ts
//
// ONBOARDING · returning-identity routing guard.
//
// Onboarding must never run inside an already-provisioned tenant. At the
// onboarding entry (welcome_party / taylor_setup) the principal is derived with
// the SAME AUTH v2 identity-keyed resolver. A verified identity that already
// holds an ACTIVE membership is RETURNING: no provisioning, no new tenant, no
// kernel load in the onboarding surface — greet and route home instead.
//
// Binding rules:
//   · identity is server-derived only; never a body-supplied cid
//   · AMBIGUOUS is never a guess and is never treated as NEW
//   · only a genuinely UNRESOLVED verified identity proceeds into onboarding

import { resolveIdentityKeyed, type VerifiedIdentityInput } from "./identity-keyed.ts";

export type OnboardingClassification = "RETURNING" | "NEW" | "AMBIGUOUS";

export interface OnboardingEntryDecision {
  classification: OnboardingClassification;
  cid: string | null;
  role: string | null;
  is_operator: boolean;
  tenant_status: string | null;
  /** Where the subject belongs. Null only when classification is NEW. */
  route: string | null;
  reason: string;
}

/** Route home for a returning identity. Operators never land in client onboarding. */
function routeFor(isOperator: boolean, tenantStatus: string | null): string {
  if (isOperator) return "/control";
  return tenantStatus === "live" ? "/hq" : "/start/progress";
}

export async function classifyOnboardingEntry(
  admin: any | null,
  input: VerifiedIdentityInput,
): Promise<OnboardingEntryDecision> {
  const base: OnboardingEntryDecision = {
    classification: "NEW",
    cid: null,
    role: null,
    is_operator: false,
    tenant_status: null,
    route: null,
    reason: "unresolved_identity",
  };
  if (!admin) return { ...base, reason: "no_admin_client" };

  const keyed = await resolveIdentityKeyed(admin, input);

  if (keyed.status === "AMBIGUOUS") {
    return {
      ...base,
      classification: "AMBIGUOUS",
      route: "/start/select-workspace",
      reason: "multiple_active_memberships",
    };
  }
  if (keyed.status !== "RESOLVED") {
    return { ...base, reason: keyed.reason };
  }

  const cid = keyed.cid;
  let role: string | null = null;
  let tenantStatus: string | null = null;
  try {
    const { data: mem } = await admin
      .from("tenant_memberships_v2")
      .select("role")
      .eq("cid", cid)
      .eq("status", "ACTIVE")
      .is("revoked_at", null)
      .limit(1);
    role = (Array.isArray(mem) && mem[0]?.role) || null;
  } catch (_e) { /* role stays null · treated as non-operator */ }
  try {
    const { data: t } = await admin
      .from("tenants").select("status").eq("cid", cid).maybeSingle();
    tenantStatus = (t?.status as string | undefined) ?? null;
  } catch (_e) { /* status stays null */ }

  const isOperator = role === "operator";
  return {
    classification: "RETURNING",
    cid,
    role,
    is_operator: isOperator,
    tenant_status: tenantStatus,
    route: routeFor(isOperator, tenantStatus),
    reason: `resolved_via_${keyed.via}`,
  };
}

/** Greeting for a returning identity. No onboarding steps, no kernel content. */
export function returningWelcomePayload(
  decision: OnboardingEntryDecision,
  firstName: string | null,
) {
  const who = firstName ? `Welcome back, ${firstName}.` : "Welcome back.";
  const where = decision.is_operator
    ? "Taking you to your control surface."
    : "Taking you to your headquarters.";
  return {
    classification: decision.classification,
    onboarding: "skipped" as const,
    provisioning: "skipped" as const,
    kernel: "not_loaded" as const,
    cid: decision.cid,
    role: decision.role,
    tenant_status: decision.tenant_status,
    route: decision.route,
    greeting: `${who} ${where}`,
    instructions:
      `${who} ${where} This identity already has a headquarters, so setup does not run again. ` +
      "Do not call load_kernel_part, do not create or assign a tenant, and do not walk through onboarding. " +
      "Say the greeting in one composed line and hand off to the route above.",
  };
}
