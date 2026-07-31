CREATE OR REPLACE FUNCTION public.lane_a_commit2_selftest()
RETURNS TABLE(test text, result text, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  p0 int; e0 int; c0 int; p1 int; e1 int; c1 int;
  r jsonb; cc int; adv boolean; n int; ok boolean; msg text;
  v_pid uuid;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}', true);
  delete from identity_observations where issuer='https://selftest.iss';

  select count(*) into p0 from principals;
  select count(*) into e0 from external_identities;
  select count(*) into c0 from connector_installations;

  -- TEST 1: unknown subject
  r := public.observe_external_identity('https://selftest.iss','subj-1','COB-TEST','test-surface','v1',null);
  select count(*) into p1 from principals;
  select count(*) into e1 from external_identities;
  select count(*) into c1 from connector_installations;
  select count(*) into n from identity_observations where issuer='https://selftest.iss';
  test := 'UNKNOWN SUBJECT';
  result := case when n=1 and r->>'review_status'='OBSERVED' and (r->>'newly_seen')::boolean
                       and p1=p0 and e1=e0 and c1=c0 then 'PASS' else 'FAIL' end;
  detail := format('obs_rows=%s status=%s principals %s->%s external_identities %s->%s connector_installations %s->%s',
                   n, r->>'review_status', p0,p1,e0,e1,c0,c1);
  return next;

  -- TEST 2: repeat sight
  r := public.observe_external_identity('https://selftest.iss','subj-1','COB-TEST','test-surface','v2','a@b.c');
  select count(*) into n from identity_observations where issuer='https://selftest.iss';
  select call_count, last_seen_at > first_seen_at into cc, adv
    from identity_observations where issuer='https://selftest.iss' and provider_subject='subj-1';
  test := 'REPEAT SIGHT';
  result := case when n=1 and cc=2 and adv and not (r->>'newly_seen')::boolean then 'PASS' else 'FAIL' end;
  detail := format('rows=%s call_count=%s last_seen_advanced=%s newly_seen=%s', n, cc, adv, r->>'newly_seen');
  return next;

  -- TEST 4: no authority without approval trio
  select principal_id into v_pid from principals limit 1;
  begin
    insert into identity_observations (issuer, provider_subject, review_status, evidence, linked_principal_id)
    values ('https://selftest.iss','subj-bad','BOUND','selftest', v_pid);
    ok := false; msg := 'insert unexpectedly succeeded';
  exception when check_violation then
    ok := true; msg := 'refused by CHECK';
  end;
  test := 'NO AUTHORITY'; result := case when ok then 'PASS' else 'FAIL' end; detail := msg;
  return next;

  -- TEST 3: bound subject reports BOUND
  update identity_observations
     set review_status='BOUND', linked_principal_id=v_pid,
         authorized_by='selftest', authorized_at=now(), authorization_receipt='rcpt-selftest'
   where issuer='https://selftest.iss' and provider_subject='subj-1';
  r := public.observe_external_identity('https://selftest.iss','subj-1',null,null,'v3',null);
  test := 'BOUND SUBJECT';
  result := case when r->>'review_status'='BOUND' and (r->>'bound')::boolean
                      and r->>'principal_id' = v_pid::text then 'PASS' else 'FAIL' end;
  detail := r::text;
  return next;

  -- TEST 5: live bindings intact
  for r in select jsonb_build_object('subject', ei.provider_subject,
                    'ctx', public.resolve_principal_context(ei.issuer, ei.provider_subject))
             from external_identities ei where ei.status='ACTIVE'
  loop
    test := 'LIVE BINDING '||(r->>'subject');
    result := case when (r->'ctx'->>'resolution_mode') like 'OK%' and (r->'ctx'->>'cid') is not null
                   then 'PASS' else 'FAIL' end;
    detail := format('mode=%s cid=%s', r->'ctx'->>'resolution_mode', r->'ctx'->>'cid');
    return next;
  end loop;

  -- cleanup: remove only selftest observations
  update identity_observations set linked_principal_id=null, review_status='OBSERVED',
         authorized_by=null, authorized_at=null, authorization_receipt=null
   where issuer='https://selftest.iss';
  delete from identity_observations where issuer='https://selftest.iss';

  select count(*) into p1 from principals;
  select count(*) into e1 from external_identities;
  test := 'AUTHORITY PLANE UNCHANGED';
  result := case when p1=p0 and e1=e0 then 'PASS' else 'FAIL' end;
  detail := format('principals %s->%s external_identities %s->%s', p0,p1,e0,e1);
  return next;
end $$;

REVOKE ALL ON FUNCTION public.lane_a_commit2_selftest() FROM PUBLIC, anon, authenticated;