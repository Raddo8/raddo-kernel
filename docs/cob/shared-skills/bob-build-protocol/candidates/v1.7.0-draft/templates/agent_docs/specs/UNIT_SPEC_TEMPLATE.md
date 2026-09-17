# Spec · {{U#.#}} — {{one-line title}}

SCOPE: {{FLEET or TENANT}}. One file per unit, at `agent_docs/specs/{{U#.#}}.md`, written to the end on the framing pass before any building. A unit with no spec is not a unit yet. Referenced from `units.json` as `spec_ref`.

Program version at writing: {{#.###.#}} · milestone: {{M#}} · owner: {{bob | principal | named person}} · gate: {{none | GO | named person}} · estimate: {{hours}} · side effect: {{none | at_least_once | at_most_once}} · hill at writing: {{0-100}}

## Why this unit exists
{{What it unblocks, who asked for it, what it costs to leave undone. One short paragraph, in plain language.}}

## Inputs
| input | where it lives | read to the end? | denominator |
|---|---|---|---|
| {{}} | {{path, register, feed, person}} | {{yes / not yet}} | {{what was opened, how many, whether that is everything the owning system holds}} |

A search preview, a summary, the first screen of a file or a capped read is not the source. A missing reference artifact is the finding; do not build past it. Search before assuming: confirm the thing does not already exist in the repository or the registers.

## Steps
1. {{}}
2. {{}}
3. {{}}

Each step that exists for a reason carries it, so a stale step can be retired when its reason no longer holds.

## Proof
- **Artifact:** {{what exists when this passes}}
- **Method:** {{how it is observed: fetch, byte compare, read back, screenshot, test run, render and inspect}}
- **Expected:** {{the observation that means pass}}
- **Evidence required:** {{command output | screenshot | read-back | fetched bytes}}
- **Path the proof takes:** {{the setting, secret and code path it drives through. A check that builds its own address, payload or inputs from a literal has proven the literal. Name anything that goes unproven.}}
- **Corroboration:** {{independent (a different data family with a different failure mode) or same-source (two slices of one pull). Say which. Never present the second as the first.}}

## Gate
{{none, or: what needs a person, why, the recommended action, the default if no answer, the deadline.}}

## Side effects
{{Class and key. At-least-once may be repeated safely. At-most-once carries an idempotency key derived from run, unit and attempt, is checked before firing and by the receiving system on arrival, and is never auto-retried. A timeout is read back first.}}

## Rollback
{{What undoes this, written before the step runs if it changes data or a live surface. For an apply, the rollback file beside it in `migrations/`.}}

## Out of scope for this unit
{{What this deliberately does not touch, so the work log can say so honestly.}}
