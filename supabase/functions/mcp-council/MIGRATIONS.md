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

## FELIX/AIMS seating · 30-day watch (2026-06-13)

Two new chairs seated onto the hardened multi-advisor path: **FELIX**
(growth/revenue) and **AIMS** (vision/strategy). Roster is now 8 chairs:
Leo · Abe · Lucius · Alfred · Marcus · FELIX · AIMS · KNOX.

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
  AIMS-ambiguous revenue-goal question. Inspect for misroutes /
  double-ownership.
- **Trip-wire B** · `metadata.cosign` populated on survival-risking
  one-way-door recommendations. Confirm caller=lucius + panel listed.
- **Trip-wire C** · `metadata.handoff_missing = true` flags AIMS minutes
  that shipped without a Leo handoff section. KNOX boundary-bleed review
  consumes this for the first 30 days.

### 14-day fallback
If the revenue-goal seam or the one-way-door procedure fails in the first
14 days: pause new intake to the affected chair, route through Leo
multi-chair only until the seam is re-cut and verified, then unsuspend.

### 30-day checkpoint
KNOX seam-performance memo · clean / needs tightening / structural.

### Day-one Abe falsification watch
The first live cross-seam revenue question is make-or-break. Confirm Leo
synthesizes a single coherent recommendation with no contradiction or
double-ownership. If it fails, invoke the 14-day fallback for the
affected seam.
