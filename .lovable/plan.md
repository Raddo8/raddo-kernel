# Raise-the-Bar · platform quality standard (mcp-council)

A single global vault-level standard layered on the hardened multi-advisor path. Flipping it is a one-line edit by the platform owner; clients never see, set, or vary it. Hard invariant preserved: never inflates ε/ρ — only caps more honestly or escalates once.

Separate from FELIX/AIMS seating (green) and from the resilience/quorum ratio (untouched).

## 1. `routing-config.ts` — single global `PLATFORM_QUALITY`

Add a vault-only block. Two named value sets for our convenience only; the runtime always reads `PLATFORM_QUALITY`. No tenant/tier/entitlement lookup anywhere.

```ts
// VAULT-LEVEL · platform owner only. Not client-exposed. Not per-tenant.
const QUALITY_STANDARD = {
  current: {
    eps_floor: 0.88, rho_floor: 0.88,
    escalate_below_floor: false, max_escalations: 0,
    escalate_min_stakes: "medium",
    eval_seat_mark: 0.85, eval_retain_mark: 0.80,
    reprobe_every_interactions: 50, reprobe_every_new_specialists: 10,
  },
  elevated: {
    eps_floor: 0.92, rho_floor: 0.90,
    escalate_below_floor: true, max_escalations: 1,
    escalate_min_stakes: "medium",
    eval_seat_mark: 0.92, eval_retain_mark: 0.88,
    reprobe_every_interactions: 25, reprobe_every_new_specialists: 5,
  },
} as const;

export const PLATFORM_QUALITY = QUALITY_STANDARD.current;       // ← flip to .elevated globally
export const PLATFORM_QUALITY_VERSION: "current" | "elevated" = "current";
```

Explicitly do **not** add any `quality_profile` field to `tenants.ts` / `client_entitlements` / `TenantContext`. No resolver function. Single import site.

Leave `ROUTING_CONFIG.floor.eps_min` / `rho_min` in place — that governs the per-iteration `confidence.ts` loop. The new `PLATFORM_QUALITY` floors govern the **final minute-level** below-floor check only (the seam the dispatch targets).

## 2. `index.ts` — swap hardcoded 0.88 at the three minute-finalize sites

Replace the floor reads at:

- `runCouncilWithResynth` (~line 1483) — council post-synthesis gate
- `runPanelWithResynth` (~line 1529) — panel post-synthesis gate
- solo finalize (~line 1689) — `belowFloor` check before return

Each now reads `PLATFORM_QUALITY.eps_floor` / `.rho_floor`. The degraded-minute caps and the Abe-drop rigor cap stay untouched (separate honesty caps, not aptitude floors).

## 3. Escalate-below-floor ladder (uniform platform behavior)

New `escalate.ts` exporting `maybeEscalateBelowFloor({ minute, mode, triage, metrics, hops, rerun })`. Invoked **after** synthesis and the degraded/Abe-cap pass, **before** returning the minute.

Fires only when all hold:
- `PLATFORM_QUALITY.escalate_below_floor === true`
- minute is below `eps_floor` or `rho_floor`
- `minute.degraded !== true` (degraded path already capped honestly)
- `stakesAtLeast(triage.stakes, PLATFORM_QUALITY.escalate_min_stakes)`
- `hops < PLATFORM_QUALITY.max_escalations`

Gap classification:
- **Data-gap** — `metrics.closing_action === "needs_external_info"` OR Lucius/any chair flagged external info needed → **do not escalate**. Return capped; stamp `below_floor_terminal = { capped: true, gap_type: "data", final_eps, final_rho, ask }`. The synthesis "needs" line already names the missing inputs; re-surface in the stamp.
- **Reasoning-gap** — `missing_lanes` non-empty OR cross-lane (`triage.secondary_lanes.length > 0`) answered solo/panel → escalate one tier: `solo → panel(addedLanes = missing_lanes)`, `panel → council`. Re-run through the existing hardened path with `hops + 1`. Stamp `escalations.push({ from_mode, to_mode, reason: "reasoning_gap", cleared })`. Re-check floor after.

Bounded by `max_escalations` (default 1). If still below floor: return capped with `below_floor_terminal.gap_type` set and the last `escalations[].cleared = false`. Never loops, never mutates ε/ρ.

## 4. Eval pass-mark plumbing (latent until harness ships)

`agents/manifest.ts`: add optional `eval_score?: number` and `eval_scored_at?: string`. Today: absent — behavior unchanged.

New `agents/eval-gate.ts`:
- `canSeat(entry)` — returns `false` only when `entry.eval_score != null && entry.eval_score < PLATFORM_QUALITY.eval_seat_mark`. Absent score = unblocked (preserves today's Brahan-seats-it gate; this adds an objective precondition on top).
- `retainCheck(entry)` — when `eval_score != null && < eval_retain_mark`, returns `{ decertification_candidate: true }` for our internal alert path. Never auto-pulls. Never surfaced to client.

Wire `canSeat` into `findEnabledAgent` / `listSeatedAgentsPublic`. With no scores in manifest today, no behavior change.

## 5. Internal-only observability stamps

Attach to the run's `metrics`/internal `metadata` channel (the `mcp_usage_events.metadata` bag — vault-side telemetry, never rendered in the client-facing minute body or `show_council`):

- `quality_standard_version: "current" | "elevated"`
- `floor_applied: { eps_floor, rho_floor }`
- `escalations: [{ from_mode, to_mode, reason: "reasoning_gap", cleared }]` (empty array when none fired)
- `below_floor_terminal: { capped, gap_type: "reasoning" | "data", final_eps, final_rho, ask? }` (only when returning still-capped)

Audit pass: confirm none of these keys leak into the minute schema returned to clients or into `show_council`'s public roster output. They live only in our usage-events ledger.

## 6. Files touched

- edit: `supabase/functions/mcp-council/routing-config.ts` (add `QUALITY_STANDARD` + exported `PLATFORM_QUALITY` constant + version tag)
- edit: `supabase/functions/mcp-council/index.ts` (swap floor reads at 3 sites, invoke escalation helper, stamp internal telemetry, audit that nothing leaks to client surface)
- new: `supabase/functions/mcp-council/escalate.ts` (gap classifier + one-hop ladder)
- new: `supabase/functions/mcp-council/agents/eval-gate.ts` (latent seat/retain checks; no-op without scores)
- edit: `supabase/functions/mcp-council/agents/manifest.ts` (optional `eval_score` / `eval_scored_at` fields)
- edit: `supabase/functions/mcp-council/MIGRATIONS.md` (raise-the-bar standard · how Brahan flips the one line · explicit non-feature for clients)

Explicitly untouched: `tenants.ts`, any entitlement field, any client-facing component (`StatusBadge`, minute renderers, `ActionInspectorDrawer`, brand surfaces).

## 7. Acceptance (curl `/mcp-gateway` with `PLATFORM_QUALITY` temporarily pointed at `.elevated`)

1. **No client surface**: minute JSON returned to client contains no `quality_standard_version` / `floor_applied` / `escalations` / `below_floor_terminal`. `show_council` output unchanged.
2. **No per-tenant variance**: two distinct tenant tokens hitting the same borderline question get identical floor behavior — no entitlement/tier branch exists in code (grep confirms zero references to a quality field on `TenantContext`).
3. **Higher floor caps more**: borderline question that landed ε 0.90 clean under `current` returns capped (0.90 < 0.92) under `elevated` with the gap named; ε unchanged.
4. **Reasoning-gap escalates once**: cross-lane solo below-floor escalates one tier (solo→panel or panel→council), re-deliberates, then clears or returns capped. Internal telemetry: `escalations.length === 1`.
5. **Data-gap does NOT escalate**: `closing_action: "needs_external_info"` returns capped with named ask; `escalations === []`, `below_floor_terminal.gap_type === "data"`.
6. **Bounded**: no run exceeds `max_escalations`; no loops; latency stays sane.
7. **Degraded interaction**: chairs-dropped run does not escalate — returns the degraded minute with the existing cap.
8. **Eval gate latent**: with no `eval_score` in manifest, all seats remain seated. Planting a low score on a test entry blocks seating via `canSeat` and surfaces `decertification_candidate` via `retainCheck` (internal only).

Once green, the only activation step is Brahan flipping `PLATFORM_QUALITY = QUALITY_STANDARD.elevated` and `PLATFORM_QUALITY_VERSION = "elevated"`, then redeploy. Global, uniform, no client step.

## Out of scope

Per-client / per-tier quality control · quorum/degradation ratio · minute contract · triage dials · auto-decertification · building the eval harness itself.
