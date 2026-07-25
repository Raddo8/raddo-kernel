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

// Normalize a tenant slug to a valid env-var name (e.g. "COB-HQ" → "COB_HQ").
const envKey = (tenant: string) => tenant.replace(/-/g, "_").toUpperCase();

export function getNotionTarget(tenant: string): NotionTarget | null {
  const key = envKey(tenant);
  const token = Deno.env.get(`${key}_NOTION_TOKEN`) ?? "";
  const dbId = Deno.env.get(`${key}_BOARDROOM_DB`) ?? "";
  if (!token || !dbId) return null;
  return { token, dbId };
}

// C2b · resolve from public.tenant_offices first, env pair as fallback.
// Fail-closed: never falls back to a different tenant's secrets.

export type NotionTargetReason =
  | "ok"
  | "office_not_provisioned"
  | "office_token_missing"
  | "office_db_missing";

export async function resolveNotionTarget(
  tenant: string,
  supabaseAdmin: any | null,
): Promise<{ target: NotionTarget | null; reason: NotionTargetReason }> {
  const key = envKey(tenant);
  let token = "";
  let dbId = "";
  let rowFound = false;

  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from("tenant_offices")
        .select("boardroom_db, token_ref")
        .eq("tenant", tenant)
        .eq("status", "active")
        .maybeSingle();
      if (error) {
        console.error("tenant_offices_lookup_error", error.message);
      } else if (data) {
        rowFound = true;
        const tokenRef = (data.token_ref && String(data.token_ref).trim()) ||
          `${key}_NOTION_TOKEN`;
        token = Deno.env.get(tokenRef) ?? "";
        dbId = String(data.boardroom_db ?? "");
      }
    } catch (e) {
      console.error(
        "tenant_offices_lookup_exception",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  // Fallback to env pair if store yielded nothing.
  const envToken = Deno.env.get(`${key}_NOTION_TOKEN`) ?? "";
  const envDb = Deno.env.get(`${key}_BOARDROOM_DB`) ?? "";
  if (!token) token = envToken;
  if (!dbId) dbId = envDb;

  if (token && dbId) return { target: { token, dbId }, reason: "ok" };

  // Nothing resolvable at all → the tenant has no OFFICE surface.
  if (!rowFound && !envToken && !envDb) {
    return { target: null, reason: "office_not_provisioned" };
  }
  // A db id resolved but the token is empty.
  if (!token && dbId) return { target: null, reason: "office_token_missing" };
  // A token resolved but the db id is empty.
  if (token && !dbId) return { target: null, reason: "office_db_missing" };
  // Neither, but at least one hint was there (row without contents, or half env pair).
  return { target: null, reason: "office_not_provisioned" };
}

// Backwards-compatible wrapper — callers that only need target/null keep working.
export async function getNotionTargetAsync(
  tenant: string,
  supabaseAdmin: any | null,
): Promise<NotionTarget | null> {
  const r = await resolveNotionTarget(tenant, supabaseAdmin);
  return r.target;
}
