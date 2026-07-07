# COB Operator API

> **Architectural principle (binding).** The app is the control surface; COB is the engine.
> The app NEVER performs or simulates intelligence work (research, deep dives, deck / site generation, email drafting, enrichment). For state transitions that require such work, the app creates **work orders** that the external COB engine executes; results return via `record_files` and `approval_requests`. The app must never mark intelligence work "done" on its own — state advances only when the engine completes the order and its approval is granted through the standard approvals queue.

Single edge function: `cob-operator`. All requests are `POST` with JSON body and a required header `X-COB-Operator-Key` whose value is the project secret `COB_OPERATOR_KEY`.

**Scope lock:** every endpoint is hard-scoped to workspace `b0c00b00-0000-4000-8000-000000000001` (COB HQ · BD). Any explicit `workspace_id` in the body that does not match is rejected with `403`.

**Rate limit:** 60 requests · minute · IP.

Body shape: `{ "action": "<name>", ...args }`


## list_pursuits
Returns board snapshot with signals heat.
```json
{ "action": "list_pursuits" }
```
Response: `{ pursuits: [{ id, title, state, account, metadata, updated_at, signals_heat }] }`

## get_pursuit
Full record · dossier layers · last 50 site signals for the account.
```json
{ "action": "get_pursuit", "pursuit_id": "<uuid>" }
```
Response: `{ pursuit, layers, signals }`

## add_note
Writes a timeline note, optionally tagged with a layer (L1–L5).
```json
{ "action": "add_note", "pursuit_id": "<uuid>", "summary": "...", "body": "...", "layer": "L2" }
```

## set_state
State change through the normal path · records a system timeline event.
```json
{ "action": "set_state", "pursuit_id": "<uuid>", "state": "meeting_set" }
```
`state` is the item_state `name` (e.g. `signal`, `qualified`, `asset_built`, `meeting_set`).

Transitioning into any of `qualified · deepdive · asset_built · meeting_set · build_shown · proposal · agreement · onboarding · client` requires the account to have a contact with `is_decision_maker=true` AND a non-empty `email`. Otherwise returns `409 qualified_gate_blocked` with a `reason` string.

## queue_task
Creates an `internal_task` action with `status=approved` for the worklist.
```json
{ "action": "queue_task", "pursuit_id": "<uuid>", "task": "follow_up", "note": "check back after demo" }
```

## upload_file
Registers metadata for a file COB placed in Storage bucket `record-files` (path convention `{workspace_id}/{account_id}/{uuid}-{filename}`). Requires either `pursuit_id` or `account_id`. Writes a timeline event.
```json
{ "action": "upload_file", "pursuit_id": "<uuid>", "storage_path": "b0c0…/acct…/uuid-deck.pdf", "file_name": "Whitebox deck.pdf", "kind": "deck", "size_bytes": 148213 }
```
`kind` must be one of `deck · site · email_draft · agreement · other`.

## create_approval_request
Queues a pending approval visible on `/app/approvals`.
```json
{ "action": "create_approval_request", "pursuit_id": "<uuid>", "kind": "state_move", "payload": { "from_state": "asset_built", "to_state": "build_shown" }, "note": "ready for review" }
```
`kind` must be one of `state_move · send_email · other`. For `send_email`, payload commonly carries `{ email_subject, recipient, draft_ref }`.

## list_approval_requests
```json
{ "action": "list_approval_requests", "status": "pending" }
```
`status` is one of `pending · approved · rejected · all` (default `pending`).

## Errors
`401 unauthorized` · `403 workspace_locked` · `400 unknown_action | invalid_json | *_required | invalid_layer | unknown_state` · `404 not_found` · `429 rate_limited` · `500 internal_error`

## list_work_orders
```json
{ "action": "list_work_orders", "status": "queued" }
```
`status` is one of `queued · claimed · in_progress · done · failed · cancelled · active · all` (default `queued`; `active` = queued+claimed+in_progress). Response: `{ work_orders: [...] }`.

## claim_work_order
Atomic claim. Only succeeds if the order is still `queued`.
```json
{ "action": "claim_work_order", "work_order_id": "<uuid>", "claimed_by": "cob-engine-worker-1" }
```
Response: `{ ok: true, work_order: { id, item_id, order_type, params } }` · `409 not_claimable` if already claimed.

## complete_work_order
Marks the order `done` (default) / `failed` / `cancelled`. Optionally registers result files (same shape as `upload_file` inputs) and creates an approval request in one call — this is how the engine hands work back to the operator for state advancement.
```json
{
  "action": "complete_work_order",
  "work_order_id": "<uuid>",
  "outcome": "done",
  "result_note": "Deep dive complete · 3 openers, dossier v2.",
  "files": [{ "storage_path": "…", "file_name": "deepdive.pdf", "kind": "other", "size_bytes": 12345 }],
  "approval": {
    "kind": "state_move",
    "payload": { "from_state": "qualified", "to_state": "deepdive" },
    "note": "Deep dive ready for principal review."
  }
}
```
Response: `{ ok: true, work_order_id, registered_files: [...], approval_id }`. Always writes a timeline event.

## Order types
`qualify_enrichment · deepdive · build_asset · prepare_send · draft_nudge · revisit`

## Autopilot
Autopilot is a per-workspace setting (`workspaces.settings.autopilot: true|false`) with a per-pursuit override in `items.metadata.autopilot` (`auto | manual | inherit`). When effective autopilot is ON, entering a state whose next intelligence step maps in `AUTOPILOT_ON_ENTER` auto-creates the corresponding work order with `created_by=autopilot`. Autopilot only queues work — it never skips approvals.

## Order types (extended)
Now includes `kernel_step` and `project_build` for onboarding-phase work the engine can claim just like BD work.

## Per-state autopilot matrix
Workspace default lives at `workspaces.settings.autopilot_matrix` as a map of `order_type → auto | assist | manual`. Per-pursuit overrides live at `items.metadata.autopilot_matrix`.

Effective resolution (highest wins): item override → workspace default → hardcoded default (deepdive=auto · build_asset=assist · prepare_send=assist · qualify_enrichment=auto · draft_nudge=auto · revisit=assist).

Behavior:
- `auto` — `complete_work_order` with `approval.kind=state_move` applies the state change directly (respecting the qualified gate) instead of creating an approval; response includes `auto_applied_state`.
- `assist` — same auto-queue on state entry, but completion always creates an approval.
- `manual` — no auto-queue; completion always creates an approval.

`send_email` completions ALWAYS create an approval regardless of mode. Sends are never auto.

## Onboarding surface
Two boards in the app:
- `/app/onboarding/kernel` — kernel build board, one card per onboarding client, columns = kernel phases (`agreement_access` → `live`). Kernel phase stored at `items.metadata.kernel_phase` on the client_ops item; checklist rows in `onboarding_checklist`. Reaching `live` flips the client_ops state to `client_active`.
- `/app/onboarding/builds` — project builds board, one card per `project_builds` row. Optional link to a `revenue_schedules` milestone. Moving to `deployed` on a linked expected schedule queues an internal `invoice_milestone` task.
