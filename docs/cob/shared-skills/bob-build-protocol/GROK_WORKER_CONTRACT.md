# Proposed worker contract · an external worker under the BOB protocol

SCOPE: FLEET. **Design only. Not active, not installed, not scheduled, not wired.** No adapter, no endpoint, no worker prompt and no registration exists. Every clause below is a proposal for review, and nothing in this repository implements any of it. Read it as completed staff work on a question, never as a description of a running system.

The question it answers: if an external worker (referred to here as Grok) is to do BOB-protocol work on a program, what must be true before its first call, so that its work is verifiable, bounded and reversible, and so that it cannot be confused with a person or with an existing COB.

---

## 1 · Identity

- The worker holds **its own identity**, scoped to one tenant and one project. It is never fleet-wide by default.
- Two fields, always both: a **human display name** shown on any surface a person reads, and a **stable worker ID** that never changes, is never reused, and is what every record actually keys on. Names are labels; the ID is the key.
- **Grok never borrows Jake's tokens or Slade's tokens**, or any person's credential, for any call. A call that can only be made by borrowing a person's authority is a call the worker may not make.
- The names Ranger, Doc, Mason, Truett, Booker, Porter, Relay and Chuck are **user-provided names held for assignment**. This document assigns no roles to them and invents no canon. Which name attaches to which worker, if any, is the principal's decision and is recorded when it is made.

## 2 · The skill it runs under

- The worker retrieves **the same authorized, versioned skill body** every COB retrieves, through the COB Connector, by name and version.
- It never carries a local copy of the protocol, never a paraphrase, never a summary. If retrieval fails, the worker does not start.
- The version it retrieved is recorded on every unit it touches. A version the tenant is not authorized for is refused by name.

## 3 · Working copies

- The worker operates on **its own working copies only**. It does not write into a shared program folder, a canonical register or another worker's copy.
- Its output is returned for merge, never merged by itself.

## 4 · Claiming work

- **One explicit unit per claim.** No sweeps, no "and anything related".
- The claim is **atomic, expiring and fenced**: acquired in a single operation, carrying an expiry and a monotonic fencing token. A stale claim's writes are rejected on the token, not on trust.
- **No concurrent writers.** Reads may run in parallel; writes to one artifact are single-threaded. A second claimant on a held unit is refused, not queued silently.
- An expired claim releases the unit and records why it expired.

## 5 · Tools and limits

- The worker's allowed tools are a **named, scoped list, enforced server-side**. A client-side list is not enforcement. Anything outside the list is refused at the boundary, and the refusal is recorded.
- Every claim carries **permission limits** (what it may read, what it may write, what it may never touch) and **cost limits** (a credit ceiling and a wall-clock ceiling). Hitting a limit stops the work and returns what exists; it never silently continues.
- The gate list from the protocol applies unchanged. Anything on it is a hand-off, never a worker action.

## 6 · Inputs and outputs

- Every claim records **input and source version references**: which artifacts were read, at which version or hash, and the denominator of what was available.
- Every result carries **artifact hashes and the evidence**: the command and its output, the read-back, the screenshot. A claim with no evidence is not a result.
- The result is returned **to the shared BOB build record**, which remains the single record. The worker does not keep a private ledger of record.

## 7 · Liveness and interruption

- A **heartbeat** on an interval shorter than the claim expiry. Silence past the expiry releases the claim.
- **Interruption state** is explicit: what was done, what was in flight, what was never started. An interrupted claim ends with that state written, not with a gap.

## 8 · Retries

- Every claim carries an **idempotency key**. A repeat under the same key is the same claim, not a second one.
- Before any repeat, the worker **reconciles**: reads back what actually landed and acts on the observed state. A timed-out step is read back before anything else; it is never re-fired blind.

## 9 · Evaluation

- The worker's output is checked by an **independent evaluator context** that did not produce it, against held-out checks the worker never reads.
- The worker's own grade is a self-graded claim. It never counts as independent review and never fills the evaluation record.

## 10 · Shared coordination

- Coordination **reuses the canonical Bench, Corpus and BOB structures**, after live reconnaissance of what those structures actually are today.
- **No shadow records.** No parallel queue, no side board, no second source of truth invented for the worker's convenience.

## 11 · Pilot

- The first engagement is a **read-only requirements audit against copies**. No writes, no applies, no sends, no live surfaces.
- Its value is the audit and the evidence of whether the contract holds in practice, not throughput.

## 12 · States, kept apart

Four distinct states, never collapsed into one another:

1. **Findings submitted** — the worker returned a result.
2. **Acknowledgment received** — a person or system confirmed receipt. Not agreement.
3. **Evaluated** — an independent context graded it, pass or fail, with a critique.
4. **Accepted** — the principal or the named owner took it into the program.

Submitted is not evaluated. Acknowledged is not accepted.

## 13 · Explicitly unimplemented

None of the following exists anywhere in this repository or any running system: the worker prompt, the connector adapter, the claim endpoint, the fencing token store, the heartbeat channel, the tool allow-list enforcement, the cost meter, the registration of any worker identity, and any assignment of the held names. This document is a **proposed integration, not installed execution**.
