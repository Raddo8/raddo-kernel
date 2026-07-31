// supabase/functions/mcp-council/agents/eval-gate.ts
//
// Raise-the-Bar · platform eval pass-mark plumbing.
// Vault-side gate (Brahan/COB) · never surfaced to clients.
//
// Latent today: with no `eval_score` on a manifest entry, every check is a
// no-op (preserves the operator-seats-it gate). Once the stress-test /
// eval harness ships (AGENT_SUITE_GAMEPLAN Phase 5), it writes scores onto
// manifest entries and these checks become live.

import { PLATFORM_QUALITY } from "../routing-config.ts";

// Structural shape — avoids a circular import with manifest.ts.
type EvalScored = { eval_score?: number };

// `false` only when there IS a score AND it falls below the platform seat
// mark. Absent score → unblocked (today's behavior unchanged).
export function canSeat(entry: EvalScored): boolean {
  if (entry.eval_score == null) return true;
  return entry.eval_score >= PLATFORM_QUALITY.eval_seat_mark;
}

// Internal vault-side flag for the Brahan retain-review queue. Never
// auto-pulls a seat. Never surfaces to a client.
export function retainCheck(
  entry: EvalScored,
): { decertification_candidate: boolean } {
  if (entry.eval_score == null) return { decertification_candidate: false };
  return {
    decertification_candidate:
      entry.eval_score < PLATFORM_QUALITY.eval_retain_mark,
  };
}

