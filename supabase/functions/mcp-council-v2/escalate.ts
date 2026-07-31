// supabase/functions/mcp-council/escalate.ts
//
// Raise-the-Bar · escalate-below-floor ladder.
// Platform-uniform behavior · vault-level, never client-controlled.
//
// Runs AFTER synthesis + degraded/Abe-cap pass, BEFORE returning a minute.
// Never inflates ε/ρ. Never overrides the degraded-path cap. Bounded to
// `PLATFORM_QUALITY.max_escalations` hops (default 1 under "elevated").

import {
  PLATFORM_QUALITY,
  PLATFORM_QUALITY_VERSION,
  stakesAtLeast,
  type PlatformQualityVersion,
} from "./routing-config.ts";

export type EscalationMode = "solo" | "panel" | "council";

export type EscalationStamp = {
  from_mode: EscalationMode;
  to_mode: EscalationMode;
  reason: "reasoning_gap";
  cleared: boolean;
};

export type GapType = "reasoning" | "data";

export type QualityTelemetry = {
  quality_standard_version: PlatformQualityVersion;
  floor_applied: { eps_floor: number; rho_floor: number };
  escalations: EscalationStamp[];
  below_floor_terminal?: {
    capped: true;
    gap_type: GapType;
    final_eps: number;
    final_rho: number;
    ask?: string;
  };
};

export function newQualityTelemetry(): QualityTelemetry {
  return {
    quality_standard_version: PLATFORM_QUALITY_VERSION,
    floor_applied: {
      eps_floor: PLATFORM_QUALITY.eps_floor,
      rho_floor: PLATFORM_QUALITY.rho_floor,
    },
    escalations: [],
  };
}

export function isBelowPlatformFloor(eps: number, rho: number): boolean {
  return eps < PLATFORM_QUALITY.eps_floor || rho < PLATFORM_QUALITY.rho_floor;
}

// Classify the gap: more advisors can help a reasoning-gap; only the
// principal's own data can close a data-gap.
export function classifyGap(opts: {
  missingLanes: string[];
  secondaryLaneCount: number;
  closingAction?: string;
  closingGap?: string;
  needsExternalInfoHinted?: boolean;
}): GapType {
  if (
    opts.closingAction === "needs_external_info" ||
    opts.needsExternalInfoHinted === true
  ) {
    return "data";
  }
  if (opts.missingLanes.length > 0) return "reasoning";
  if (opts.secondaryLaneCount > 0) return "reasoning";
  // Default: when we have no signal of missing client facts, treat the
  // honest below-floor cap as a reasoning-gap so the ladder gets one
  // chance to clear it.
  return "reasoning";
}

export type EscalationDecision = {
  shouldEscalate: boolean;
  to_mode?: EscalationMode;
  // Reason it didn't fire — surfaced for diagnostics, not returned to client.
  reason_blocked?:
    | "ladder_off"
    | "above_floor"
    | "degraded"
    | "stakes_below_min"
    | "hops_exhausted"
    | "at_council"
    | "data_gap";
};

export function decideEscalation(opts: {
  mode: EscalationMode;
  eps: number;
  rho: number;
  degraded: boolean;
  stakes: string;
  hops: number;
  gapType: GapType;
}): EscalationDecision {
  if (!PLATFORM_QUALITY.escalate_below_floor) {
    return { shouldEscalate: false, reason_blocked: "ladder_off" };
  }
  if (!isBelowPlatformFloor(opts.eps, opts.rho)) {
    return { shouldEscalate: false, reason_blocked: "above_floor" };
  }
  if (opts.degraded) {
    return { shouldEscalate: false, reason_blocked: "degraded" };
  }
  if (!stakesAtLeast(opts.stakes as never, PLATFORM_QUALITY.escalate_min_stakes)) {
    return { shouldEscalate: false, reason_blocked: "stakes_below_min" };
  }
  if (opts.hops >= PLATFORM_QUALITY.max_escalations) {
    return { shouldEscalate: false, reason_blocked: "hops_exhausted" };
  }
  if (opts.gapType === "data") {
    return { shouldEscalate: false, reason_blocked: "data_gap" };
  }
  if (opts.mode === "council") {
    return { shouldEscalate: false, reason_blocked: "at_council" };
  }
  const to_mode: EscalationMode = opts.mode === "solo" ? "panel" : "council";
  return { shouldEscalate: true, to_mode };
}

export function stampTerminalCap(
  quality: QualityTelemetry,
  opts: { eps: number; rho: number; gapType: GapType; ask?: string },
): void {
  if (!isBelowPlatformFloor(opts.eps, opts.rho)) return;
  quality.below_floor_terminal = {
    capped: true,
    gap_type: opts.gapType,
    final_eps: opts.eps,
    final_rho: opts.rho,
    ask: opts.ask,
  };
}
