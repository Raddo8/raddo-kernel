CREATE OR REPLACE FUNCTION public.cob_signal_raise_internal(p_cid text, p_key text, p_detail text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_tool text DEFAULT NULL::text, p_surface text DEFAULT NULL::text, p_subject text DEFAULT NULL::text, p_link jsonb DEFAULT NULL::jsonb, p_audience text DEFAULT 'operator'::text, p_raised_by text DEFAULT 'watchdog'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_key text; v_id uuid;
begin
  if p_cid is null or coalesce(btrim(p_key),'')='' then return null; end if;
  v_key := regexp_replace(regexp_replace(lower(btrim(p_key)),'[^a-z0-9]+','-','g'),'^-+|-+$','','g');
  v_key := case
     when v_key ~ 'kernel-(not-booted|absent|unbooted)' then 'kernel-not-booted'
     when v_key ~ 'council-timeout' then 'council-timeout-is-transport'
     when v_key ~ 'notion' then 'notion-mirror-fails'
     else v_key end;

  select id into v_id from improvement_signals
   where cid=p_cid and signal_key=v_key order by last_seen desc nulls last limit 1;

  if v_id is null then
    -- Every register row carries a reference number. Signals ride the S series.
    insert into improvement_signals (cid, curn, signal_key, pattern, recurrence, detail_md, audience,
      silent, status, first_seen, last_seen, provenance, authoritative, verification_state, sightings)
    values (p_cid, public.next_curn(p_cid, 'S'), v_key, p_key, 1, p_detail, coalesce(p_audience,'operator'),
            false, 'open', now(), now(), 'OPERATOR', true, 'verified', 1)
    returning id into v_id;
  else
    update improvement_signals
       set recurrence = coalesce(recurrence,0)+1, sightings = coalesce(sightings,0)+1,
           last_seen = now(), detail_md = coalesce(p_detail, detail_md),
           status = case when status='closed' then 'open' else coalesce(status,'open') end
     where id = v_id;
  end if;

  insert into signal_sighting (signal_id, cid, signal_key, session_id, tool, surface, subject, detail_md, link, raised_by)
  values (v_id, p_cid, v_key, p_session_id, p_tool, p_surface, p_subject, p_detail, p_link, p_raised_by);
  return v_id;
end $function$;