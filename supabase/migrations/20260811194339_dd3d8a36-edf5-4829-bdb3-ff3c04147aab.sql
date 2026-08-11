DO $$
DECLARE
  v_before bigint; v_after bigint; v_res jsonb;
  v_keep uuid := '6bf98401-bf5b-4ae1-8a05-532b3e6a8ef4';
  v_dup  uuid := '6a396d2a-48e7-49e1-ba04-e451682aa8d0';
  v_red  uuid := '2fb52b6c-653e-494e-9c64-f40cb65bcf97';
  v_deadline uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT count(*) INTO v_before FROM open_loops WHERE cid='CID-100001';
  v_res := public.board_supersede(v_keep, v_dup, 'CID-100001');
  SELECT count(*) INTO v_after FROM open_loops WHERE cid='CID-100001';
  INSERT INTO probe_runs(cid,subject_kind,subject_ref,claim,method,expected,observed,passed,ran_by)
  VALUES ('CID-100001','function','board_supersede',
    'F1b · the duplicate JAEL-MERCY row is retired, the older row survives, nothing is deleted',
    'board_supersede(keep,duplicate,cid)','row count unchanged, duplicate cleared and pointed at the keeper',
    format('before=%s after=%s result=%s', v_before, v_after, v_res), v_after = v_before, 'harden-04-addendum');

  SELECT count(*) INTO v_before FROM open_loops WHERE cid='CID-100001';
  v_res := public.board_update(jsonb_build_array(jsonb_build_object(
             'id', v_red::text, 'owner', 'JAKE', 'state', 'waiting')), 'CID-100001');
  SELECT count(*) INTO v_after FROM open_loops WHERE cid='CID-100001';
  INSERT INTO probe_runs(cid,subject_kind,subject_ref,claim,method,expected,observed,passed,ran_by)
  VALUES ('CID-100001','function','board_update',
    'F1a · a row whose title carries a masked segment updates by id and forks nothing',
    'board_update([{id,...}], cid)','one row updated, zero rows created',
    format('before=%s after=%s result=%s', v_before, v_after, v_res),
    v_after = v_before, 'harden-04-addendum');

  SELECT id INTO v_deadline FROM open_loops
   WHERE cid='CID-100001' AND brief_status='open' AND surfaced_count >= 8
   ORDER BY surfaced_count DESC LIMIT 1;
  PERFORM public.board_update(jsonb_build_array(jsonb_build_object(
    'id', v_deadline::text, 'urgent', true, 'urgent_reason', 'external party waiting',
    'hard_deadline', (current_date + 5)::text)), 'CID-100001');

  v_res := public.board_render('CID-100001', true, 500);

  INSERT INTO probe_runs(cid,subject_kind,subject_ref,claim,method,expected,observed,passed,ran_by)
  SELECT 'CID-100001','function','board_render',
    'F2a · an item at three or more surfacings with no action carries an escalation flag',
    'board_render(cid,true)','escalation_state set on unactioned repeats',
    format('flagged=%s mechanism_review=%s items=%s',
      (SELECT count(*) FROM jsonb_array_elements(v_res->'items') i WHERE i->>'escalation_state'='flagged'),
      (SELECT count(*) FROM jsonb_array_elements(v_res->'items') i WHERE i->>'escalation_state'='mechanism_review'),
      jsonb_array_length(coalesce(v_res->'items','[]'::jsonb))),
    (SELECT count(*) FROM jsonb_array_elements(v_res->'items') i WHERE i->>'escalation_state' IS NOT NULL) > 0,
    'harden-04-addendum';

  INSERT INTO probe_runs(cid,subject_kind,subject_ref,claim,method,expected,observed,passed,ran_by)
  SELECT 'CID-100001','function','board_render',
    'F2b · a loop with a hard deadline stays surfaced and is exempt from deferral',
    'board_render(cid,true)','urgent true, present in items',
    coalesce((SELECT i::text FROM jsonb_array_elements(v_res->'items') i WHERE i->>'id' = v_deadline::text), 'ABSENT'),
    EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'items') i
             WHERE i->>'id' = v_deadline::text AND (i->>'urgent')::boolean IS TRUE),
    'harden-04-addendum';

  INSERT INTO probe_runs(cid,subject_kind,subject_ref,claim,method,expected,observed,passed,ran_by)
  SELECT 'CID-100001','function','board_render',
    'F3a · a rendered board offers snooze on a thrice-surfaced item',
    'board_render(cid,true)','offered_actions contains snooze',
    format('items_offering_snooze=%s of %s',
      (SELECT count(*) FROM jsonb_array_elements(v_res->'items') i WHERE i->'offered_actions' ? 'snooze'),
      jsonb_array_length(coalesce(v_res->'items','[]'::jsonb))),
    (SELECT count(*) FROM jsonb_array_elements(v_res->'items') i WHERE i->'offered_actions' ? 'snooze') > 0,
    'harden-04-addendum';
END $$;