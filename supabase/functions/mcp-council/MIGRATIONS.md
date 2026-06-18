# Advisor rename · 2026-06-11

Seats renamed (label only · no logic / lens change):

| Old id | Old name | New id  | New name |
|--------|----------|---------|----------|
| marcus   | Marcus     | marcus  | Marcus   |
| abe  | Abe    | abe     | Abe      |

Lenses, routing, confidence, persona behavior, and tool schemas are unchanged.
For historical telemetry correlation, treat old ids as aliases of the new ids
(marcus ↔ marcus, abe ↔ abe).

---

## Felix/Aims seating · 30-day watch (2026-06-13)

Two new chairs seated onto the hardened multi-advisor path: **Felix**
(growth/revenue) and **Aims** (vision/strategy). Roster is now 8 chairs:
Leo · Abe · Lucius · Alfred · Marcus · Felix · Aims · Knox.

### Structural changes (runtime, not just doctrine)
- Council degradation floor is now a **ratio** (`council_min_ratio = 0.66`)
  computed at call time from the live `CHAIRS.length + 1`. 8 chairs →
  floor 6 surviving; 6 chairs → floor 4 surviving. No hardcoded literal.
- **Always-add Lucius** on any `triage.one_way_door === true` at the
  panel chair-assembly seam. Closes the vision-one-way-door hole where
  the filler heuristic would otherwise pull Leo instead of Lucius.
- Seam-rule trip-wires stamped onto `metrics`:
  `seam_fired`, `frame_choice`, `pricing_cosign`, `cosign`,
  `handoff_missing`. Bubble through `metadata.convene_metrics`.

### 30-day governance
- **Trip-wire A** · `metadata.frame_choice` populated on any
  Aims-ambiguous revenue-goal question. Inspect for misroutes /
  double-ownership.
- **Trip-wire B** · `metadata.cosign` populated on survival-risking
  one-way-door recommendations. Confirm caller=lucius + panel listed.
- **Trip-wire C** · `metadata.handoff_missing = true` flags Aims minutes
  that shipped without a Leo handoff section. Knox boundary-bleed review
  consumes this for the first 30 days.

### 14-day fallback
If the revenue-goal seam or the one-way-door procedure fails in the first
14 days: pause new intake to the affected chair, route through Leo
multi-chair only until the seam is re-cut and verified, then unsuspend.

### 30-day checkpoint
Knox seam-performance memo · clean / needs tightening / structural.

### Day-one Abe falsification watch
The first live cross-seam revenue question is make-or-break. Confirm Leo
synthesizes a single coherent recommendation with no contradiction or
double-ownership. If it fails, invoke the 14-day fallback for the
affected seam.

---

## Raise-the-Bar · platform quality standard (2026-06-13)

A single vault-level quality standard layered on the hardened multi-advisor
path. **Platform-owner-only · not a client feature.** Clients cannot raise,
lower, or see the standard; they receive the higher-caliber board
uniformly. Default OFF (`current` standard reproduces today's ε/ρ floors
and ladder behavior exactly).

### Activation
Edit `routing-config.ts`:

```ts
export const PLATFORM_QUALITY_VERSION: PlatformQualityVersion = "elevated";
```

That single line, then redeploy. Global. Uniform. No tenant/tier/entitlement
resolution anywhere in code · `tenants.ts` and `client_entitlements` are
deliberately untouched.

### What changes under `elevated`
- ε floor: `0.88 → 0.92` · ρ floor: `0.88 → 0.90` (final minute-level gate,
  not the per-iteration `confidence.ts` loop).
- `escalate_below_floor: true · max_escalations: 1` — a non-degraded
  below-floor minute on a `stakes ≥ medium` reasoning-gap escalates one
  tier (solo → panel → council), re-deliberates, then clears or returns
  capped. Data-gaps do NOT escalate (more advisors can't invent missing
  client facts) — they return capped with the named ask.
- Eval pass-marks tighten (seat `0.85 → 0.92`, retain `0.80 → 0.88`).
  Latent until the stress-test harness ships and writes scores onto
  `agents/manifest.ts` entries.

### Hard invariants
- Never inflates ε/ρ · only caps more honestly or escalates once.
- Never overrides the degraded-path cap or the Abe-drop rigor cap.
- Council mode is terminal in the ladder · no further escalation.
- Decertification stays a Brahan gate · never auto-pulled, never surfaced
  to clients.

### Internal telemetry (vault-side · never on the wire)
Stamped onto `routing_log.quality` in `mcp_usage_events`:
- `quality_standard_version` · `"current" | "elevated"`
- `floor_applied` · `{ eps_floor, rho_floor }`
- `escalations` · `[{ from_mode, to_mode, reason: "reasoning_gap", cleared }]`
- `below_floor_terminal` · `{ capped, gap_type, final_eps, final_rho, ask? }`

These do NOT appear in the minute body, in `show_council`, or in any
client-facing structured response.

### Files touched
- `routing-config.ts` (new `QUALITY_STANDARD` + `PLATFORM_QUALITY` exports)
- `index.ts` (swapped floor reads at the 3 minute-finalize sites; new
  `applyRaiseTheBar` ladder; `quality` field on `routing_log`)
- `escalate.ts` (gap classifier + bounded ladder · new)
- `agents/eval-gate.ts` (latent seat/retain checks · new)
- `agents/manifest.ts` (optional `eval_score` / `eval_scored_at`; `canSeat`
  wired into `findEnabledAgent` and `listEnabledAgentsPublic`)


---

## harden-v1 (COB Connector hardening)

Build stamp `BUILD_ID = "harden-v1"` is echoed on every response body
(`build_id` field) and as the `X-Build-Id` header on every Response. Verify
deploy with:

    curl -sS https://<project>.supabase.co/functions/v1/mcp-council/health

Shipped:
- `retry.ts` · bounded 2-retry with jitter on transient upstream failures.
- `breaker.ts` · per-instance rolling-window circuit breaker (20 calls /
  60s, opens at ≥80% failure for 30s) + per-tenant per-instance
  concurrency guard (cap 2). **Documented caveat:** in-memory, best-effort
  per instance. The DB-backed `check_rate_limit` per-IP/minute remains the
  authoritative fleet-wide cap.
- `injection.ts` · prompt-injection regex filter. On hit, returns a fixed
  refusal minute (`refused: true`, `refusal_reason: "injection_refusal"`)
  with no upstream call. Also exports `sanitizeText` to strip ASCII
  control characters.
- `pii-scrub.ts` · SSN / IBAN / Luhn-validated card / long digit-block
  redaction. Applied before Notion write-back as defense-in-depth.
- `tenants.ts :: getNotionTarget(tenant)` · per-tenant Notion target
  resolution. `file_to_office` now fails closed with `office_not_configured`
  when the tenant has no `{TENANT}_NOTION_TOKEN` + `{TENANT}_BOARDROOM_DB`
  pair. SPINNEY keeps the legacy `SPINNEY_NOTION_TOKEN` pair.
- `notion.ts :: writeMinuteToNotion(minute, question, target)` · accepts
  an explicit `{ token, dbId, tenant }` target and prefixes the page title
  with `[TENANT · yymmdd]`. Legacy positional fallback retained for the
  SPINNEY env path only.
- `index.ts` · GET `/health` (unauthenticated, no work), POST with header
  `X-Cron-Warmup: 1` accepted as warm-ping, `callAnthropic` wrapped in
  `withRetry` + breaker, per-tool input cap raised to 8000 with control-
  character strip + injection refusal, per-tenant concurrency guard around
  every deliberation tool, expanded `safeErrors` set with
  `circuit_open` · `concurrency_limit` · `injection_refusal` ·
  `office_not_configured` · `input_too_large`.

Operator handoff (rnjqpw, out of scope here): PKCE S256-only, token TTL +
refresh rotation, `aud` binding, purge expired pending authz, prune
duplicate "Claude" clients, DCR rate-limit.
