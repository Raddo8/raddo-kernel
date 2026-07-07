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
