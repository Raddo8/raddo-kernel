create or replace function public.hq_signals_read(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_cid text;
begin
  v_cid := public.current_cid();
  if v_cid is null then return jsonb_build_object('ok',false,'reason','unauthenticated'); end if;
  return jsonb_build_object('ok',true,'cid',v_cid,
    'counts',(select jsonb_build_object(
        'distinct_patterns', count(distinct signal_key),
        'open', count(*) filter (where coalesce(status,'open') <> 'closed'),
        'chronic', count(distinct signal_key) filter (where recurrence >= 3),
        'times_it_has_happened', coalesce(sum(recurrence),0))
      from improvement_signals where cid=v_cid),
    'items',(select coalesce(jsonb_agg(x order by x.times desc),'[]'::jsonb) from (
       select s.signal_key as key,
              (array_agg(s.id order by s.last_seen desc nulls last))[1] as id,
              max(coalesce(s.pattern, s.signal_key))       as pattern,
              sum(s.recurrence)                            as times,
              (sum(s.recurrence) >= 3)                     as chronic,
              min(s.first_seen)                            as first_seen,
              max(s.last_seen)                             as last_seen,
              bool_or(coalesce(s.status,'open') <> 'closed') as still_open,
              max(s.detail_md)                             as detail_md,
              (select coalesce(jsonb_agg(jsonb_build_object(
                        'at', g.at, 'session_id', g.session_id, 'tool', g.tool,
                        'surface', g.surface, 'subject', g.subject, 'link', g.link)
                        order by g.at desc), '[]'::jsonb)
               from (select * from signal_sighting sg
                      where sg.cid=v_cid and sg.signal_key=s.signal_key
                      order by sg.at desc limit 5) g)      as where_it_happened,
              (select count(*) from signal_sighting sg2
                where sg2.cid=v_cid and sg2.signal_key=s.signal_key) as sightings_logged
       from improvement_signals s where s.cid=v_cid
       group by s.signal_key
       order by sum(s.recurrence) desc
       limit greatest(1,least(coalesce(p_limit,100),300))) x));
end $$;

grant execute on function public.hq_signals_read(integer) to authenticated;