// supabase/functions/mcp-council/routing-config.ts
//
// Confidence-gated routing dials. Tune from the mcp_usage_events.metadata
// routing_log ledger. In-code for Phase-1; promote to per-tenant config when
// the operator UI lands.

export const ROUTING_CONFIG = {
  // Triage uncertainty threshold: below this, force panel rather than solo.
  tau_route: 0.85,
  // Specialist self-reported lane_fit floor. Below this, escalate.
  tau_fit: 0.80,
  // Confidence floors for "done". Mirror the KNOX HARD-STOP bands.
  floor: { eps_min: 0.90, rho_min: 0.88 },
  // Stakes ladder triggers.
  stakes_floor_panel: "high",            // panel-minimum (never solo)
  stakes_floor_council: "existential",   // full board
  stakes_floor_dissent: "medium",        // steelman pass
  // Fanout: triage implicating ≥ this many distinct lanes → council.
  multi_lane_council_threshold: 3,
  // Confidence loop guards.
  max_iters: 3,
  budget_calls: 6,
  // Diminishing-returns: if Δepsilon < this between iters, stop capped.
  min_eps_delta: 0.02,
} as const;

export type Stakes = "low" | "medium" | "high" | "existential";
export type Mode = "solo" | "panel" | "council";
export type Lane = "legal" | "finance" | "ops" | "trust" | "people" | "strategy";

const STAKES_RANK: Record<Stakes, number> = {
  low: 0, medium: 1, high: 2, existential: 3,
};

export function stakesAtLeast(s: Stakes, floor: Stakes): boolean {
  return STAKES_RANK[s] >= STAKES_RANK[floor];
}
