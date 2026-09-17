# bob-build-protocol · source preservation and template reconciliation (SS-0.2)

SCOPE: FLEET. This folder is a repository-only unit. Nothing here is installed, scheduled, deployed or wired to a live system. It preserves supplied source material byte-for-byte and holds **candidate** additions for review. It is not an active skill and it does not replace anything.

## What is here

- `originals/` — supplied files, preserved byte-for-byte as UTF-8. Never edited, never overwritten.
  - `originals/v1.1.1/templates/` — the nine older program-folder templates.
  - `originals/v1.6.0/SKILL.md` — the newer full skill body.
- `candidates/v1.7.0-draft/` — new files proposed to close the gap between the v1.1.1 templates and what v1.6.0 requires. Candidates only. Not active.
- `MANIFEST.sha256` — SHA256 of every file in this folder.
- `REQUIREMENTS_MATRIX.md` — all sixteen sections of v1.6.0, each marked template-satisfied or missing-runtime.
- `IMPLEMENTATION_HANDOFF.md` — what remains to be built, explicitly not implemented here.
- `PRECEDENCE.md` — which document wins where the two versions disagree, with dated correction records.
- `GROK_WORKER_CONTRACT.md` — a proposed contract for an external worker under this protocol. Design only, not active, not installed.

## What is deliberately not here

- The older `SKILL.md` (pre-1.6.0). **Not included in the dispatch due to message limits. It is not lost and it has not been replaced.** When it arrives it lands at `originals/<version>/SKILL.md` beside the others.
- A regenerated `AGENTS.md`. v1.6.0 section 10 forbids generating that file from scratch; the v1.1.1 hand-written original stands.
- An active `KILL` file. A `KILL` file present means stop, so none is created. The candidate guidance describes it instead.
- Held-out evaluator checks. v1.6.0 section 1 requires those to be written by a fresh evaluator context that did not build the unit. This builder wrote none.

## Status of the candidates

Templates and schemas, not runtime. Nothing in `candidates/` has been run, scheduled, published or pointed at a database. See `REQUIREMENTS_MATRIX.md` for exactly which line is a template and which line still needs a running part.
