# Implementation handoff · what remains

SCOPE: FLEET. Everything on this page is **not implemented**. Nothing here was built, wired, scheduled, deployed or pointed at a database in this unit. Each item is written as completed staff work: what it is, the recommended action, the default if nobody answers, and what it unblocks.

Do not read any item below as delivered. The requirements matrix marks each of these MISSING RUNTIME.

---

## H1 · Connector retrieval and registration

**What.** The protocol names capabilities, never tool names, so a COBCLIENT must be able to fetch this skill and register it against the connector at boot. Today the files sit in this repository and nothing retrieves them.

**Recommended action.** Publish the skill body and templates as a retrievable artifact keyed by name and version, and register `bob-build-protocol` in the tool catalogue with its version so a client can ask which version it is running under and get an answer from the record rather than from memory.

**Default if no answer.** Leave unregistered. Clients continue without the protocol; nothing breaks, nothing improves.

**Unblocks.** Everything else on this page. Nothing runs until the client can retrieve it.

**Not implemented.** No catalogue row, no manifest entry, no retrieval path.

---

## H2 · Tenant controls

**What.** Which tenants get the protocol, at which version, and who can change that. The protocol is FLEET scope, but a version bump that changes what BOB is allowed to do (a MAJOR) must not reach every tenant at once.

**Recommended action.** A per-tenant setting carrying the protocol version in force and who set it, with the fleet default separate from any tenant override, and a refusal by name when a program asks for a version the tenant is not on.

**Default if no answer.** Fleet default only, no overrides, and a MAJOR reaches everyone on the same pass.

**Unblocks.** Safe version movement; H3, because a build record has to say which version produced it.

**Not implemented.** No setting, no override table, no refusal.

---

## H3 · BOB build record

**What.** The durable record of every pass: program, program version, protocol version, unit, trigger, start, end, BOB time, waiting time, evaluator outcome, evidence refs. The four control files in this folder are its shape. Nothing stores them.

**Recommended action.** One append-only record per pass, written during the pass, with the held-out gap and the effort row as first-class columns rather than derived later. Reads scoped to the tenant; the fleet view is counts, ids and hashes only.

**Default if no answer.** Passes stay in the program folder as files. Survives a handover, does not survive a lost folder, and cannot be reported across programs.

**Unblocks.** H4 (the page renders it), H8 (the cost ledger is rebuilt from it).

**Not implemented.** No table, no writer, no migration. Only JSON Schemas.

---

## H4 · Control surface and its dashboard

**What.** The eight-page page from section 12, built from the record by a script, published to a stable address, carrying the run desk and the five shared store paths.

**Recommended action.** Build the script first and render locally from the four control files; publish only once the page and the files provably do not drift. Client brand from the client's own kit. Publish a second, control-free copy when a client must have one.

**Default if no answer.** No page. The program is invisible between passes and the principal cannot steer it.

**Unblocks.** H5, which has nothing to drain without a queue.

**Not implemented.** No page, no build script, no store, no publish target, no run desk, no brand kit loaded.

---

## H5 · Runner and run-desk worker

**What.** The thin loop of section 7 and the scheduled worker of section 13: pick the program and the unit, launch the hat, enforce caps and appetite, drain the queue, honor `KILL`, and stop with a receipt.

**Recommended action.** Build the runner against a single program first, with the worker rails written into the worker's own text rather than inferred, notifications off, schedule off the hour, and the binding approved on the machine by a person before it may touch any program folder.

**Default if no answer.** One pass per human invocation, forever. Correct and slow, and it is the safe default.

**Unblocks.** Continuous running where a principal has commanded it.

**Not implemented.** **No scheduling was done, by instruction.** No worker prompt file, no cron, no queue drain, no caps, no dead-letter store.

---

## H6 · Independent evaluation

**What.** Held-out checks written by a blind fresh context, the grading context kept separate from both, and the twenty-to-fifty task evaluation set drawn from real failures.

**Recommended action.** Write the first program's checks from the unit definitions alone before any building, using a context with no access to this folder's candidates, and keep the deny list from `CLAUDE.md` in force mechanically rather than by prose.

**Default if no answer.** Builder self-grading only, which `PRECEDENCE.md` §2 says plainly is not verification.

**Unblocks.** Any honest held-out gap count.

**Not implemented.** **No checks were written by this builder**, deliberately. No evaluation set.

---

## H7 · Mechanism playbooks as files

**What.** The twelve mechanisms in section 5 exist as prose inside the skill body. They are not separate, versioned, protected artifacts with a "why this step exists" line per step, and the common gates (placeholder sweep, citation resolution, prose linter, accessibility checker) have no runnable form.

**Recommended action.** Extract one file per mechanism as it is first used on a real program, written from what worked on that program rather than from the prose.

**Default if no answer.** Builders read the prose. Workable, and every program re-derives the steps.

**Unblocks.** Faster second runs on the same mechanism, which is the whole claim of section 11.

**Not implemented.** No playbook files, no linter, no sweep.

---

## H8 · Receipts and the work and cost ledger

**What.** Two separate things, deliberately never merged. Apply receipts under `migrations/receipts/` are the record of changing a live system. The work and cost ledger of section 14 is the commercial instrument, rebuilt from evidence.

**Recommended action.** Receipts first, because they are free and they are written in the same pass as an apply. The cost ledger only when the principal asks what the work has cost or a scope conversation is coming, with an hours range low to high and hard costs separate at the rate actually paid.

**Default if no answer.** No receipts, and applies rest on the builder's report. That is the failure mode section 16 was written to stop.

**Unblocks.** Any claim that an apply was verified.

**Not implemented.** No receipts written, because no apply was made. No cost ledger, no schema for one, no rate and no price. BOB invents neither.

---

## What this unit did do

Preserved ten supplied files byte-for-byte, hashed them, added candidate templates and four JSON Schemas, recorded precedence between the two versions, and marked all sixteen sections against what exists. Repository only.
