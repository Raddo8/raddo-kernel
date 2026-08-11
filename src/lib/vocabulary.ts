// Controlled vocabularies, mirrored from the database.
//
// Why this file exists: on 2026-08-11 a strict verification-state vocabulary
// was enforced by trigger without first inventorying what live writers emit.
// The decision writer emits "recorded", which had no alias row, so every
// tenant's decision register went down until an alias was added. A controlled
// vocabulary is only safe if the writer inventory is written down next to it.
//
// Any value a writer can emit MUST appear in the matching accepted set here
// AND in the database alias table. `vocabulary-guard.test.ts` fails the build
// when a source file emits a value this file does not accept.

export const VERIFICATION_STATE_CANONICAL = [
  "unverified",
  "asserted",
  "probe_passed",
  "probe_failed",
  "verified",
  "unverified_legacy",
  "disputed",
] as const;

/** alias -> canonical, mirroring public.verification_state_alias. */
export const VERIFICATION_STATE_ALIASES: Readonly<Record<string, string>> = {
  asserted: "asserted",
  claimed: "asserted",
  recorded: "asserted",
  disputed: "disputed",
  gate_verified: "verified",
  legacy: "unverified_legacy",
  none: "unverified",
  pending: "unverified",
  "probe-failed": "probe_failed",
  "probe-passed": "probe_passed",
  probe_failed: "probe_failed",
  probe_passed: "probe_passed",
  unknown: "unverified",
  unverified: "unverified",
  unverified_legacy: "unverified_legacy",
  verified: "verified",
};

export const LOOP_STATE_CANONICAL = [
  "open",
  "blocked",
  "waiting",
  "done",
  "dropped",
] as const;

/**
 * Loop-state synonyms the database accepts. Kept as a set rather than a map:
 * the canonical mapping lives in public.loop_state_alias and the guard only
 * needs to know whether a value resolves at all.
 */
export const LOOP_STATE_ACCEPTED: ReadonlySet<string> = new Set([
  ...LOOP_STATE_CANONICAL,
  "abandoned", "active", "auto-resolved", "auto_resolved", "awaiting",
  "backlog", "canceled", "cancelled", "closed", "closed_out", "complete",
  "completed", "deferred", "finished", "in-progress", "in-review",
  "in_progress", "in_review", "inprogress", "monitoring", "new",
  "not-started", "not_started", "on-hold", "on_hold", "ongoing", "parked",
  "paused", "pending", "queued", "resolved", "scheduled", "snoozed",
  "started", "stuck", "superseded", "to-do", "todo", "tracking",
  "under_review", "waiting-on", "waiting_on", "watching", "wontfix",
]);

export function resolvesVerificationState(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    VERIFICATION_STATE_ALIASES,
    value.trim().toLowerCase(),
  );
}

export function resolvesLoopState(value: string): boolean {
  return LOOP_STATE_ACCEPTED.has(value.trim().toLowerCase());
}
