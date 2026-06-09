
# Confidence-gated routing + `summon_best_advisor`

Scope: `supabase/functions/mcp-council/` only. Builds on the just-shipped LEXI/KNOX legal-seat layer. No DB schema changes (routing ledger rides on `mcp_usage_events.metadata jsonb`; if column absent, one-line migration).

## 0. Mode tiering (binding · corrects Gate A)

Three modes, never collapsed:

- **solo** — one specialist runs the confidence loop alone.
- **panel** — 2–4 lanes (relevant specialists only). Default escalation target.
- **council** — full 6-chair board (Leo · Spock · Lucius · Alfred · Iroh · seated legal). **Reserved for existential / phase-level tier OR when triage implicates ≥3 distinct lanes.**

Existential tier ≈ pivot, shutdown, whole-company M&A, sue-the-co-founder, founder-removal, bet-the-company. Triage surfaces this as `stakes:"existential"` (new fourth value) OR `one_way_door && triage names ≥3 lanes`.

One-way-door and ordinary high-stakes (personal guaranty, MSA signature, bridge loan) → **panel-minimum, never auto-council**. This is the cost fix.

## 1. New file · `confidence.ts`

Shared completion-loop engine used by every tool.

- `type ClosingAction = "none" | "gather_context" | "add_lens" | "re_reason" | "escalate_panel" | "needs_external_info"`.
- `type ProduceResult<T> = { output: T; epsilon: number; rho: number; closing_action: ClosingAction; gap?: string }`.
- `runWithConfidenceFloor<T,S>(produce, opts) → { output, epsilon, rho, done|capped|escalate, gap?, iters, calls }`.
  - Loop: if `ε≥eps_min && ρ≥rho_min` → `done`.
  - Else branch on `closing_action`: internal actions (`gather_context | add_lens | re_reason`) → `apply(state)`, loop; `escalate_panel` → return `escalate:true`; `needs_external_info` → `capped:true` with `gap`.
  - Guards: `max_iters` (default 3), `budget_calls` (default 6), diminishing-returns stop (Δε < 0.02 → capped). Never inflate ε/ρ between calls — only a fresh `produce` updates them.

## 2. New file · `triage.ts` (internal · not a public tool)

`triage(question, context, tenant) → TriageDecision`:

```ts
type Lane = "legal"|"finance"|"ops"|"trust"|"people"|"strategy";
type Stakes = "low"|"medium"|"high"|"existential";
type Mode = "solo"|"panel"|"council";

type TriageDecision = {
  primary_lane: Lane;
  lane_confidence: number;          // 0..1
  secondary_lanes: Lane[];          // distinct from primary
  one_way_door: boolean;
  stakes: Stakes;
  recommended_mode: Mode;
  chairs: string[];                 // specialist ids in order
  reasoning: string;
};
```

- Haiku-class model (`claude-haiku-4-5`, fallback `claude-sonnet-4-5`). Classifies only; never answers.
- Lane → seated specialist id (tenant-aware):
  - `legal → getLegalSeat(tenant)` (lexi or knox)
  - `finance → "lucius"`
  - `ops → "leo"`
  - `trust → "alfred"`
  - `people → "iroh"`
  - **`strategy → "leo"`** (solo-capable; council is NEVER chosen from a lane label, only from stakes tier or ≥3-lane fanout).

### Mode-selection gates (post-classification, in `triage.ts`)

In strict precedence:

1. **Gate A0 (existential):** `stakes === "existential"` → `mode = "council"`, `chairs = full board`.
2. **Gate A1 (multi-lane fanout):** distinct lanes (primary ∪ secondary) `.length ≥ 3` → `mode = "council"`, `chairs = full board`.
3. **Gate A2 (one-way-door OR high-stakes):** `one_way_door || stakes === "high"` → `mode = "panel"`, `chairs = [primary, ...secondary]` mapped to seated ids, capped at 4. **Never solo. Never auto-council.**
4. **Gate B (routing uncertainty):** `lane_confidence < τ_route (0.85)` → `mode = "panel"`, `chairs = [primary, ...secondary].slice(0,4)`.
5. Else → `mode = "solo"`, `chairs = [primary]`.

`chairs` never contains a non-seated legal id; `lexi`/`knox` always collapse to `getLegalSeat(tenant)`. If legal is one of the panel lanes, the seated legal id is used.

## 3. New file · `routing-config.ts`

```ts
export const ROUTING_CONFIG = {
  tau_route: 0.85,
  tau_fit: 0.80,
  floor: { eps_min: 0.90, rho_min: 0.88 },
  stakes_floor_panel: "high",       // panel-min trigger
  stakes_floor_council: "existential", // council trigger
  multi_lane_council_threshold: 3,  // ≥3 distinct lanes → council
  stakes_floor_dissent: "medium",   // steelman trigger
  max_iters: 3,
  budget_calls: 6,
} as const;
```

All dials live here; tune from ledger.

## 4. Rename + rebuild · `consult_advisor` → `summon_best_advisor`

In `index.ts`:

- New tool descriptor `TOOL_SUMMON_BEST_ADVISOR`:
  - `name: "summon_best_advisor"`, title "Summon the Best Advisor".
  - inputSchema: `{ question: string, context?: string }` (no `agent_id`).
- Backwards alias: `tools/call` accepting `name === "consult_advisor"` routes to the new handler. Any `agent_id` arg is captured as `routing_hint` and logged — **never honored as directive**.
- `tools/list` now exposes: `convene_council`, `summon_best_advisor`, `file_to_office`, `show_council`. `consult_advisor` is unadvertised but accepted for one release.

Handler flow:

1. `const t = triage(question, context, tenant)`.
2. If `t.recommended_mode === "council"` → `runCouncil(...)` (full board, tenant-aware seated legal already wired).
3. If `t.recommended_mode === "panel"` → `runPanel(question, context, t.chairs, tenant)` (see §6).
4. Else `solo`:
   - `loadAgent(t.chairs[0], clientContext, tenant)`.
   - `runWithConfidenceFloor` over the specialist with `apply` handling `gather_context | add_lens | re_reason`.
   - **Gate C (post-spec):** if `lane_fit < τ_fit(0.80) || missing_lanes.length || refer_to`:
     - If single `refer_to` and not yet retried → re-route once to `refer_to` (one hop, also seated-collapsed).
     - Else escalate to `runPanel` over `[primary, ...missing_lanes]`.
   - **Gate D (dissent · `stakes >= "medium"`):** run a self-steelman pass (same specialist, opposite stance, then reconcile). If steelman materially moves the recommendation → escalate to `runPanel`. (Self-steelman is weaker than a second lens; acceptable v1, called out in ADR.)
5. Return:
   ```ts
   { selected_advisor, mode: "solo"|"panel"|"council", minute,
     lane_fit, missing_lanes, refer_to,
     epsilon, rho, capped?, gap?, routing_trace }
   ```
   `routing_trace = { triage, gates_fired: string[], iters, calls, hops, routing_hint_ignored?: boolean }`.

## 5. Specialist contract extension · `agents/*.ts`

Extend every persona body (`knox`, `lexi`, `lucius`, `leo`, `alfred`, `iroh`) JSON output:

```
{ agent, assessment, recommendation, risk_flags, severity,
  confidence: { epistemic, rigor },
  escalation, signature,
  lane_fit: 0..1,
  missing_lanes: [string],         // lane labels, not ids
  refer_to: string|null,           // a better-suited advisor id
  closing_action: "none"|"gather_context"|"add_lens"|"re_reason"|"needs_external_info",
  steelman: string                 // required when severity >= medium
}
```

Append discipline line to every persona:
> "Before returning, score ε and ρ honestly; if either is below floor, set `closing_action` to what would close the gap; never inflate to exit. Report `lane_fit` candidly — if this isn't your lane, say so and set `refer_to`."

Update `validateSingleMinute` to require the new fields with safe defaults (`lane_fit=1`, `missing_lanes=[]`, `refer_to=null`, `closing_action="none"`, `steelman=""`).

## 6. Panel runner · `runPanel` and council loop

- **`runPanel(question, context, chairs[], tenant)`**: thin variant of `runCouncil`. Stage-1 over the supplied chair list (2–4 specialists, each in chair-mode override so legal personas don't emit single-advisor JSON), Stage-2 Leo horizon, Stage-3 Opus synthesis → minute. Same `validateMinute` shape; `participating_chairs` reflects actual panel.
- **`runCouncil`** unchanged structurally (full 6-chair board with seated legal), but now wrapped in `runWithConfidenceFloor`:
  - `apply` for `add_lens`: triage chair contributions, pull in one more relevant chair, re-run Stage-1 just for that chair, re-synthesize.
  - `apply` for `re_reason`: re-run Stage-3 synthesis only (cheap).
  - `needs_external_info` → return minute with `capped:true, gap`.
- Spock dissent stays mandatory in `council`. In `panel`, if Spock isn't a chair, Gate-D steelman pass substitutes (run by Leo over the panel output).
- `file_to_office` continues to use `runCouncil` only when triage selects council; otherwise it files whatever mode triage chose (clarified server-side — file_to_office runs the same triage→mode pipeline so OFFICE entries match the actual deliberation that happened).

`validateMinute`: already accepts dynamic `participating_chairs`; add `capped?: boolean`, `gap?: string` passthrough.

## 7. Routing ledger

Extend `recordMcpUsage` to accept `routing_log` and write into `mcp_usage_events.metadata jsonb`:

```ts
routing_log: {
  question_hash: sha256(question).slice(0,16),
  triage: { primary_lane, lane_confidence, one_way_door, stakes, mode },
  gates_fired: ["A0"|"A1"|"A2"|"B"|"C"|"D"|"floor"|"capped"],
  selected_advisor, escalated, final_mode,
  epsilon, rho, capped, iters, hops,
  routing_hint_ignored?: boolean
}
```

No raw question text. Hash only. Confirm `metadata jsonb` exists on `mcp_usage_events` before writing; if absent, add via one-line migration with GRANTs preserved.

## 8. Boundary scrub

Reuse `hasBoundaryViolation` on every emitted minute and on `routing_trace.reasoning` before return. No rule changes.

## 9. Out of scope (explicit)

- 100-agent library — capped at current 6 seated + council.
- Operator UI for thresholds — `routing-config.ts` in-code.
- Weekly cross-pollination scheduled council — separate spec.
- Independent second-lens steelman (true second specialist) — v2; v1 ships self-steelman.
- Promoting `routing_log` to a dedicated table — deferred until ledger volume justifies.

## Files touched

- new: `supabase/functions/mcp-council/confidence.ts`
- new: `supabase/functions/mcp-council/triage.ts`
- new: `supabase/functions/mcp-council/routing-config.ts`
- edit: `supabase/functions/mcp-council/index.ts` (rename tool + alias, new handler, `runPanel`, wrap `runCouncil` in loop, route `file_to_office` through triage, write `routing_log`)
- edit: `supabase/functions/mcp-council/usage.ts` (accept `routing_log` in `recordMcpUsage`)
- edit: `supabase/functions/mcp-council/agents/{knox,lexi,lucius,leo,alfred,iroh}.ts` (extend JSON contract + discipline instruction)
- edit: validators in `index.ts` (`validateSingleMinute`, `validateMinute`)

## Acceptance verification (SPINNEY bearer via `supabase--curl_edge_functions`)

1. `summon_best_advisor("review this NDA's indemnity")` → `mode:"solo"`, `selected_advisor:"KNOX"`, `lane_fit ≥ 0.85`, `routing_trace.triage.primary_lane:"legal"`.
2. `summon_best_advisor("should we take the bridge loan and will it survive the lawsuit")` → **`mode:"panel"` (NOT council)**, `participating_chairs = [Lucius, KNOX]` (or +1 if triage adds ops), `gates_fired` includes `"A2"` or `"C"`.
3. `summon_best_advisor("should I personally guarantee this loan")` → **`mode:"panel"` (NOT solo, NOT auto-council)**; one-way-door fires Gate A2 → panel-minimum.
4. `summon_best_advisor("should we shut the company down")` → `mode:"council"`, Gate A0 (`stakes:"existential"`).
5. `summon_best_advisor("strategy for next quarter")` → `mode:"solo"`, `selected_advisor:"Leo"` (strategy lane → Leo, not council).
6. Low-info question → minute `capped:true`, non-empty `gap`, `closing_action:"needs_external_info"`, ε not inflated.
7. Mis-hinted alias call: `consult_advisor({agent_id:"alfred", question:"should we refinance the mezz debt"})` → router ignores hint, routes to `lucius`; `routing_trace.routing_hint_ignored:true`.
8. Ledger row in `mcp_usage_events.metadata.routing_log` populated; `question_hash` present, raw question absent.
9. `convene_council` on an under-specified question → loops once (`add_lens` or `re_reason`), `iters ≥ 1`; on truly external-info-bound question → `capped:true` with `gap`.
10. Old `consult_advisor` name still accepted; `tools/list` no longer advertises it.
