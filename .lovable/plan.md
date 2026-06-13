# Seat FELIX + AIMS onto the hardened Council path (rev 2)

Seat both new chairs on the multi-advisor path that just shipped. Two new agent files (council/single bodies), wire them into every seat map the council, panel, and solo paths iterate, add their lanes to triage, enforce the four seam rules, and re-express the degradation floor as a ratio so it scales with the 8-seat roster. No changes to the minute contract, triage thresholds, or tenant layer.

## 1. New chair bodies (verbatim personas)

Create four files using the existing `council/*.ts` / `agents/*.ts` pattern (each file exports a default string):

- `council/felix.ts`, `council/aims.ts` — chair-mode bodies (Stage-1 prose contribution shape, same framing as the other `council/*.ts` files).
- `agents/felix.ts`, `agents/aims.ts` — single-mode bodies (single-JSON shape, same framing as `agents/leo.ts`).

Personas pasted verbatim from the dispatch — every numbered principle and boundary clause preserved exactly. **Chair-mode adaptation (verify):** the persona's final "Output: ... Frame-choice line first ..." instruction is reshaped in `council/aims.ts` so AIMS-as-chair contributes the *frame-choice judgment* (which mode the question is in, plus the diagnosis/direction reasoning) as Stage-1 input. Leo prints the explicit `Frame-choice:` line in the final minute per seam rule (a) — chairs don't author the final-minute line themselves. Same pattern as existing chair bodies: persona spine intact, output framing adjusted for the synthesis stage. Single-mode (`agents/aims.ts`) keeps the persona's original output framing since AIMS *is* the author there.

## 2. Registry wiring (every seat map · §1 of the dispatch)

`mcp-council/index.ts`:
- Import `FELIX_MD`, `AIMS_MD`, `FELIX_AGENT_MD`, `AIMS_AGENT_MD`.
- Append to `CHAIRS` (line 67): FELIX + AIMS. This is what the hardened `Promise.allSettled` in `runCouncilWithResynth` iterates, so per-chair isolation picks them up automatically.
- Add `felix`/`aims` to BOTH `SINGLE_BODIES` maps (line 164 in `loadAgent`, line 900 in `chairForSpecialistId`).
- Extend the name lookup in `chairForSpecialistId` (line 915).

`mcp-council/agents/manifest.ts`:
- Add two `kind: "single"` entries (`felix`, `aims`, `enabled: true`) so `findEnabledAgent` resolves them and `listSeatedAgentsPublic` returns the 8-seat roster for `show_council`.

## 3. Triage lanes (§2 of the dispatch)

`routing-config.ts`:
- Extend `Lane` union with `"growth" | "vision"`.
- **Re-express the council degradation floor as a ratio, not a literal.** The hardening currently encodes `council_min_chairs: 4` (written when the board was 6). Replace with `council_min_ratio: 0.66` (round up; floor for 6 stays 4, floor for 8 becomes 6) — OR keep an absolute `council_min_chairs` but recompute it from the live `CHAIRS.length + 1 (KNOX)` at call time in `runCouncilWithResynth`. Pick the call-time computation: it's the single seam where seating meets hardening, and a constant will go stale again the next time we seat. Panel ratio stays `panel_min_chairs: 2` (absolute is correct for variable panel sizes).

`triage.ts`:
- Add `"growth"` and `"vision"` to `VALID_LANES`.
- Extend lane definitions in `TRIAGE_SYSTEM` (FELIX ← demand/GTM/positioning/channels/pricing-for-growth/retention/NRR; AIMS ← vision/direction/strategy kernel/where-to-play/focus/Power/flywheel/self-executing master plan/multi-horizon).
- Extend `laneToId`: `growth → "felix"`, `vision → "aims"`.
- Extend `FULL_BOARD_IDS` with `"felix"`, `"aims"` so `fullBoardWithLegal` returns all 8 ids for Gate A0/A1.
- Gate A2/B filler heuristic: `growth → finance`, `vision → ops` (default), **but rule (d) below overrides this on any one-way-door — Lucius is always added.**

## 4. Seam rules (§3 + user refinements)

All four enforced inside `runCouncilWithResynth` / `runPanelWithResynth` post-Stage-1, before Stage-3 synthesis prompt assembly. **Primary trigger: the triage signal (`primary_lane`, `one_way_door`, `stakes`). Regex on question text is supplemental, not primary.** Every fire stamps `metadata.seam_fired: [...]` plus its specific metadata key, so the 30-day watch has tuning data.

a. **AIMS revenue-goal first-test → FELIX (biased toward firing).** Primary trigger: `triage.primary_lane === "growth"` OR (`secondary_lanes.includes("growth")` AND question matches a revenue-number supplement regex — "close $", "hit the number", "Nx revenue", "this quarter / this year"). When the trigger fires AND AIMS is in the chair set, the Stage-3 synthesis prompt forces Leo to print `Frame-choice: [NEW DIRECTION → AIMS leads | PULL HARDER → FELIX leads]` in the minute body and defaults the recommendation owner to FELIX unless AIMS's contribution explicitly flagged a genuine new-direction need (parsed from AIMS's Stage-1 output). **Bias rule: when ambiguous, default to FELIX-leads** — the dangerous miss is AIMS seizing a pull-harder ask. Stamp `metadata.frame_choice = { ruling: "felix" | "aims", source: "triage" | "regex" | "aims_flag" }`.

b. **AIMS → Leo handoff required.** When AIMS is a contributing chair, the synthesis prompt mandates a "Leo handoff" section in the minute body. If absent from the parsed minute, push `"leo"` into `metrics.missing_lanes` and stamp `metadata.handoff_missing = true`.

c. **FELIX pricing → Lucius co-sign.** Primary trigger: FELIX contributing AND FELIX's Stage-1 output flags a price/discount move (parse FELIX's contribution for pricing keywords + a margin/cash impact signal). Supplemental regex on question text. If Lucius isn't seated, push `"lucius"` to `missing_lanes` and append a co-sign line to the synthesis prompt. Stamp `metadata.pricing_cosign = { caller: "felix", to: "lucius" }`.

d. **Survival-risking one-way-door → Lucius + full-panel co-sign (hardened trigger).**
  - **Always-add Lucius:** when `triage.one_way_door === true`, ensure Lucius is in the chair set regardless of primary_lane (closes the vision-one-way-door hole where the filler heuristic would pull Leo instead of Lucius). Implement at the chair-assembly seam in `runPanelWithResynth` — before the chair list is finalized, if `triage.one_way_door && !chairIds.includes("lucius")` then push `"lucius"`.
  - **Severity-first trigger:** survival-risk fires when (Lucius's contribution has `severity >= "high"`) OR (`risk_flags` keyword match for `survival|existential|insolvency|cash-out|exhausts runway|runway gone|out of cash`) OR (Lucius's `closing_action === "needs_external_info"` AND he names a survival concern in his note). Severity is the primary signal; keyword set is supplemental and expanded for paraphrase coverage.
  - When fired, promote the run to council mode (add any missing seated chairs through the hardened `Promise.allSettled` path so a chair drop still degrades cleanly) and stamp `metadata.cosign = { caller: "lucius", panel: [...participating_chairs], trigger: "severity" | "keyword" | "closing_action" }`.

## 5. 30-day governance trip-wires (§4 · runtime stamps)

Surface in `metadata` on every minute (no schema migration needed — fits existing JSONB column):

- `metadata.seam_fired: string[]` — array of `"frame_choice" | "handoff_required" | "pricing_cosign" | "survival_cosign"` for every seam that fired on this run. Single tuning signal for the 30-day watch.
- `metadata.frame_choice`, `metadata.pricing_cosign`, `metadata.cosign`, `metadata.handoff_missing` — per-rule detail as above.
- `metadata.boundary_flags` — array of `{chair, opined_on_lane, missing_handoff}` from KNOX boundary-bleed pass: when KNOX is in the chair set, parse each chair's contribution for out-of-lane opinion without a handoff.

14-day fallback + 30-day KNOX memo are operational procedures, documented in `MIGRATIONS.md` under "FELIX/AIMS seating · 30-day watch."

## 6. Acceptance probes (§5 + verify items)

Via `supabase--curl_edge_functions` against `/mcp-gateway`:

1. `show_council` → 8-seat roster including FELIX + AIMS.
2. Pure demand/pricing question → routes solo to FELIX, returns minute.
3. "Where should this business go in 3 years" → routes solo to AIMS, minute includes Leo handoff section.
4. "How do we close $X this quarter" → AIMS Frame-Choice line visible, FELIX leads (no double-ownership). `metadata.frame_choice.ruling === "felix"`, `metadata.seam_fired.includes("frame_choice")`.
5. `convene_council` with existential question → full 8-chair minute, dissent attributed to Abe, no `internal_error`. **Floor check: forced-drop of 2 chairs (8 → 6 surviving) stays GREEN; forced-drop of 3 (8 → 5 surviving) triggers degraded-minute path with the new ratio floor.** Forced-Abe-drop still caps rigor ≤ 0.55.
6. **One-way-door vision question** ("should we shut down the consumer line?") → Lucius is in the chair set even though primary_lane is vision; if Lucius flags severity high, `metadata.cosign` populated.
7. **Verify (no fix):**
   - AIMS-as-chair contribution does NOT print the final `Frame-choice:` line itself — Leo prints it at synthesis (inspect Stage-1 trace vs final minute).
   - Regression set: 5 ordinary ops questions still route to Leo, 5 ordinary finance questions still route to Lucius (growth/vision lanes don't over-capture). 6-seat solo/panel summons unchanged in shape.

## 7. Out of scope

- Abe's visibility in `show_council`.
- Triage threshold dials beyond adding the two lanes.
- Minute contract / tenant layer changes.
- Front-end / consent / brand surface beyond the manual chiefofbusiness.ai push after gateway acceptance.

## Files touched

- new: `council/felix.ts`, `council/aims.ts`, `agents/felix.ts`, `agents/aims.ts`
- edit: `index.ts` (CHAIRS, both SINGLE_BODIES, chairForSpecialistId name map, seam-rule helpers, synthesis-prompt injection, metadata stamps, **ratio-based council floor computed from `CHAIRS.length + 1`**, always-add-Lucius on one_way_door)
- edit: `agents/manifest.ts` (two new single entries)
- edit: `routing-config.ts` (Lane union + growth/vision; council floor as ratio or call-time computation)
- edit: `triage.ts` (lane vocab, laneToId, FULL_BOARD_IDS, filler heuristic)
- edit: `MIGRATIONS.md` (30-day watch notes)
