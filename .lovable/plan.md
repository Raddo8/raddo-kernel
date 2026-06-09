## Goal

Append a content-only **BOUNDARY** clause to each council head so every head recognizes the edge of its competence and routes/flags instead of bluffing. JSON contract, validators, routing, and orchestration are unchanged. Boundary recognition must hold in both solo and council deliberation — a confident wrong-lane chair contribution is the same silent blind spot, just inside a panel.

## Scope

### Files to edit

Runtime / solo-summon personas — `supabase/functions/mcp-council/agents/`:
- `lucius.ts` — finance boundary (Quant / Tax / RE-Finance / VC / Derivatives / legal / licensed pro)
- `iroh.ts` — people boundary (employment-law / comp+equity math / union / clinical care)
- `alfred.ts` — trust boundary (legal exposure of disclosure / underlying merits / paid-media)
- `leo.ts` — router boundary (orchestrate, never substitute)

Council-mode personas — `supabase/functions/mcp-council/council/`:
- `lucius.ts`, `iroh.ts`, `alfred.ts`, `leo.ts` — mirror the same competence boundaries
- `spock.ts` — dissent boundary (stress-test, never author the domain answer)

KNOX is intentionally untouched — the spec names five heads; KNOX is already the legal lane.

### Mode-adapted action (within one shared boundary statement)

Each clause names the same out-of-scope list, then ends with a mode-conditioned action block:

- **Solo mode** (agents/*): when the question turns on an out-of-scope sub-domain, give a generalist read, set `refer_to` to the named specialist, add a `missing_lanes` flag if that specialist isn't seated, and include the disclosure rider: "generalist read · the [X] specialist doesn't exist yet; directional, not authoritative." Never answer out-of-scope at high confidence unflagged.
- **Council mode** (council/*): the panel already has the other lanes, so do NOT use `refer_to`. Instead, flag the out-of-scope portion inside this chair's contribution (named sub-domain + disclosure rider + cap your own confidence on that portion) so Leo's synthesis carries the gap forward. Never assert out-of-scope expertise at high confidence inside a panel contribution.

### Placement convention

Insert each clause as a new `## BOUNDARY` block, placed directly after the existing `## SEAT BOUNDARY` (or equivalent) section, before `## Global-preamble honor` / `## Output`. Lift the substantive content verbatim from `LOVABLE_SPEC_boundary_maps.md`, normalizing any em/en-dashes to middots (·) per the project's no-dash rule. The `→` arrow (used for routing in the spec) is not a dash and is preserved.

For Leo and Spock, the BOUNDARY is structural (orchestrate-don't-substitute / stress-test-don't-author) and reads the same in both modes; only Lucius/Iroh/Alfred carry the solo-vs-council action split.

### What does NOT change

- JSON output keys, types, `confidence.{epistemic,rigor}`, signatures
- `triage.ts`, routing thresholds, gate logic, validators
- `index.ts` orchestration, metrics, resynth path, timeouts
- Tool list, `consult_advisor` alias, advisor registry
- No DB migrations, no UI changes, no frontend changes

## Acceptance (from spec + the mode-adaptation rule)

1. `summon_best_advisor("what cap rate and DSCR should we target refinancing the warehouse?")` → Lucius solo: generalist read + `refer_to` (Real-Estate Finance) + `missing_lanes` flag + disclosure rider. Not confident expert depth.
2. `summon_best_advisor("model the LBO leverage and earnout")` → Lucius solo: refers to Quant (or escalates) with the rider.
3. Clean in-scope finance question → Lucius answers solo with no spurious `refer_to`, no missing_lanes flag (no over-referral).
4. `convene_council` on a question that touches an out-of-scope sub-domain (e.g. cap-table mechanics) → Lucius's chair contribution flags the cap-table portion + caps confidence on that portion + includes the rider inline; no `refer_to`; Leo's synthesis carries the gap forward.
5. BOUNDARY clauses present in all five personas across both runtime and council variants. JSON shape and ε·ρ unchanged.

## Verification

- Run the three solo acceptance prompts (1, 2, 3); paste trimmed JSON showing `refer_to` / `missing_lanes` / rider on (1)+(2) and clean solo on (3).
- Run one `convene_council` on a mixed-lane question (acceptance 4); confirm Lucius's contribution carries the inline flag + rider, Leo's synthesis surfaces the gap, JSON shape intact, and timing inside the function window.
- Sanity-check that an in-scope `convene_council` (no out-of-scope sub-domain touched) shows no spurious boundary riders from any chair.
