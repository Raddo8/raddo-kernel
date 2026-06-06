# BUILD DISPATCH — Global Preamble v2 + CLIENT_CONTEXT seam

Scope: `supabase/functions/mcp-council/` only. No profile/seed/schema/scrub/auth/cost/Notion changes.

## 1 · Replace `_global-preamble.ts` with GLOBAL_PREAMBLE_v2 (verbatim)

Overwrite `supabase/functions/mcp-council/agents/_global-preamble.ts` with the v2 text from the dispatch, used verbatim. Includes:

- Identity & boundary (propose · don't certify · stay in seat)
- ABC (Absolute · Brutal · Challenging)
- Anti-fabrication HARD + claim taxonomy (Documented Fact · Strong Inference · Working Hypothesis · Open Question)
- Two-axis confidence with calibration discipline (thin data / refusal = LOW ε; no rigor inflation)
- Gap-closure (name missing input + closing action before answering when ε/ρ would be < ~0.90)
- Underspecified-question discipline · always-weigh-null-option · audience/stakes calibration · present-day-fact grounding
- Council-mode + Spock dissent discipline (falsification-only)
- `<<CLIENT_CONTEXT>>` marker — Tier-1 grounding seam, empty today

Preserve exact wording (incl. `<<CLIENT_CONTEXT>>` marker and the explanatory note around it) so v2 is the single source of truth.

## 2 · Wire the CLIENT_CONTEXT injection seam in prompt assembly

Goal: a no-op today, populated later by Phase 2/3 without touching any agent file.

**`index.ts` changes (assembly only · no logic changes elsewhere):**

a. Add a helper:
```ts
function renderPreamble(clientContext: string = ""): string {
  return GLOBAL_PREAMBLE_MD.replace("<<CLIENT_CONTEXT>>", clientContext ?? "");
}
```

b. Add an optional `clientContext` parameter to:
   - `runCouncil(question, context, clientContext = "")`
   - `runSingleAgent(bundle, question, context, clientContext = "")`
   - `loadAgent(id, clientContext = "")` → builds the single-agent `system` using `renderPreamble(clientContext)` instead of raw `GLOBAL_PREAMBLE_MD`

c. In `runCouncil`, prepend the rendered preamble to each chair system at call time:
```ts
system: `${renderPreamble(clientContext)}\n\n${c.system}`
```
Same prepend for the Stage-2 horizon pass (`LEO_MD`) and Stage-3 lead-synthesis (`LEAD_SYNTH_MD`). This is the change that brings council chairs under the v2 floor (today they don't import the preamble).

d. MCP tool handlers (`cob_run_council`, `cob_ask_agent`, `cob_council_to_notion`) pass `""` for `clientContext` — the seam exists but is unwired, exactly as specified. No tool input-schema change.

e. Add a hidden test seam: read `clientContext` from an undocumented optional input field `_client_context` (string) on `cob_run_council` and `cob_ask_agent` ONLY when present, so the acceptance gate "passing a test context string flows into the prompt" can be proven via curl without exposing it as a customer-facing parameter. Not added to the tool inputSchema description; field is silently accepted by the handler.

## 3 · No profile rewrites

`agents/{knox,lucius,leo,alfred,iroh}.ts` and `council/{leo,spock,lucius,alfred,iroh,lead-synthesis,approach-principles}.ts` are NOT modified. v2 is the enforceable floor beneath them.

## Files

- MODIFY `supabase/functions/mcp-council/agents/_global-preamble.ts` — replace with v2 verbatim
- MODIFY `supabase/functions/mcp-council/index.ts` — `renderPreamble` helper · `clientContext` param threaded through `loadAgent` / `runCouncil` / `runSingleAgent` · prepend rendered preamble to council chair + horizon + lead-synthesis systems · accept `_client_context` test field in handlers

## Deploy & validation (post-build)

Deploy `mcp-council`. Then:

1. `cob_run_council` on the pricing question → two-axis ε/ρ, ε LOW without real numbers, minute names missing load-bearing inputs (gap-closure) and weighs null option.
2. `cob_ask_agent` (lucius) with a made-up-sounding figure → labels inference vs fact, no invented numbers.
3. Boundary probe → refusal scores LOW ε/ρ.
4. Seam proof: `cob_run_council` with `_client_context: "TEST_SEAM_TOKEN_XYZ"` — confirm via edge logs that the rendered preamble contains it (no agent rewrite needed).
5. Regression: 5 single agents + council + Notion write-back + `mcp_usage_events` rows unchanged in shape.

## Out of scope

Populating CLIENT_CONTEXT with real data (Phase 2/3) · per-profile prose trimming · OAuth/2B · tool inputSchema changes.
