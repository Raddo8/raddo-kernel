-- ── L2a · latency on every tool call ──────────────────────────────────
ALTER TABLE public.mcp_usage_events ADD COLUMN IF NOT EXISTS duration_ms integer;
COMMENT ON COLUMN public.mcp_usage_events.duration_ms IS
  'L2a · wall-clock milliseconds for the tool call. Nothing backfilled; NULL means the call predates measurement.';
CREATE INDEX IF NOT EXISTS mcp_usage_events_tool_duration_idx
  ON public.mcp_usage_events (tool, created_at DESC) WHERE duration_ms IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tool_latency_report(p_tools text[] DEFAULT ARRAY['convene_council','summon_best_advisor'], p_min_calls integer DEFAULT 3)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select coalesce(jsonb_agg(x order by x->>'tool'), '[]'::jsonb) from (
    select jsonb_build_object(
      'tool', t.tool,
      'measured_calls', count(e.duration_ms),
      'p50_ms', percentile_disc(0.5) within group (order by e.duration_ms),
      'p90_ms', percentile_disc(0.9) within group (order by e.duration_ms),
      'max_ms', max(e.duration_ms),
      'reportable', count(e.duration_ms) >= p_min_calls,
      'note', case when count(e.duration_ms) >= p_min_calls then null
             else 'Not enough measured calls yet. ' || count(e.duration_ms) ||
                  ' call(s) carry a duration; nothing was backfilled. No percentile is reported rather than a number nobody measured.' end
    ) x
    from unnest(p_tools) t(tool)
    left join mcp_usage_events e on e.tool = t.tool and e.duration_ms is not null
    group by t.tool
  ) s;
$$;
GRANT EXECUTE ON FUNCTION public.tool_latency_report(text[], integer) TO authenticated, service_role;

-- ── L3 · a timeout and a failure are never the same record ────────────
ALTER TABLE public.improvement_signals ADD COLUMN IF NOT EXISTS failure_mode text;
ALTER TABLE public.improvement_signals ADD COLUMN IF NOT EXISTS elapsed_seconds numeric;
ALTER TABLE public.improvement_signals ADD COLUMN IF NOT EXISTS transport_detail text;
ALTER TABLE public.improvement_signals ADD COLUMN IF NOT EXISTS subject_tool text;

ALTER TABLE public.improvement_signals DROP CONSTRAINT IF EXISTS improvement_signals_failure_mode_chk;
ALTER TABLE public.improvement_signals ADD CONSTRAINT improvement_signals_failure_mode_chk
  CHECK (failure_mode IS NULL OR failure_mode = ANY (ARRAY['TIMEOUT','REFUSED','ERRORED','UNREACHABLE']));

-- A signal is a tool-problem signal when it names both a subject that is a
-- tool surface and a problem word. Board and mechanism signals are untouched.
CREATE OR REPLACE FUNCTION public.is_tool_problem_signal(p_key text, p_pattern text, p_detail text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  select (lower(coalesce(p_key,'') || ' ' || coalesce(p_pattern,'')) ~ '(tool|connector|mcp|council|endpoint|edge function|gateway)')
     and (lower(coalesce(p_key,'') || ' ' || coalesce(p_pattern,'') || ' ' || coalesce(p_detail,'')) ~ '(time ?d? ?out|timeout|refus|unreachable|unavailable|down|failed|failing|error)')
$$;

CREATE OR REPLACE FUNCTION public.guard_tool_problem_signal()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  if public.is_tool_problem_signal(new.signal_key, new.pattern, new.detail_md)
     and new.failure_mode is null then
    raise exception 'SIGNAL_FAILURE_MODE_REQUIRED: this signal records a tool problem and must name which one it was. Use TIMEOUT with elapsed_seconds (the client gave up waiting), REFUSED with the transport error, ERRORED with the server error, or UNREACHABLE with the resolution failure. A client that gave up and a server that refused are opposite problems with opposite fixes and were being written identically.'
      using errcode = '22023';
  end if;
  if new.failure_mode = 'TIMEOUT' and new.elapsed_seconds is null then
    raise exception 'SIGNAL_TIMEOUT_NEEDS_ELAPSED: a TIMEOUT signal must carry the seconds the caller actually waited. Without it, slow is indistinguishable from broken.'
      using errcode = '22023';
  end if;
  if new.failure_mode in ('REFUSED','ERRORED','UNREACHABLE') and coalesce(new.transport_detail,'') = '' then
    raise exception 'SIGNAL_MODE_NEEDS_DETAIL: a % signal must carry the underlying error text in transport_detail.', new.failure_mode
      using errcode = '22023';
  end if;
  return new;
end $$;

DROP TRIGGER IF EXISTS tg_guard_tool_problem_signal ON public.improvement_signals;
CREATE TRIGGER tg_guard_tool_problem_signal
  BEFORE INSERT OR UPDATE ON public.improvement_signals
  FOR EACH ROW EXECUTE FUNCTION public.guard_tool_problem_signal();

CREATE OR REPLACE FUNCTION public.cob_tool_problem_raise(
  p_cid text,
  p_tool text,
  p_failure_mode text,
  p_detail text,
  p_elapsed_seconds numeric DEFAULT NULL,
  p_transport_detail text DEFAULT NULL,
  p_surface text DEFAULT 'mcp'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_id uuid; v_key text;
begin
  if p_failure_mode is null or p_failure_mode not in ('TIMEOUT','REFUSED','ERRORED','UNREACHABLE') then
    raise exception 'SIGNAL_FAILURE_MODE_REQUIRED: name it TIMEOUT, REFUSED, ERRORED or UNREACHABLE.' using errcode='22023';
  end if;
  v_key := 'tool_' || lower(p_failure_mode) || '_' || regexp_replace(lower(coalesce(p_tool,'unknown')), '[^a-z0-9_]+', '_', 'g');
  insert into improvement_signals
    (cid, signal_key, pattern, detail_md, audience, silent, status, provenance,
     source_surface, source_subject, tenancy, classification, caller,
     failure_mode, elapsed_seconds, transport_detail, subject_tool)
  values
    (p_cid, v_key, v_key, p_detail, 'operator', false, 'open', 'cob_tool_problem_raise',
     p_surface, p_tool, 'TENANT', 'tool_problem', 'cob_tool_problem_raise',
     p_failure_mode, p_elapsed_seconds, p_transport_detail, p_tool)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'failure_mode', p_failure_mode,
                            'tool', p_tool, 'elapsed_seconds', p_elapsed_seconds);
end $$;
GRANT EXECUTE ON FUNCTION public.cob_tool_problem_raise(text,text,text,text,numeric,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tool_problem_report(p_cid text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'failure_mode', s.failure_mode, 'tool', s.subject_tool, 'count', s.n,
    'max_elapsed_seconds', s.max_elapsed, 'last_seen', s.last_seen) order by s.failure_mode, s.subject_tool), '[]'::jsonb)
  from (
    select failure_mode, subject_tool, count(*) n, max(elapsed_seconds) max_elapsed, max(last_seen) last_seen
    from improvement_signals
    where failure_mode is not null and (p_cid is null or cid = p_cid)
    group by 1,2
  ) s;
$$;
GRANT EXECUTE ON FUNCTION public.tool_problem_report(text) TO authenticated, service_role;