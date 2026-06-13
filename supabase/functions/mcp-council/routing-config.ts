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
  // Council uses a RATIO of total seated chairs (not a hardcoded literal),
  // so it scales when the roster grows or shrinks (e.g., FELIX/AIMS seating
  // moved the board from 6 to 8 · floor moved from 4 to 6 automatically).
  // Computed at call time in runCouncilWithResynth as Math.ceil(total * ratio).
  council_min_ratio: 0.66,
  panel_min_chairs: 2,     // of N · absolute is correct for variable panels
} as const;


export type Stakes = "low" | "medium" | "high" | "existential";
export type Mode = "solo" | "panel" | "council";
export type Lane =
  | "legal"
  | "finance"
  | "ops"
  | "trust"
  | "people"
  | "strategy"
  | "growth"
  | "vision";


const STAKES_RANK: Record<Stakes, number> = {
  low: 0, medium: 1, high: 2, existential: 3,
};

export function stakesAtLeast(s: Stakes, floor: Stakes): boolean {
  return STAKES_RANK[s] >= STAKES_RANK[floor];
}


// ── PLATFORM "Raise-the-Bar" quality standard ─────────────────────────────
// VAULT-LEVEL · platform owner only. Not client-exposed. Not per-tenant.
// One global constant; flipping `PLATFORM_QUALITY_VERSION` to `"elevated"`
// raises the bar globally for every client. There is NO tenant / tier /
// entitlement resolution of this value — the rigor level is a uniform
// guarantee, not a client-visible dial.
//
// Hard invariant: this never inflates ε/ρ. A higher bar produces more
// honest caps and (where eligible) one bounded escalation hop — never a
// fabricated higher score.
export const QUALITY_STANDARD = {
  current: {
    eps_floor: 0.88,
    rho_floor: 0.88,
    escalate_below_floor: false,
    max_escalations: 0,
    escalate_min_stakes: "medium" as Stakes,
    eval_seat_mark: 0.85,
    eval_retain_mark: 0.80,
    reprobe_every_interactions: 50,
    reprobe_every_new_specialists: 10,
  },
  elevated: {
    eps_floor: 0.92,
    rho_floor: 0.90,
    escalate_below_floor: true,
    max_escalations: 1,
    escalate_min_stakes: "medium" as Stakes,
    eval_seat_mark: 0.92,
    eval_retain_mark: 0.88,
    reprobe_every_interactions: 25,
    reprobe_every_new_specialists: 5,
  },
} as const;

export type PlatformQualityVersion = "current" | "elevated";

// ← Platform owner flips this single line to `"elevated"` in the vault to
//   raise the bar globally. No client step. No client visibility.
export const PLATFORM_QUALITY_VERSION: PlatformQualityVersion = "current";
export const PLATFORM_QUALITY = QUALITY_STANDARD[PLATFORM_QUALITY_VERSION];

