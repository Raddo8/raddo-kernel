
CREATE OR REPLACE FUNCTION public.reconcile_kernel_absent_signals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp'
AS $$
DECLARE v_n int := 0;
BEGIN
  -- Re-derive from the same read that produces the claim: a kernel-absent
  -- signal asserts only the absence of an active kernels row for that cid.
  WITH bad AS (
    SELECT s.id
      FROM public.improvement_signals s
     WHERE s.pattern = 'kernel-absent'
       AND s.status <> 'resolved'
       AND EXISTS (SELECT 1 FROM public.kernels k
                    WHERE k.cid = s.cid AND k.status = 'active')
  )
  UPDATE public.improvement_signals s
     SET status = 'resolved',
         last_seen = now(),
         detail_md = s.detail_md ||
           E'\n\nResolved by re-derivation: this client has an active identity kernel, so the absence this warning asserts is not true. A session that worked without loading its kernel is a different finding and is raised as kernel-not-booted.'
    FROM bad
   WHERE s.id = bad.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.kernel_boot_watchdog()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare r record; flagged int := 0;
begin
  -- G5 · reconcile first, so no row survives whose pattern its own detail contradicts.
  perform public.reconcile_kernel_absent_signals();

  -- A · working with no identity kernel in existence at all.
  for r in
    select t.cid, t.cob_name, count(e.id) calls, max(e.created_at) last_call
    from public.tenants t join public.mcp_usage_events e on e.cid = t.cid
    where not exists (select 1 from public.kernels k where k.cid = t.cid and k.status='active')
    group by 1,2
  loop
    perform public.cob_signal_raise_internal(
      r.cid, 'kernel-absent',
      format('%s has no active identity kernel and has made %s tool calls, most recently %s. It is operating with no profile, no instructions, no preamble and no state pointer.',
             coalesce(r.cob_name,'This tenant'), r.calls, r.last_call),
      null, 'kernel_boot_watchdog', 'watchdog', r.cob_name,
      jsonb_build_object('cid', r.cid, 'calls', r.calls), 'provisioning', 'watchdog');
    flagged := flagged + 1;
  end loop;

  -- B · a SESSION that worked without loading its kernel IN THAT SESSION.
  for r in
    select se.cid, se.session_id, t.cob_name,
           count(*) calls, min(se.created_at) first_call
      from public.session_event se
      join public.tenants t on t.cid = se.cid
     where se.session_id is not null
       and se.created_at > now() - interval '7 days'
       and exists (select 1 from public.kernels k where k.cid = se.cid and k.status='active')
       and not exists (
         select 1 from public.kernel_access_log a
          where a.session_id::text = se.session_id::text
            and a.cid = se.cid
            and a.access_kind = 'RUNTIME_LOAD')
     group by 1,2,3
  loop
    if not exists (
      select 1 from public.improvement_signals s
       where s.cid = r.cid and s.pattern = 'kernel-not-booted'
         and s.status = 'open' and s.detail_md like '%' || r.session_id || '%')
    then
      perform public.cob_signal_raise_internal(
        r.cid, 'kernel-not-booted',
        format('%s worked in session %s from %s and never loaded its kernel in that session (%s tool call(s)). begin_session loads the kernel; a session that never calls it runs unbooted.',
               coalesce(r.cob_name,'This COB'), r.session_id, r.first_call, r.calls),
        r.session_id::text, 'kernel_boot_watchdog', 'watchdog', r.cob_name,
        jsonb_build_object('cid', r.cid, 'session_id', r.session_id, 'calls_in_session', r.calls),
        'operator', 'watchdog');
      flagged := flagged + 1;
    end if;
  end loop;

  return flagged;
end $function$;
