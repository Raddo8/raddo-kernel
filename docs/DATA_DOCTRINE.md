# Data Doctrine

Single-source-of-truth rules for the CRM kernel. Every UI surface, every rollup, every export MUST derive from the canonical table listed here — never from a duplicated copy.

## Canonical sources

| Fact | Canonical table | Notes |
| ---- | --------------- | ----- |
| Pursuit stage / state | `items.state_id` (→ `item_states`) | Only the state machine transitions this. |
| Contact fields (name/email/phone/role) | `contacts` | Edits update this row directly, always via UI dialog → audit event. |
| Account fields (name/type/status/utm_slug) | `accounts` (+ `metadata`) | `metadata.utm_slug` powers signal binding. |
| Money in (deposits, fees, subscriptions) | `revenue_schedules` | Kernel usage/monetization is separate (`workspace_billing`, `usage_events`). Do not entangle. |
| Historical seed pricing (context only) | `items.metadata.pricing` | Informational. See fallback rule below. |
| Timeline / audit | `timeline_events` | Every mutation from UI writes a system event (`writeAuditEvent`). |

## Money fallback rule

Rollups (board pipeline strip, revenue calendar, forecast, MRR):

1. If `revenue_schedules` rows exist for a pursuit, use ONLY those rows.
2. If none exist, fall back to `items.metadata.pricing` for that pursuit and mark it visibly as `seed`.
3. Once any schedule is created for a pursuit, its metadata pricing is ignored — never additive.

This guarantees: editing a schedule on `/app/revenue` visibly changes the board rollup and forecast with zero other edits required.

## Forecast

`forecast = committed + Σ(expected_amount × stage_probability(state_name))`

- `committed` = schedules in status `active | invoiced | paid`.
- `expected` = schedules in status `expected | agreement_pending`.
- Stage probability is stored in `workspaces.settings.stage_probabilities` (state name → % 0-100). Defaults in `src/lib/workspace-settings.ts`.

## Fiscal calendar

- `workspaces.settings.fiscal_year_start` (1-12) picks the FY start month (default January).
- Quarter view renders 13 weekly columns starting at the fiscal-quarter boundary. Past and future quarters render from the same schedule data — paid items appear as actuals in history.
- Subscriptions land in the week containing each monthly `next_due`; one-times land in the week of their `start_date`/`next_due`.

## Edit surfaces

All UI edits route through the audit helper (`src/lib/audit.ts`) which writes a `timeline_events` row (`direction=system`, `channel=system`, `raw_json.audit=true`) with per-field diff. Soft delete (`status=cancelled`) is the only permitted way to remove a `revenue_schedules` row — hard deletes are forbidden.
