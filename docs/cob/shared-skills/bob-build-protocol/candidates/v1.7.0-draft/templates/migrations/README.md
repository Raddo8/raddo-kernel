# migrations · {{PROGRAM_TITLE}}

SCOPE: {{FLEET or TENANT}}. Guidance for changing a live system. A live system is any register, database, job or service a client or the principal is using right now. These rules sit on top of the gate list, they do not replace it.

## What lives here

- `{{YYYYMMDD-HHMM}}-{{slug}}.apply.sql` — one file per apply, in full. A file that was run with its comments stripped is still kept here in its full form, and the receipt says so.
- `{{YYYYMMDD-HHMM}}-{{slug}}.rollback.sql` — written **before** the apply, sitting beside it. Where a scheduled job is created, the rollback unschedules it by name.
- `receipts/{{YYYY-MM-DD}}.md` — one dated receipt file per day of applies.

## The order, and it does not vary

1. **Read the live thing before writing to it.** Current schema, constraints, triggers, grants and access rules of every object the apply touches, plus the function bodies of anything that writes to them. Compare what the spec assumed to what is there. Any difference is a finding, written down before anything else happens. A table that "does not exist" is checked. A row that "should be unique" is checked against the unique indexes. A column the spec calls optional is checked for a not-null.
2. **Write the rollback.** Before the apply exists in runnable form.
3. **Dry-run in a transaction that cannot commit.** One block that makes the change, runs the proofs against it, and ends by raising an error carrying the proof results, so nothing persists. The proofs are the ones the evaluator would run: each refusal by name, the idempotent second call, the no-op when nothing changed, the count that should move by one.
4. **Read back that nothing persisted.** No table, no job, no function, no row.
5. **Know what the change does to work in flight.** Sessions, queues, locks and scheduled jobs live in the system, not in the deploy. List what is open right now and say what the change does to each. Anything that acts on work someone else started is run against today's live population first, and the count it would touch goes into the hand-off. If the signal it relies on (last activity, owner, age) can be attributed to the wrong item, the sweep does not ship until that is fixed; the safe version acts only on the caller's own work and lists the rest.
6. **Apply for real, as one transaction**, and read the result back. A request cancelled for size is split, never retried whole.
7. **Write the receipt in the same pass.**
8. **Record one probe on the principal's register**, post to the program thread with the plan changes it carried, and show it on the control surface as applied but not yet verified. **Applied is not passed** until a fresh evaluator grades it.

## Anything that spends

Written in full, with the exact files and lines it touches and nothing else. Estimated in credits from the last comparable send. Scheduled for the window the principal named. The scheduled step first re-reads the live base and compares its hash to the one the change was written against; if it moved, it stops and says so. After the send, the deployed source is read back and compared byte for byte to the expected result, and the change is verified on the live system by a marker it carries (a build id, a named refusal), never by the builder's report.

## Receipt shape

```
apply: {{filename}} · rollback: {{filename}} · program version: {{#.###.#}}
dry run: {{what the rolled-back block proved, each proof named, with observed against expected}}
nothing persisted: {{the read-back that confirms it}}
work in flight: {{what was open, and what the change did to each}}
applied at: {{YYYY-MM-DD HH:MM zone, from the clock}}
read-back: {{what was observed on the live system after the apply}}
probe ids: {{ids recorded on the register}}
comments stripped: {{yes and where the full form is kept | no}}
side findings: {{anything the apply changed that was not the point of it, with its count}}
status: applied, not yet independently verified
```

An apply that fixed something unexpected is written up as a finding with its count, because it is either a second defect or the explanation of one.

## Fix it at the source

A cleanup of bad rows is half a unit. The other half is the guard that stops the same rows arriving again, built in the same program and usually the same pass: a refusal by name at the write path itself so every way into the register is covered, a reversible ledger of every cleanup action with what the row was before, and a recurring check that names whatever slips past. A cleanup with no guard is scheduled rework. The guard is proven the way the evaluator would attack it: every write path, near-miss inputs, whitespace, renames, edits to already-cleaned rows, and anyone trying to switch it off.
