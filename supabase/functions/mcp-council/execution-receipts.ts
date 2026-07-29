// supabase/functions/mcp-council/execution-receipts.ts
//
// PKT-0A · Append-only execution evidence.
//
// Mirrors the fire-and-forget shape of recordMcpUsage in usage.ts exactly:
// the service-role client is injected, no-ops on null, logs to console only,
// NEVER throws and NEVER signals failure to its caller.
//
// Load-bearing: the observability layer must not become a new outage surface.
// A receipt that fails to write is a lost receipt, never a failed request.
//
// Receipts carry pointers, counts and outcomes. Never raw business content.

import type { RequestContext } from "./request-context.ts";
import type { IdentityResolution } from "./effective-identity.ts";
import { declaredEffects, EFFECTS_CATALOG_VERSION, isUncatalogued, undeclaredEffects, type Effect } from "./tool-effects.ts";

export type Outcome = "ok" | "error" | "degraded";

export type ExecutionReceiptArgs = {
  ctx: RequestContext;
  tool: string;
  outcome: Outcome;
  observed_effects?: readonly Effect[];
  error_class?: string | null;
  canonical_refs?: Record<string, unknown> | null;
  notes?: Record<string, unknown> | null;
  identity_status?: string | null;
  identity_candidates?: string[] | null;
};

export async function recordExecutionReceipt(
  supabaseAdmin: any | null,
  args: ExecutionReceiptArgs,
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const ctx = args.ctx;
    const observed = args.observed_effects ?? [];
    const declared = declaredEffects(args.tool);
    const undeclared = undeclaredEffects(args.tool, observed);
    const uncatalogued = isUncatalogued(args.tool);

    const duration_ms = (() => {
      const d = Date.now() - ctx.started_ms;
      return Number.isFinite(d) && d >= 0 ? d : null;
    })();

    const { error } = await supabaseAdmin.from("execution_receipts").insert({
      request_id: ctx.request_id,
      correlation_id: ctx.correlation_id,
      cid: ctx.cid,
      tenant_display: ctx.tenant,
      authenticated_sub: ctx.authenticated_sub,
      auth_mode: ctx.auth_mode,
      surface: ctx.surface,
      tool: args.tool,
      contract_version: ctx.contract_version,
      effects_catalog_version: EFFECTS_CATALOG_VERSION,
      build_id: ctx.build_id,
      declared_effects: declared,
      observed_effects: observed,
      undeclared_effects: undeclared,
      contract_ok: undeclared.length === 0 && !uncatalogued,
      outcome: args.outcome,
      error_class: args.error_class ?? null,
      canonical_refs: args.canonical_refs ?? {},
      notes: args.notes ?? {},
      identity_status: args.identity_status ?? null,
      identity_candidates: args.identity_candidates ?? null,
      started_at: ctx.started_at,
      duration_ms,
    });

    if (error) console.error("execution_receipt_write_failed", error.message);
    if (undeclared.length > 0) {
      console.error(
        "tool_effect_contract_violation",
        JSON.stringify({ tool: args.tool, undeclared, request_id: ctx.request_id }),
      );
    }
  } catch (e) {
    console.error(
      "execution_receipt_write_exception",
      e instanceof Error ? e.message : String(e),
    );
  }
}
