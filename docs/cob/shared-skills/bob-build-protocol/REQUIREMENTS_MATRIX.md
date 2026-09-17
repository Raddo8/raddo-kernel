# Requirements matrix · v1.6.0, all sixteen sections

SCOPE: FLEET. Every section of `originals/v1.6.0/SKILL.md` against what this repository unit actually contains. Two marks only.

- **TEMPLATE** — a file in this folder carries the shape, the rules or the schema. Nothing runs.
- **MISSING RUNTIME** — the requirement needs a running part (a database, a scheduler, a published page, a connector, a live evaluator context) that this unit did not build and does not claim.

A section can carry both marks on different lines. Nothing here is marked done.

| § | Requirement | Mark | Where it is, or what is missing |
|---|---|---|---|
| 0 | One pass per invocation unless the principal commanded otherwise | TEMPLATE | `candidates/.../units.json` → `continuous` object, carried unchanged from v1.1.1 |
| 0 | Runner that actually stops with a receipt | MISSING RUNTIME | No runner exists. See handoff item H5 |
| 1 | Four hats, each a fresh context | TEMPLATE | `NEXT.md` standing instructions; `evaluator/CONDUCT.md` |
| 1 | Builder never reads the held-out checks | TEMPLATE | `originals/v1.1.1/templates/CLAUDE.md` deny list; `PRECEDENCE.md` §3 |
| 1 | Evaluator conduct rails carried every time | TEMPLATE | `candidates/.../evaluator/CONDUCT.md` |
| 1 | Held-out checks written by a blind fresh context | MISSING RUNTIME | **No checks written.** A builder writing them would void them. Handoff H6 |
| 2 | The ten frame fields | TEMPLATE | `originals/v1.1.1/templates/PLAN.md` |
| 2 | Every milestone decomposed on the framing pass | TEMPLATE | `candidates/.../NEXT.md` next-ten table; `units.json` |
| 2 | A spec file per unit, written to the end before building | TEMPLATE | `candidates/.../agent_docs/specs/UNIT_SPEC_TEMPLATE.md` |
| 2 | Change log on every plan change | TEMPLATE | `candidates/.../units.json` → `change_log` |
| 2 | Owners and dependencies on every unit | TEMPLATE | `units.json` → `owner_kind`; `NEXT.md` parallel table |
| 3 | The nine-step loop | TEMPLATE | `originals/v1.1.1/templates/AGENTS.md` plus `NEXT.md` standing instructions |
| 3 | Read the client's meeting record before planning | TEMPLATE | `NEXT.md` standing instructions |
| 3 | Proof only proves the path it took | TEMPLATE | `UNIT_SPEC_TEMPLATE.md` → "Path the proof takes" |
| 3 | Two slices of one source is not corroboration | TEMPLATE | `UNIT_SPEC_TEMPLATE.md` → "Corroboration" |
| 3 | Every timestamp from the clock, zone named | TEMPLATE | `candidates/.../PROGRESS.md`; `migrations/README.md` receipt shape |
| 3 | Read the principal's word item by item | TEMPLATE | `decisions.schema.json` → `hand_off_item`, `reading`, `principal_quote` |
| 4 | Two lists, no third | TEMPLATE | `originals/v1.1.1/templates/AGENTS.md` boundaries |
| 4 | Side-effect class and idempotency key per unit | TEMPLATE | `units.json` → `side_effect`, `idempotency_key`; spec template |
| 4 | Enforcement of at-most-once at fire time | MISSING RUNTIME | Nothing fires here. Handoff H5 |
| 5 | Mechanism playbooks | MISSING RUNTIME | **No playbook files in this unit.** The twelve mechanisms live only in prose in the skill body. Handoff H7 |
| 5 | Common gates, placeholder sweep, citation checks | TEMPLATE | Prose in the skill body; no linter, no sweep script. Handoff H7 |
| 6 | The gate list, and only these | TEMPLATE | `AGENTS.md` ask-first tier; `DISPATCH_TEMPLATE.md` refusals |
| 6 | A gate presented as a finished recommendation | TEMPLATE | `PLAN.md` hand-off table; `PROGRESS.md` needs-a-person line |
| 7 | Runner behavior on a visit | MISSING RUNTIME | No runner. Handoff H5 |
| 7 | Overlap protection, caps, stuck detector, dead-letter | MISSING RUNTIME | Handoff H5 |
| 7 | `KILL` read before every call | TEMPLATE | `originals/v1.1.1/templates/init.sh` checks it. **No active `KILL` file created**, by design |
| 8 | The standards list | TEMPLATE | Carried in the skill body; reflected in `REFERENCE_TEMPLATE.md` and `NEXT.md` |
| 8 | Two closing numbers on every substantive output | TEMPLATE | Prose only. No enforcement. Handoff H7 |
| 9 | The update record shape | TEMPLATE | `candidates/.../PROGRESS.md` |
| 9 | Held-out gap reported as a count of the denominator | TEMPLATE | `units.json` → `evaluation`, `held_out_gap_rule`; `PROGRESS.md` line |
| 9 | Writing back to registers, thread, journal, proofs | MISSING RUNTIME | Needs the connector. Handoff H1 |
| 10 | `README.md`, `PLAN.md`, `CLAUDE.md`, `init.sh`, `evaluator/checks.json`, `agent_docs/README.md`, `units.json`, `PROGRESS.md` | TEMPLATE | `originals/v1.1.1/templates/` (nine files, preserved) |
| 10 | `AGENTS.md`, never regenerated | TEMPLATE | Original stands. **Not regenerated**, per `PRECEDENCE.md` §4 |
| 10 | `NEXT.md` | TEMPLATE | `candidates/.../NEXT.md` (new; absent from v1.1.1) |
| 10 | `protocol_version`, `change_log`, program `version` `#.###.#` | TEMPLATE | `candidates/.../units.json` |
| 10 | `agent_docs/specs/`, `dispatches/`, `reference/` | TEMPLATE | Three candidate templates |
| 10 | `control/` source, build script, worker prompt | MISSING RUNTIME | Schemas only, no script and no page. Handoff H4 |
| 10 | `control/log.json`, `defects.json`, `decisions.json`, `effort.json` | TEMPLATE | Four JSON Schemas under `candidates/.../control/schemas/` |
| 10 | `migrations/` with rollback and receipts | TEMPLATE | `candidates/.../migrations/README.md` |
| 10 | `KILL` | TEMPLATE | Documented. **Deliberately not created** |
| 11 | Retrospective after every program | TEMPLATE | `originals/v1.1.1/templates/PLAN.md` retrospective section |
| 11 | Evaluation set of 20 to 50 real-failure tasks | MISSING RUNTIME | Not built. Handoff H6 |
| 11 | Re-estimate after ten closed units | TEMPLATE | `effort.schema.json` → `re_estimation`; `units.json` → `estimate_history` |
| 11 | Defect proposes the rule that would have caught it | TEMPLATE | `defects.schema.json` → `proposed_protocol_rule` |
| 11 | Fix at the source: guard, reversible ledger, recurring check | TEMPLATE | `defects.schema.json` → `guard`; `migrations/README.md` |
| 12 | Control surface as whole history, eight pages | MISSING RUNTIME | No page, no build script, no publish target. Handoff H4 |
| 12 | The four history files the page renders | TEMPLATE | Four schemas |
| 12 | Run desk controls, press-again-to-undo | MISSING RUNTIME | Handoff H4 |
| 12 | Five shared store paths | MISSING RUNTIME | Paths are named in the skill body; nothing declares or serves them. Handoff H4 |
| 12 | Page and files never drift | TEMPLATE | Rule stated in `README.md` and `PROGRESS.md` write-back line |
| 13 | Run-desk worker, one scheduled task per program | MISSING RUNTIME | **No scheduling done, by instruction.** Handoff H5 |
| 13 | Worker rails carried in its own text | MISSING RUNTIME | No worker prompt file written. Handoff H5 |
| 14 | Work and cost ledger, rebuilt from evidence | MISSING RUNTIME | No schema and no ledger in this unit; deliberately separate from the effort ledger. Handoff H8 |
| 15 | Two clocks, never added together | TEMPLATE | `effort.schema.json` → `bob_time`, `waiting_time`, separate totals |
| 15 | System window against pass window | TEMPLATE | `effort.schema.json` → `measured_from` |
| 15 | Pass start and end recorded every pass | TEMPLATE | `candidates/.../PROGRESS.md` |
| 15 | Data lift on the row | TEMPLATE | `effort.schema.json` → `data_lift` |
| 15 | Unplanned work counted | TEMPLATE | `variance: unplanned` |
| 15 | Debt written back against the causing unit | TEMPLATE | `effort.schema.json` → `debt_written_back` |
| 16 | Read the live thing before writing to it | TEMPLATE | `migrations/README.md` step 1 |
| 16 | Dry run in a transaction that cannot commit | TEMPLATE | `migrations/README.md` steps 3 and 4 |
| 16 | Rollback written before the apply | TEMPLATE | `migrations/README.md` step 2 and file naming |
| 16 | Work in flight listed before a change ships | TEMPLATE | `migrations/README.md` step 5 |
| 16 | Spending staged with cost, window and base hash | TEMPLATE | `DISPATCH_TEMPLATE.md` |
| 16 | Receipts in the same pass | TEMPLATE | `migrations/README.md` receipt shape |
| 16 | Applied is not passed | TEMPLATE | `migrations/README.md` step 8; `units.json` → `evaluation` |
| 16 | Any actual apply, dry run or probe | MISSING RUNTIME | **None run.** No database call, no migration, no deploy in this unit |

## Totals

Sixteen of sixteen sections covered. Forty-nine lines marked TEMPLATE. Seventeen lines marked MISSING RUNTIME, all of them listed in `IMPLEMENTATION_HANDOFF.md` as H1 to H8. No line is marked implemented, because none is.
