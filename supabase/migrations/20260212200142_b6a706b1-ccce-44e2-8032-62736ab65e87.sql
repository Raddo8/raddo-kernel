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