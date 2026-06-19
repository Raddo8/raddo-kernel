// supabase/functions/mcp-council/tenants.ts
//
// Phase-1 tenant registry · tenant context lives in code.
// Phase-2 promote to a `tenants` table with operator UI for context edits.
//
// SECURITY: callers of getTenantContext MUST pass a tenant value sourced
// exclusively from the verified JWT claim (app_metadata.tenant) or the
// static SPINNEY bearer path. Never from request body, args, query, or
// any client-controlled header. See index.ts tenant assignment.
//
// Legal seat: collapsed to a single seat (Knox) for every tenant.
// Tier remap, LEXI, and legal_seat are removed.

export interface TenantContext {
  client: string;
  principal: string;
  principal_values: string;
  active_matters: string;
  bearing_default: string;
}

// Per-tenant context injected into persona bodies via {{PLACEHOLDERS}}.
// Anything missing degrades to a readable "(capture at onboarding)" hint so
// rendered prose does not contain the bare word "unspecified".
const TENANT_CONTEXT: Record<string, TenantContext> = {
  SPINNEY: {
    client: "Spinney",
    principal: "the Spinney principal",
    principal_values:
      "fiduciary duty to clients, defensible craft over volume, durable reputation",
    active_matters:
      "active wind-down litigation with a former counterparty (live adversarial matter)",
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

// ── Knox context-flex posture computation ───────────────────────────────
// "advisory" by default; "offensive" only when a live adversarial matter
// exists OR the question itself is adversarial in nature. Operator may
// override per call via the optional posture argument upstream.
export type KnoxPosture = "advisory" | "offensive";

const ADVERSARIAL_PATTERNS = [
  /\blitigat/i,
  /\blawsuit\b/i,
  /\bsue(d|s|ing)?\b/i,
  /\bsuing\b/i,
  /\bdispute\b/i,
  /\bdemand letter\b/i,
  /\bcease[\s-]?and[\s-]?desist\b/i,
  /\bregulatory (action|inquiry|investigation)\b/i,
  /\bsubpoena\b/i,
  /\bdeposition\b/i,
  /\bopposing counsel\b/i,
  /\bopponent\b/i,
  /\badversar/i,
  /\bbreach of contract\b/i,
  /\binjunction\b/i,
  /\barbitration\b/i,
  /\bclaim against\b/i,
  /\bcounterclaim\b/i,
  /\bwind[\s-]?down litigation\b/i,
  /\bactive matter\b/i,
  /\blive adversarial\b/i,
];

function looksAdversarial(text: string): boolean {
  if (!text) return false;
  return ADVERSARIAL_PATTERNS.some((re) => re.test(text));
}

export function computeKnoxPosture(
  activeMatters: string,
  question: string,
): KnoxPosture {
  if (looksAdversarial(activeMatters)) return "offensive";
  if (looksAdversarial(question)) return "offensive";
  return "advisory";
}

// ── harden-v1 · per-tenant Notion target resolution ─────────────────────
// Returns { token, dbId } for the tenant, or null when no per-tenant office
// is configured. Callers MUST throw "office_not_configured" on null — never
// fall back to another tenant's secrets. This prevents cross-tenant writes
// that the prior single-SPINNEY_NOTION_TOKEN path allowed.
export interface NotionTarget {
  token: string;
  dbId: string;
}

export function getNotionTarget(tenant: string): NotionTarget | null {
  if (tenant === "SPINNEY") {
    const token = Deno.env.get("SPINNEY_NOTION_TOKEN") ?? "";
    const dbId = Deno.env.get("SPINNEY_BOARDROOM_DB") ?? "";
    if (!token || !dbId) return null;
    return { token, dbId };
  }
  // Other tenants: look up tenant-scoped secrets (e.g. JAEL_NOTION_TOKEN).
  // Fail-closed when absent.
  const token = Deno.env.get(`${tenant}_NOTION_TOKEN`) ?? "";
  const dbId = Deno.env.get(`${tenant}_BOARDROOM_DB`) ?? "";
  if (!token || !dbId) return null;
  return { token, dbId };
}
