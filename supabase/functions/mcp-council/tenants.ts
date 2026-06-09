// supabase/functions/mcp-council/tenants.ts
//
// Phase-1 tenant registry · seats and tenant context live in code.
// Phase-2 promote to a `tenants` table with operator UI for entitlement flips.
//
// SECURITY: callers of getLegalSeat/getTenantContext MUST pass a tenant value
// sourced exclusively from the verified JWT claim (app_metadata.tenant) or
// the static SPINNEY bearer path. Never from request body, args, query, or
// any client-controlled header. See index.ts tenant assignment.

export type LegalSeat = "lexi" | "knox";

export interface TenantContext {
  client: string;
  principal: string;
  principal_values: string;
  active_matters: string;
  bearing_default: string;
}

// Default legal seat for any tenant not explicitly listed is LEXI
// (advisory-grade). KNOX (litigation-grade) is opt-in per tenant.
export const LEGAL_SEAT_BY_TENANT: Record<string, LegalSeat> = {
  SPINNEY: "knox",
};

// Per-tenant context injected into legal persona bodies via {{PLACEHOLDERS}}.
// Anything missing degrades to a readable "(capture at onboarding)" hint so
// rendered prose does not contain the bare word "unspecified".
const TENANT_CONTEXT: Record<string, TenantContext> = {
  SPINNEY: {
    client: "Spinney",
    principal: "the Spinney principal",
    principal_values:
      "fiduciary duty to clients, defensible craft over volume, durable reputation",
    active_matters: "no active matters on file",
    bearing_default: "85/60",
  },
};

const DEFAULT_CONTEXT: TenantContext = {
  client: "the principal's company (capture at onboarding)",
  principal: "the principal (capture at onboarding)",
  principal_values: "the principal's stated values (capture at onboarding)",
  active_matters: "no active matters on file (capture at onboarding)",
  bearing_default: "85/60",
};

export function getLegalSeat(tenant: string): LegalSeat {
  return LEGAL_SEAT_BY_TENANT[tenant] ?? "lexi";
}

export function getTenantContext(tenant: string): TenantContext {
  const t = TENANT_CONTEXT[tenant];
  if (!t) return DEFAULT_CONTEXT;
  return {
    client: t.client?.trim() || DEFAULT_CONTEXT.client,
    principal: t.principal?.trim() || DEFAULT_CONTEXT.principal,
    principal_values: t.principal_values?.trim() || DEFAULT_CONTEXT.principal_values,
    active_matters: t.active_matters?.trim() || DEFAULT_CONTEXT.active_matters,
    bearing_default: t.bearing_default?.trim() || DEFAULT_CONTEXT.bearing_default,
  };
}
