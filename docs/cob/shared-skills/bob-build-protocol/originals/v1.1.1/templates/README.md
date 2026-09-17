# {{PROGRAM_TITLE}}

SCOPE: {{FLEET or TENANT}}. {{One line on why this scope.}}

**What this is.** {{One paragraph in plain language. What exists when this program is done, for whom, and why it matters to them. Written for a person who has never seen this folder.}}

**Who it is for.** {{The audience, and what they must be able to do with the deliverable.}}

**Done when.** {{The proof that ends the program: the observable artifact, the number, the behavior. Never "when it feels finished." Example: the live page at {{URL}} matches the built file byte for byte and the owner has ticked one row and seen it close.}}

**Where it lands.** {{The delivery surface: the principal's board, an HQ page, a published page, a draft in their mailbox, a file in their folder.}}

**Status.** See `PLAN.md` for milestones and units with denominators, and the program thread for dated updates with health. This README does not carry status; status that lives in a README goes stale.

**Owner.** {{cob | client | shared}}. Continuous running: {{off by default | ON, commanded by {{principal}} on {{date}}}}.

**Files in this program.**
- `README.md` — this file, for humans.
- `AGENTS.md` — how an agent works in this program: commands, standards, proofs, gates.
- `CLAUDE.md` — the Claude Code entry point; imports AGENTS.md on its first line.
- `PLAN.md` — objective, milestones, units with proofs and gates, the frame's ten fields.
- `units.json` — the unit list the builder may only flip from failing to passing.
- `PROGRESS.md` — the running log, appended every pass, newest at the top.
- `playbooks/` — the mechanism playbook(s) this program builds with.
