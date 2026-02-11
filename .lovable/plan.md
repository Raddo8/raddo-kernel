

# Action Inspector Drawer with Message Events

## Overview

Add a right-side Sheet drawer that opens when clicking any action row (in Actions Queue or Item Detail). Shows full action metadata and linked message events for delivery visibility.

## New File: `src/components/ActionInspectorDrawer.tsx`

A Sheet component that accepts an action object and renders two sections:

**Section 1 -- Action Details**
- Type, channel, status (using StatusBadge)
- Item title + account name (from joined data)
- Recipient email (from `result_json.recipient_email`)
- Rendered subject (from `result_json.rendered_subject`)
- Provider + provider_message_id
- Timestamps: created_at, scheduled_for, executed_at
- Persistence warning flag if `result_json.persistence_warning` exists

**Section 2 -- Message Events**
- Fetched using dual-query strategy:
  1. Primary: `message_events.action_id = action.id` scoped by `workspace_id = action.workspace_id`, ordered by `occurred_at desc`, limit 50
  2. Fallback: if primary returns empty AND `action.provider_message_id` is non-null, query by `provider_message_id`, same workspace scope + ordering
  3. Merge and de-dupe by event `id`
- Each event row shows: normalized event type badge (strip `email.` prefix, show original in tooltip), `occurred_at` timestamp
- Empty state: "No delivery events yet" when no provider_message_id and no events

**Event type normalization helper** (inline in the component):
```
normalizeEventType("email.delivered") -> "delivered"
normalizeEventType("bounced") -> "bounced"
```
Display the normalized label; show the raw value in a title/tooltip.

## Modified: `src/components/StatusBadge.tsx`

Add styles for message event types:
- `delivered`: green (same as completed)
- `bounced`: red (same as failed)
- `complained`: red
- `opened`: blue (same as scheduled)
- `clicked`: blue

## Modified: `src/pages/ActionsQueue.tsx`

- Add state: `selectedAction` and `drawerOpen`
- Make each action row div clickable (`onClick` sets selected action + opens drawer)
- On Play and Approve buttons: add `e.stopPropagation()` to prevent drawer from opening
- Render `ActionInspectorDrawer` at bottom of component
- The existing select query already fetches `*` which includes `workspace_id` and `provider_message_id`

## Modified: `src/pages/ItemDetail.tsx`

- Add state: `selectedAction` and `drawerOpen`
- Make each action in the QUEUED list clickable (same pattern)
- Render `ActionInspectorDrawer`
- The existing actions query already fetches `*`

## No Database Changes

`message_events` table already has RLS for workspace members and the necessary columns (`action_id`, `provider_message_id`, `workspace_id`, `event_type`, `occurred_at`).

## Acceptance Criteria

1. Clicking an action row opens the drawer showing correct action id, rendered subject, and recipient
2. Clicking Play or Approve executes without opening the drawer (stopPropagation)
3. For a sent action with provider_message_id, drawer shows message events including "delivered"
4. For an unsent action, message events section shows clean empty state
5. No cross-workspace leakage (workspace_id scoped query + RLS)
6. Event type badges strip `email.` prefix and show raw value in tooltip

## Files Modified
- `src/components/ActionInspectorDrawer.tsx` (new)
- `src/components/StatusBadge.tsx`
- `src/pages/ActionsQueue.tsx`
- `src/pages/ItemDetail.tsx`

