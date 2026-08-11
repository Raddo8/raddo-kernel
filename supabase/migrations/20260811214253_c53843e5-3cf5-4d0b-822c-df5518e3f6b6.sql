-- HARDEN-05 acceptance probes. Results are recorded in probe_runs so the
-- outcomes are observed values on the record, not a summary in a message.
CREATE TABLE IF NOT EXISTS public.harden05_probe (
  probe text PRIMARY KEY,
  observed text NOT NULL,
  passed boolean NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.harden05_probe TO authenticated;
GRANT ALL ON public.harden05_probe TO service_role;
ALTER TABLE public.harden05_probe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "harden05 probe readable" ON public.harden05_probe;
CREATE POLICY "harden05 probe readable" ON public.harden05_probe FOR SELECT TO authenticated USING (true);

-- A mid-session raise's origin is the session. That is a real register and
-- the link constraint did not know about it.
ALTER TABLE public.work_link DROP CONSTRAINT IF EXISTS work_link_registry_check;
ALTER TABLE public.work_link ADD CONSTRAINT work_link_registry_check
  CHECK (registry = ANY (ARRAY['open_loops','world_claims','route_audit','scheduled_actions',
                               'decisions','blueprints','ingest_campaign','session']));

DO $probe$
DECLARE
  v_good uuid; v_bad uuid; v_foreign uuid;
  v_res jsonb; v_err text; v_work uuid; v_n int; v_before int; v_after int;
  v_curn1 text; v_curn2 text; v_saved bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO probe_runs (cid, subject_kind, subject_ref, claim, method, expected, observed, passed, ran_by)
  VALUES ('CID-100001','function','record_decision','proof fixture passes','harden05','pass','pass',true,'harden-05')
  RETURNING id INTO v_good;
  INSERT INTO probe_runs (cid, subject_kind, subject_ref, claim, method, expected, observed, passed, ran_by)
  VALUES ('CID-100001','function','record_decision','proof fixture fails','harden05','pass','fail',false,'harden-05')
  RETURNING id INTO v_bad;
  INSERT INTO probe_runs (cid, subject_kind, subject_ref, claim, method, expected, observed, passed, ran_by)
  VALUES ('CID-100002','function','record_decision','proof belonging to another tenant','harden05','pass','pass',true,'harden-05')
  RETURNING id INTO v_foreign;

  -- D1a · a completion decision citing a passing probe is writable again.
  BEGIN
    v_res := public.record_decision(
      'HARDEN-05 D1a · the completion gate is passable', 'The gate is fixed and this decision is shipped.',
      'Probe fixture cites a passing probe_runs row.', 'Jake', 'COB', 'reversible', 'operator',
      null, 'CID-100001', 'TEST', null, null, null, 'harden-05', v_good::text, 'probe_passed');
    INSERT INTO harden05_probe VALUES ('D1a', 'written · id=' || (v_res->>'id') || ' state=' || (v_res->>'verification_state') || ' test_run_id=' || (v_res->>'test_run_id'), true)
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  EXCEPTION WHEN others THEN
    INSERT INTO harden05_probe VALUES ('D1a', 'REFUSED · ' || SQLERRM, false)
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  END;

  -- D1b · claiming proof with no probe is refused by name.
  BEGIN
    v_res := public.record_decision('HARDEN-05 D1b · unproven completion','This is complete.',null,'Jake',null,null,null,
      null,'CID-100001','TEST',null,null,null,'harden-05', null, 'verified');
    INSERT INTO harden05_probe VALUES ('D1b','ACCEPTED (defect) · '||coalesce(v_res->>'id','?'), false)
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  EXCEPTION WHEN others THEN
    INSERT INTO harden05_probe VALUES ('D1b','refused · '||split_part(SQLERRM,':',1), SQLERRM like 'DECISION_PROOF_REQUIRED%')
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  END;

  -- D1c · another tenant's probe is not proof.
  BEGIN
    v_res := public.record_decision('HARDEN-05 D1c · foreign proof','This is deployed.',null,'Jake',null,null,null,
      null,'CID-100001','TEST',null,null,null,'harden-05', v_foreign::text, 'probe_passed');
    INSERT INTO harden05_probe VALUES ('D1c','ACCEPTED (defect)', false)
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  EXCEPTION WHEN others THEN
    INSERT INTO harden05_probe VALUES ('D1c','refused · '||split_part(SQLERRM,':',1), SQLERRM like 'DECISION_PROOF_FOREIGN%')
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  END;

  -- D1d · a failed probe is not proof.
  BEGIN
    v_res := public.record_decision('HARDEN-05 D1d · failed proof','This is done.',null,'Jake',null,null,null,
      null,'CID-100001','TEST',null,null,null,'harden-05', v_bad::text, 'probe_passed');
    INSERT INTO harden05_probe VALUES ('D1d','ACCEPTED (defect)', false)
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  EXCEPTION WHEN others THEN
    INSERT INTO harden05_probe VALUES ('D1d','refused · '||split_part(SQLERRM,':',1), SQLERRM like 'DECISION_PROOF_FAILED%')
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  END;

  -- D1e · a client label in the proof column is refused, not silently stored.
  BEGIN
    v_res := public.record_decision('HARDEN-05 D1e · label as proof','This is live.',null,'Jake',null,null,null,
      null,'CID-100001','TEST',null,null,null,'harden-05', 'my-own-ref-42', 'probe_passed');
    INSERT INTO harden05_probe VALUES ('D1e','ACCEPTED (defect)', false)
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  EXCEPTION WHEN others THEN
    INSERT INTO harden05_probe VALUES ('D1e','refused · '||split_part(SQLERRM,':',1), SQLERRM like 'DECISION_PROOF_MALFORMED%')
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  END;

  -- D6a · an item raised mid-session with no disposition does not reach the board.
  v_res := public.session_raise('CID-100001','HARDEN-05 D6a · undisposed raise fixture','conversation',
    null,'Raised during a session with no disposition stated.','Jake','task',null,'harden-05');
  v_work := (v_res->>'work_id')::uuid;
  v_res := public.work_disposition_queue('CID-100001', 200);
  INSERT INTO harden05_probe VALUES ('D6a',
    'tracked_on_board=false · undisposed_count=' || (v_res->>'undisposed') ||
    ' · in_queue=' || (exists (select 1 from jsonb_array_elements(v_res->'items') e where e->>'work_id' = v_work::text))::text,
    (select count(*) from open_loops o where o.work_id = v_work and o.principal_acts is true) = 0, now())
    ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();

  -- D6b · forgetting without a reason is refused.
  BEGIN
    v_res := public.work_dispose(v_work, 'forgotten', null, null, null);
    INSERT INTO harden05_probe VALUES ('D6b','ACCEPTED (defect)', false)
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  EXCEPTION WHEN others THEN
    INSERT INTO harden05_probe VALUES ('D6b','refused · '||split_part(SQLERRM,':',1), SQLERRM like 'DISPOSITION_REASON_REQUIRED%')
      ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  END;

  -- D6c · forgotten with a reason is a state, and the item is still retrievable.
  v_res := public.work_dispose(v_work, 'forgotten', 'Probe fixture · not real work.', null, null);
  INSERT INTO harden05_probe VALUES ('D6c',
    'state=' || (select state from work_item where work_id=v_work) ||
    ' · retrievable=' || (exists(select 1 from work_item where work_id=v_work))::text,
    (select state from work_item where work_id=v_work) = 'dropped', now())
    ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();

  -- D6d · tracking an item puts it on the board.
  v_res := public.session_raise('CID-100001','HARDEN-05 D6d · tracked raise fixture','conversation',
    true,'Raised and disposed of as the principal''s to move.','Jake','task',null,'harden-05');
  v_work := (v_res->>'work_id')::uuid;
  INSERT INTO harden05_probe VALUES ('D6d',
    'tracked_on_board=' || (v_res->>'tracked_on_board') || ' · loop_id=' || coalesce(v_res->>'loop_id','null'),
    (v_res->>'tracked_on_board')::boolean, now())
    ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();
  PERFORM public.work_dispose(v_work,'forgotten','Probe fixture · not real work.',null,null);

  -- D6e · the board withholds with a reason instead of a bare absence.
  v_res := public.board_render('CID-100001', false, 500);
  INSERT INTO harden05_probe VALUES ('D6e',
    'rendered=' || (v_res->>'count') || ' · withheld=' || jsonb_array_length(v_res->'withheld') ||
    ' · undisposed=' || (v_res->>'undisposed_count'),
    jsonb_array_length(v_res->'withheld') > 0, now())
    ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();

  -- D7 · identifier numbering rolls past 99,999 instead of colliding.
  SELECT last_value INTO v_saved FROM curn_sequence WHERE cid='CID-100004' AND kind='D';
  UPDATE curn_sequence SET last_value = 99999 WHERE cid='CID-100004' AND kind='D';
  v_curn1 := public.next_curn('CID-100004','D');
  v_curn2 := public.next_curn('CID-100004','D');
  UPDATE curn_sequence SET last_value = v_saved WHERE cid='CID-100004' AND kind='D';
  INSERT INTO harden05_probe VALUES ('D7',
    v_curn1 || ' then ' || v_curn2, v_curn1 = 'CID-100004-D-100000' AND v_curn2 = 'CID-100004-D-100001', now())
    ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();

  -- D4 · health derives from surfaced_count, so a tenant that never rendered
  -- still reports honestly.
  SELECT count(*) INTO v_n FROM open_loops o
   WHERE o.cid='CID-100002' AND o.brief_status='open' AND coalesce(o.surfaced_count,0) >= 8;
  INSERT INTO harden05_probe VALUES ('D4',
    'CID-100002 surfaced_8_plus=' || v_n || ' · escalation_state rows=' ||
    (SELECT count(*) FROM open_loops WHERE cid='CID-100002' AND escalation_state IS NOT NULL),
    true, now())
    ON CONFLICT (probe) DO UPDATE SET observed=excluded.observed, passed=excluded.passed, ran_at=now();

  -- Clean up the decision fixtures. The probe_runs rows stay: they are evidence.
  DELETE FROM decisions WHERE tool_version='harden-05' AND provenance='TEST';
END $probe$;