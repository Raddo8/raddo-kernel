# Precedence · v1.1.1 templates against v1.6.0 skill

SCOPE: FLEET. Read this before using any file in this folder. The originals are preserved unchanged; where they disagree, this page says which one governs. No original was edited to resolve a conflict.

## 1 · Unit selection: NEXT.md overrides AGENTS.md priority order

`originals/v1.1.1/templates/AGENTS.md`, step 3 of "Start of every pass", tells the builder to pick the highest-priority unit whose `passes` is false and whose prerequisites all pass.

v1.6.0 section 10 introduces `NEXT.md`, the standing order, and states: "The builder takes the unit named here and nothing else."

**`NEXT.md` wins.** Where a program folder carries a `NEXT.md`, the assignment in it overrides the AGENTS.md priority selection. The AGENTS.md rule remains the fallback for a program with no `NEXT.md`. The AGENTS.md original is not edited to say so; this page carries the reconciliation, and the candidate `NEXT.md` template states it on its own face.

## 2 · Builder passes are not independent verification

`units.json` in v1.1.1 carries one boolean, `passes`, flipped by the builder after its own proof exists.

v1.6.0 section 1 and section 9 require the independent evaluator's outcome to be reported separately, as "passed own check but failed the independent one: `<n>` of `<verified>`". A single boolean cannot carry that.

**A builder's `passes` is a self-graded claim, never independent verification.** The candidate `units.json` keeps `passes` with exactly its original meaning and adds a separate `evaluation` object that only an evaluator context writes. Nothing infers one from the other.

## 3 · The evaluator's checks stay unwritten by the builder

v1.6.0 section 1: the held-out checks are written by a fresh context that did not build the unit. `originals/v1.1.1/templates/evaluator/checks.json` is the shape, with one placeholder check.

**No real checks were written in this unit.** The candidate folder adds evaluator conduct instructions only. Writing actual checks from the builder seat would void them.

## 4 · AGENTS.md is never regenerated

v1.6.0 section 10: "Never generated from scratch; the one controlled study found generated files made agents worse." The v1.1.1 `AGENTS.md` stands as supplied. Anything new goes in `NEXT.md`, a spec, or this page.

## 5 · Version numbering

v1.1.1 templates carry no version fields. v1.6.0 section 10 requires `protocol_version` and a program `version` in the shape `#.###.#`. The candidate `units.json` adds both. Where a program still runs the v1.1.1 `units.json`, it has no version and that is a gap, not a value of zero.

## 6 · The older SKILL.md

Not transmitted in this dispatch because of the message limit. **Recorded as not included. Not lost, not replaced, not superseded by anything in this folder.** No candidate here assumes its contents.
