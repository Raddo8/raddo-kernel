## Goal

Live re-probe is GREEN — `convene_council` and cross-domain `summon_best_advisor` both return full minutes with dissent attributed to Abe. The earlier `internal_error` was transient (cold-start / deploy propagation). Per the directive: stand down on the bug hunt, apply **Option-2 structural hardening + diagnostics** as the durable fix for that failure class so the next single-chair fault degrades instead of downing the board.

Scope: `supabase/functions/mcp-council/index.ts` only. No schema, no UI, no triage/routing changes, no new chairs.

## Changes

### 1. Per-chair isolation in `runCouncilWithResynth` (~line 429) and `runPanelWithResynth` (~line 721)

Replace the Stage-1 `Promise.all(...callAnthropic(...))` with `Promise.allSettled`. For each fulfilled result, push to `stage1Results`. For each rejected, log structured drop and continue:

```ts
console.warn("council_chair_dropped", JSON.stringify({
  seat_id, seat_name, tenant, mode, question_hash,
  error_class: err?.name ?? "Error", message: String(err?.message ?? err).slice(0, 300),
}));
```

Track `dropped_chairs: Array<{id,name,reason}>` on `metrics`.

### 2. Degradation floor (no throw)

After drops:
- **council**: require ≥4 of 6 chairs (5 standard + KNOX legal). Below floor → degraded-minute path.
- **panel**: require ≥2 of N. Below floor → degraded-minute path.

Degraded-minute path: still run Stage-2 horizon + Stage-3 synthesis on the surviving contributions, stamp `degraded: true`, list `dropped_chairs` in metadata, cap surfaced confidence (see §5). Do NOT throw `panel_too_small` (line 756) on the degraded branch — only throw if Stage-1 returned zero contributions AND synthesis cannot run at all.

### 3. Stage-3 synthesis repair retry

Wrap the existing Stage-3 `callAnthropic` + `validateMinute(extractJson(...))` block (lines ~497–509 council, ~790–802 panel) in a single try/catch. On `minute_unparseable` or `minute_shape`, run ONE repair pass appending to the user prompt:

> "Your previous reply was not a single valid JSON object. Return ONLY the JSON object specified in the lead-synthesis schema. No prose, no fence, no commentary."

If the repair pass also fails, surface a structured degraded minute using the fallback already defined in `lead-synthesis.ts`, with `degraded: true` and gap `"synthesis_unparseable"`. Never let `minute_shape` / `minute_unparseable` bubble to the gateway as `internal_error` on this path.

### 4. `participating_chairs` reflects actual contributors

Derive from `stage1Results` after drops:
```ts
const participating = stage1Results.map((r) => r.name);
```
For council mode include the synthesizing chair (Leo) even if dropped from Stage-1 (Leo authors Stage-3); flag that case in metadata.

### 5. Degraded ε·ρ honesty cap surfaced in the minute body

Caps below are **defaults · tunable in `routing-config.ts`** (not magic numbers); name them `DEGRADED_EPS_CAP = 0.60`, `DEGRADED_RHO_CAP = 0.55`, `DISSENT_MISSING_RHO_CAP = 0.55`.

When `degraded: true`:
- Cap `confidence.epistemic` at `min(model_eps, DEGRADED_EPS_CAP)` and `confidence.rigor` at `min(model_rho, DEGRADED_RHO_CAP)`.
- Prepend one short sentence to `recommendation`: `"Degraded board · {N} of {M} chairs contributed this run ({dropped names}). Treat as directional, not authoritative."` Middot, no em-dashes.
- Add a horizon item naming the missing lens's blind spot.

### 6. Abe-dropped path: dissent unavailable AND rigor capped

**Binding rule:** if Abe is in `dropped_chairs`, treat the run as degraded regardless of whether the §2 chair-count floor was breached. Rationale: the dissent / falsification step is structurally part of rigor; a recommendation that was never stress-tested is by definition less rigorous, and the surfaced ε·ρ must reflect that — not just live in a metadata field.

Concretely, when Abe is in `dropped_chairs`:
- Set `degraded: true` even if N≥4 of 6 (council) or N≥2 (panel).
- Cap `confidence.rigor` at `min(model_rho, DISSENT_MISSING_RHO_CAP = 0.55)`. Leave `confidence.epistemic` uncapped on this branch unless §5's count-floor cap also fires (then take the stricter of the two).
- In the Stage-3 prompt, append: `"Abe (dissent chair) did not return this run. Set the `dissent` field to: 'Dissent unavailable this run · Abe dropped ({error_class}). The recommendation has not been falsification-tested; treat the load-bearing assumption as unverified.'"`
- Stamp `metadata.dissent_status = "unavailable"` and add `dropped_chairs` entry for Abe.
- Adjust the §5 degraded-recommendation prefix to mention dissent specifically when Abe is the only drop: `"Dissent unavailable this run · the recommendation has not been falsification-tested. Treat as directional, not authoritative."`

This guarantees the dissent-field text ("the load-bearing assumption is unverified") matches the surfaced confidence read instead of contradicting it.

### 7. Outer wrapper (lines ~1430–1500 gated callers + ~1019/1045/1146 invocations)

`runCouncilGated` / `runPanelGated` already catch and map. Audit the catch sites that currently translate to `internal_error`:
- Keep `internal_error` ONLY for truly unhandled exceptions (network blowup pre-Stage-1, Anthropic auth fail, etc.).
- The graceful-degrade path returns a normal minute object with `degraded: true` — flows through the existing success branch, no new error code at the MCP layer.
- The existing `minute_shape` / `minute_unparseable` mapping in `mcp-gateway` stays as belt-and-suspenders for any path the new repair retry doesn't cover.

### 8. Residual rename grep

`rg -n "seatName|spock|iroh|lexi" supabase/functions/mcp-council/` — two known benign hits at `index.ts:751` and `:1121` (defensive `lexi → knox` legacy aliases) plus the Kirk/Spock analogy in `council/abe.ts` (doctrine · leave). Zero runtime references to `spock`/`iroh`/`seatName`. Document the two `lexi` aliases inline as legacy compat.

### 9. Light Option-3 pass (not a blocker)

Post-deploy, via `supabase--curl_edge_functions`:
- existential-stakes question (forces full board);
- ≥4-lane question that escalates;
- forced-single-chair-failure (inject a throw on one chair temporarily) → confirm `degraded: true` minute, never `internal_error`;
- forced-Abe-drop → confirm rigor capped ≤0.55, `dissent_status: "unavailable"`, and the dissent-field text matches.

## Acceptance

1. `convene_council` returns a full minute with dissent attributed to Abe · participating chairs match contributors.
2. Cross-domain `summon_best_advisor` (legal + people) returns a panel minute · no `internal_error`.
3. `show_council` unchanged.
4. Forced single-chair failure → `degraded: true` minute naming the dropped seat in `recommendation` + `metadata.dropped_chairs` · never `internal_error`.
5. **Forced Abe-drop with N≥4 surviving chairs → `degraded: true`, `confidence.rigor ≤ 0.55`, `metadata.dissent_status = "unavailable"`, dissent-field text states the recommendation was not falsification-tested.**
6. Solo `summon_best_advisor` regression: unchanged minute shape, no degraded flag.
7. Logs show `council_chair_dropped` lines only when a chair actually fails.

## Out of scope

- New Growth/Revenue and Vision/Strategy chairs (separate task · prerequisite is this hardening).
- Triage thresholds, routing-config dials beyond the three new cap constants, JSON minute contract changes, tenant-context layer.
- Front-end / consent page / brand surface.

## Files touched

- `supabase/functions/mcp-council/index.ts` (primary).
- `supabase/functions/mcp-council/routing-config.ts` (add the three tunable cap constants).
