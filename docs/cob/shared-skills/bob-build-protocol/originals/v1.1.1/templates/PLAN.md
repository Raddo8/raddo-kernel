# PLAN.md · {{PROGRAM_TITLE}}

SCOPE: {{FLEET or TENANT}}. {{Why.}}

## The frame (all ten, or BOB frames what is missing before building)
1. **Objective.** {{In the principal's words, verbatim where they gave them.}}
2. **Deliverable and mechanism.** {{What exists when done; which playbook builds it.}}
3. **Audience.** {{Who receives it and what they must be able to do with it.}}
4. **Done-when.** {{The proof that ends the program.}}
5. **Units and denominators.** Below. A program with no units reports NO DENOMINATOR YET and decomposition is unit 1.
6. **Inputs and sources.** {{Files, feeds, registers, people. Brand assets and design direction: principal-provided, never invented.}}
7. **Constraints.** {{Scope line, brand, tone, spellings, standing rules in force, rules the principal set for this build.}} Non-functional bar, stated because most instruction files omit it: security {{what must never leak; protected paths}}, performance {{budget and how it is measured}}, accessibility {{checker and threshold}}, quality {{prototype | production | public}}.
8. **Gates.** {{Which steps need a person and why; default is the short list in AGENTS.md.}}
9. **Cadence, appetite and budget.** {{How often BOB walks this program; the appetite (hours and credits, set before design; when it is reached BOB stops, delivers what passed, lists what was cut, and asks for a new one); what it may spend without asking. Zero-credit work is always allowed. Continuous running is OFF. The only record that can turn it on is the `continuous` object in `units.json`, set by the principal with their quote, the date and a link to their message; this field never holds the command and the framer never writes it.}}
10. **Delivery surface.** {{Where the finished thing lands.}}

## Milestones (verified of planned, computed from units.json, never typed)
| # | Milestone | Units | Verified | Due | Gate |
|---|---|---|---|---|---|
| M1 | {{stage}} | {{n}} | {{n of n}} | {{date or none}} | {{none | GO | named person}} |

## Units
Each unit: id, title, prerequisites, owner, proof, gate. The proof names the artifact and how it is observed. A unit without a proof is not a unit yet. The authoritative list is `units.json`; this section is its readable mirror.

| id | unit | prerequisites | owner | proof | gate |
|---|---|---|---|---|---|
| U1.1 | {{one verifiable thing}} | {{ids}} | {{cob | principal | named}} | {{what is observed, where}} | {{none | GO | person}} |

## Evaluator checks the builder does not see
Held here by reference only: `evaluator/checks.json` is written by the evaluator pass before building starts, from this plan and the mechanism playbook, and is never read by the builder. The evaluator runs with fresh context and did not write the unit. The held-out gap (units passing their own proof but failing these) is reported at every close as a count of the denominator.

## Hill and staleness (mechanical, not judged)
Each unit carries a hill position: 0 to 50 while the approach is still being figured out (inputs found and read, template chosen, data reachable), 50 to 100 once the approach is proven and only execution remains. A unit cannot pass 50 until its inputs are read to the end. A unit whose hill has not moved across two consecutive updates is split or the program is marked at risk with a reason. A program with a cadence and no update since the last expected pass is stale, which is an operations failure, not a work failure, and is reported as such.

## Hand-off list (for a person, finished)
| item | recommended action | default if no answer | deadline |
|---|---|---|---|
| {{}} | {{}} | {{}} | {{}} |

## Retrospective (written when the program closes)
What the frame was missing at the start. Which unit ran longest against its estimate. Which proof failed first. One change to the playbook.
