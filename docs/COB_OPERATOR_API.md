# COB Operator API

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
`state` is the item_state `name` (e.g. `signal`, `qualified`, `meeting_set`).

## queue_task
Creates an `internal_task` action with `status=approved` for the worklist.
```json
{ "action": "queue_task", "pursuit_id": "<uuid>", "task": "follow_up", "note": "check back after demo" }
```

## Errors
`401 unauthorized` · `403 workspace_locked` · `400 unknown_action | invalid_json | *_required | invalid_layer | unknown_state` · `404 not_found` · `429 rate_limited` · `500 internal_error`
