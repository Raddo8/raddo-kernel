CREATE OR REPLACE FUNCTION public.tool_latency_report(p_tools text[] DEFAULT ARRAY['convene_council','summon_best_advisor'], p_min_calls integer DEFAULT 3)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  with src as (
    select tool, duration_ms, 'mcp_usage_events'::text as source from mcp_usage_events where duration_ms is not null
    union all
    select tool, duration_ms, 'execution_receipts'::text from execution_receipts where duration_ms is not null
  )
  select coalesce(jsonb_agg(x order by x->>'tool'), '[]'::jsonb) from (
    select jsonb_build_object(
      'tool', t.tool,
      'measured_calls', count(s.duration_ms),
      'p50_ms', percentile_disc(0.5) within group (order by s.duration_ms),
      'p90_ms', percentile_disc(0.9) within group (order by s.duration_ms),
      'max_ms', max(s.duration_ms),
      'sources', (select coalesce(jsonb_agg(distinct s2.source), '[]'::jsonb) from src s2 where s2.tool = t.tool),
      'reportable', count(s.duration_ms) >= p_min_calls,
      'note', case when count(s.duration_ms) >= p_min_calls then null
             else 'Not enough measured calls yet. ' || count(s.duration_ms) ||
                  ' call(s) carry a duration; nothing was backfilled. No percentile is reported rather than a number nobody measured.' end
    ) x
    from unnest(p_tools) t(tool)
    left join src s on s.tool = t.tool
    group by t.tool
  ) q;
$$;