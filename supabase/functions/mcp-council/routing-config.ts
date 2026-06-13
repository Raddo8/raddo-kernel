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
  // 4+ lanes → full board. 2–3 lanes → panel of just those lanes.
  multi_lane_council_threshold: 4,
  // Confidence loop guards.
  max_iters: 3,
  budget_calls: 6,
  // Diminishing-returns: if Δepsilon < this between iters, stop capped.
  min_eps_delta: 0.02,
  // Degraded-minute honesty caps (tunable · surfaced in the minute body,
  // not just metadata). Applied when chair-count floor breached OR when
  // Abe (dissent) drops · whichever fires.
  degraded: {
    // Chair-count floor breach · cap both axes.
    eps_cap: 0.60,
    rho_cap: 0.55,
    // Abe-drop · cap rigor only (dissent is structurally part of rigor).
    dissent_missing_rho_cap: 0.55,
  },
  // Multi-advisor degradation floors.
  council_min_chairs: 4,   // of 6 (5 standard + KNOX)
  panel_min_chairs: 2,     // of N
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
