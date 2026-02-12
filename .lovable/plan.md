

# Scheduler Health Dashboard (Revised)

All seven feedback items addressed. No client-side aggregation. Server-side RPCs for all metrics. Defense-in-depth workspace scoping. Safe error rendering.

## Database Changes (Migration)

Create a single Postgres function `get_scheduler_health(p_workspace_id uuid)` that returns all metrics in one RPC call. This avoids 7 separate round-trips and keeps all aggregation server-side.

### RPC: `get_scheduler_health(p_workspace_id uuid) RETURNS jsonb`

Returns a JSON object with all metrics computed atomically:

```sql
CREATE OR REPLACE FUNCTION public.get_scheduler_health(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stuck_threshold_minutes int := 10;
  v_stuck int;
  v_completed_1h int;
  v_failed_1h int;
  v_avg_exec_latency_seconds numeric;
  v_avg_queue_latency_seconds numeric;
  v_completed_24h int;
  v_failed_24h int;
  v_webhook_events jsonb;
  v_recent_failures jsonb;
BEGIN
  -- Guard: caller must be workspace member
  IF NOT is_workspace_member(auth.uid(), p_workspace_id) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  -- Stuck actions
  SELECT count(*)::int INTO v_stuck
  FROM actions
  WHERE workspace_id = p_workspace_id
    AND status = 'running'
    AND claimed_at < now() - (v_stuck_threshold_minutes || ' minutes')::interval;

  -- Completed 1h
  SELECT count(*)::int INTO v_completed_1h
  FROM actions
  WHERE workspace_id = p_workspace_id
    AND status = 'completed'
    AND executed_at > now() - interval '1 hour';

  -- Failed 1h
  SELECT count(*)::int INTO v_failed_1h
  FROM actions
  WHERE workspace_id = p_workspace_id
    AND status = 'failed'
    AND executed_at > now() - interval '1 hour';

  -- Avg execution latency (claimed_at -> executed_at) 1h
  SELECT coalesce(round(avg(extract(epoch from (executed_at - claimed_at)))::numeric, 1), 0)
  INTO v_avg_exec_latency_seconds
  FROM actions
  WHERE workspace_id = p_workspace_id
    AND status = 'completed'
    AND executed_at > now() - interval '1 hour'
    AND claimed_at IS NOT NULL;

  -- Avg queue latency (created_at -> claimed_at) 1h
  SELECT coalesce(round(avg(extract(epoch from (claimed_at - created_at)))::numeric, 1), 0)
  INTO v_avg_queue_latency_seconds
  FROM actions
  WHERE workspace_id = p_workspace_id
    AND status = 'completed'
    AND executed_at > now() - interval '1 hour'
    AND claimed_at IS NOT NULL;

  -- 24h success/fail
  SELECT count(*) FILTER (WHERE status = 'completed')::int,
         count(*) FILTER (WHERE status = 'failed')::int
  INTO v_completed_24h, v_failed_24h
  FROM actions
  WHERE workspace_id = p_workspace_id
    AND executed_at > now() - interval '24 hours'
    AND status IN ('completed', 'failed');

  -- Webhook events 24h by type
  SELECT coalesce(jsonb_object_agg(event_type, cnt), '{}'::jsonb)
  INTO v_webhook_events
  FROM (
    SELECT event_type, count(*)::int as cnt
    FROM message_events
    WHERE workspace_id = p_workspace_id
      AND occurred_at > now() - interval '24 hours'
    GROUP BY event_type
  ) sub;

  -- Recent failures (last 10) - extract safe error summary only
  SELECT coalesce(jsonb_agg(row_to_json(sub)), '[]'::jsonb)
  INTO v_recent_failures
  FROM (
    SELECT
      id,
      type,
      channel,
      left(coalesce(result_json->>'error', result_json->>'message', 'Unknown error'), 200) as error_summary,
      executed_at
    FROM actions
    WHERE workspace_id = p_workspace_id
      AND status = 'failed'
    ORDER BY executed_at DESC NULLS LAST
    LIMIT 10
  ) sub;

  RETURN jsonb_build_object(
    'stuck_count', v_stuck,
    'stuck_threshold_minutes', v_stuck_threshold_minutes,
    'completed_1h', v_completed_1h,
    'failed_1h', v_failed_1h,
    'avg_exec_latency_seconds', v_avg_exec_latency_seconds,
    'avg_queue_latency_seconds', v_avg_queue_latency_seconds,
    'completed_24h', v_completed_24h,
    'failed_24h', v_failed_24h,
    'webhook_events_24h', v_webhook_events,
    'recent_failures', v_recent_failures
  );
END;
$$;
```

Key design decisions:
- **SECURITY DEFINER** with `is_workspace_member` guard: explicit workspace scoping inside the function, not relying solely on RLS
- **`v_stuck_threshold_minutes` is a single constant** at the top of the function, displayed in the UI
- **Two latency metrics**: `avg_exec_latency_seconds` (claimed_at to executed_at) AND `avg_queue_latency_seconds` (created_at to claimed_at) -- captures scheduler delays
- **`error_summary`** truncated to 200 chars, extracts only `error` or `message` keys from `result_json` -- no raw JSON rendering
- **`message_events` explicitly filtered by `workspace_id`** -- defense-in-depth

## Frontend: `src/pages/SchedulerHealth.tsx`

Single page component. One RPC call, one state object.

### Data fetching strategy

```typescript
const [health, setHealth] = useState<HealthData | null>(null);
const [fetchState, setFetchState] = useState<'ok' | 'loading' | 'error' | 'access_denied'>('loading');
const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
const [retryMs, setRetryMs] = useState(30_000); // starts at 30s

// On success: reset retryMs to 30s, set lastUpdated
// On error: double retryMs (cap at 5min), show "Data stale" indicator
// On access_denied: stop polling, show permission error
```

### Error-safe refresh with exponential backoff

- Normal: refresh every 30 seconds
- On query failure: double interval (30s -> 60s -> 120s -> 300s cap)
- Show "Data stale -- last updated X ago" banner in amber when in backoff
- Show "Last refreshed: HH:mm:ss" timestamp always
- On recovery: reset to 30s

### UI states (three distinct states per the requirement)

| State | Visual |
|-------|--------|
| Data loaded, count = 0 | Green "0" with checkmark |
| Query error | Amber banner: "Failed to load health data -- retrying in Xs" |
| Access denied / RLS blocked | Red banner: "Permission denied -- contact workspace admin" |

### Layout

**Row 1: 4 metric cards**

| Card | Value | Source |
|------|-------|--------|
| Stuck Actions | `stuck_count` (red if > 0, green if 0) + "threshold: Xm" subtitle | `stuck_threshold_minutes` from RPC |
| Completed (1h) | `completed_1h` green | RPC |
| Failed (1h) | `failed_1h` red if > 0 | RPC |
| Latency (1h) | Two lines: "Exec: Xs" and "Queue: Xs" | `avg_exec_latency_seconds`, `avg_queue_latency_seconds` |

**Row 2: 2 wider cards**

| Card | Content |
|------|---------|
| 24h Throughput | "Completed: X / Failed: Y" with color coding |
| Webhook Events (24h) | List of event_type: count pairs from `webhook_events_24h` |

**Row 3: Recent Failures table**

Columns: Type, Channel, Error (truncated `error_summary` -- already sanitized server-side), Executed At.

No raw `result_json` rendering anywhere. Only the pre-extracted `error_summary` string (max 200 chars, no HTML).

## Routing and Navigation

- `src/App.tsx`: Add route `/scheduler-health` pointing to `SchedulerHealth`
- `src/components/AppSidebar.tsx`: Add "Health" entry with `HeartPulse` icon after "Suppressions"

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | `get_scheduler_health()` function |
| `src/pages/SchedulerHealth.tsx` | New -- full dashboard page |
| `src/App.tsx` | Add route |
| `src/components/AppSidebar.tsx` | Add nav entry |

## Addressing Each Feedback Item

1. **Server-side aggregation**: All computation in a single Postgres function. Zero client-side grouping.
2. **Explicit workspace scoping**: `workspace_id = p_workspace_id` on every query inside the function + `is_workspace_member` guard.
3. **Configurable stuck threshold**: `v_stuck_threshold_minutes` constant in one place, returned to UI and displayed.
4. **End-to-end latency**: Both `created_at -> claimed_at` (queue delay) and `claimed_at -> executed_at` (execution time) measured and shown.
5. **Error-safe refresh with backoff**: Exponential backoff on failure, "data stale" banner, last-updated timestamp.
6. **Distinct UI states**: Zero counts vs query error vs permission denied -- three separate visual treatments.
7. **No raw result_json**: Server extracts `error` or `message` key, truncates to 200 chars. UI renders plain text only.
