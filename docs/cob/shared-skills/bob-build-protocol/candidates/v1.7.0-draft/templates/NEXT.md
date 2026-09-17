# NEXT.md · {{PROGRAM_TITLE}}

SCOPE: {{FLEET or TENANT}}. The standing order. **The builder takes the unit named under "This pass" and nothing else.** This file overrides the priority selection in `AGENTS.md`: where the two disagree, this file wins. Written by the framer, revised by the framer or the principal, never by the builder mid-pass.

Program version: {{#.###.#}} · protocol version: {{1.6.0}} · last revised: {{YYYY-MM-DD HH:MM zone}}

## This pass
- **Unit:** {{U#.#}} — {{one-line title}}
- **Why this one now:** {{what it unblocks, who asked for it, what it costs to leave undone}}
- **Gate:** {{none | GO | named person}}
- **Estimate:** {{hours}} · **Owner:** {{cob | principal | named person}}
- **Stop condition:** {{the proof that ends this pass, or the receipt written if it stops early}}

## The next ten passes, in order
| # | unit | title | owner | gate | estimate (h) | why it sits here |
|---|---|---|---|---|---|---|
| 1 | {{U#.#}} | {{}} | {{}} | {{none}} | {{}} | {{}} |
| 2 | {{U#.#}} | {{}} | {{}} | {{}} | {{}} | {{}} |
| 3 | {{U#.#}} | {{}} | {{}} | {{}} | {{}} | {{}} |
| 4 | {{U#.#}} | {{}} | {{}} | {{}} | {{}} | {{}} |
| 5 | {{U#.#}} | {{}} | {{}} | {{}} | {{}} | {{}} |
| 6 | {{U#.#}} | {{}} | {{}} | {{}} | {{}} | {{}} |
| 7 | {{U#.#}} | {{}} | {{}} | {{}} | {{}} | {{}} |
| 8 | {{U#.#}} | {{}} | {{}} | {{}} | {{}} | {{}} |
| 9 | {{U#.#}} | {{}} | {{}} | {{}} | {{}} | {{}} |
| 10 | {{U#.#}} | {{}} | {{}} | {{}} | {{}} | {{}} |

Reasons are written so that disagreeing is easy. A row the principal wants moved is moved, and the move is recorded in the `change_log` in `units.json` with the date, who and why.

## Running in parallel, and who holds it
| item | who holds it | since | what it unblocks |
|---|---|---|---|
| {{}} | {{}} | {{date}} | {{}} |

Reads may run in parallel: research, search, review, evaluation. Writes stay single-threaded: one builder per artifact at a time.

## Standing instructions that do not change
- Run `./init.sh` first, every pass. A failure there is this pass's finding.
- Read the progress log newest first, then this file, then the unit's own spec under `agent_docs/specs/`, to the end.
- Read any meeting record, transcript or thread from the people this is being built for that has appeared since the last pass, to the end, before planning.
- One unit per pass. The builder never reads `evaluator/checks.json` and never edits a unit, a test or a check.
- The builder flips only `passes` and sets `proof_ref`. It never writes the `evaluation` object; only an evaluator context does.
- Record in the same pass, not at close: progress log, work log, defects, decisions, effort row, thread update.
- A `KILL` file in the program folder means stop before the next call.

## Precedence note
This file is the only source of the unit for the pass. If this file is absent, or "This pass" carries no named unit, the pass is **blocked**: the builder records the block and its reason in the progress log, raises framing repair as a hand-off with a recommended action, a default and a deadline, and stops. It never selects a unit by priority and never infers one.

`AGENTS.md` step 3 (highest-priority unit whose `passes` is false) applies **only to a program explicitly declared legacy** — pre-1.6.0, no `protocol_version` in `units.json`, no `NEXT.md` by design. It is not a fallback for a 1.6.0 program with incomplete framing, and it never overrides the assignment above.
