
-- ============================================================
-- HARDEN-12 · SPINE-AUTHORITY-1
-- M1 authority through the ledger · M2 definer classification
-- M3 last open table · M4 authority receipts
-- ============================================================

-- ---------- M4 · receipts (built first so M1 can write them) ----------
CREATE TABLE IF NOT EXISTS public.authority_access_receipts (
  receipt_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_auth_user_id  uuid,
  caller_label         text NOT NULL,
  ledger_fleet_role    text,
  ledger_status        text,
  ledger_granted_at    timestamptz,
  ledger_present       boolean NOT NULL,
  target_cid           text NOT NULL,
  action               text NOT NULL,
  decision             text NOT NULL CHECK (decision IN ('GRANTED','DENIED')),
  reason               text,
  sightings            integer NOT NULL DEFAULT 1,
  first_seen_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS authority_access_receipts_identity
  ON public.authority_access_receipts (
    coalesce(caller_auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    caller_label, target_cid, action, decision
  );

GRANT SELECT ON public.authority_access_receipts TO authenticated;
GRANT ALL    ON public.authority_access_receipts TO service_role;
ALTER TABLE public.authority_access_receipts ENABLE ROW LEVEL SECURITY;

-- ---------- M1 · the ledger is the only answer ----------
CREATE OR REPLACE FUNCTION public.fleet_authority()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object(
              'auth_user_id', fo.auth_user_id,
              'fleet_role',   fo.fleet_role,
              'status',       fo.status,
              'granted_at',   fo.granted_at,
              'revoked_at',   fo.revoked_at,
              'present',      true,
              'is_operator',  fo.status = 'ACTIVE' AND fo.revoked_at IS NULL,
              'may_write',    fo.status = 'ACTIVE' AND fo.revoked_at IS NULL
                              AND fo.fleet_role IN ('FLEET_ADMIN','FLEET_OWNER'))
       FROM public.fleet_operators fo
      WHERE fo.auth_user_id = auth.uid()
      LIMIT 1),
    jsonb_build_object('auth_user_id', auth.uid(), 'present', false,
                       'is_operator', false, 'may_write', false));
$$;

CREATE OR REPLACE FUNCTION public.is_fleet_operator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce((public.fleet_authority()->>'is_operator')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION public.is_fleet_operator_write()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce((public.fleet_authority()->>'may_write')::boolean, false);
$$;

-- The role string is retired as an authority source. One ledger, one answer.
CREATE OR REPLACE FUNCTION public.is_cob_operator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_fleet_operator();
$$;

CREATE OR REPLACE FUNCTION public.authority_receipt(
  p_action text, p_target_cid text, p_decision text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  a jsonb := public.fleet_authority();
  v_claims json;
  v_label text;
BEGIN
  BEGIN v_claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  EXCEPTION WHEN others THEN v_claims := NULL; END;
  v_label := coalesce(v_claims->>'email', auth.uid()::text, session_user, 'unknown');

  INSERT INTO public.authority_access_receipts (
    caller_auth_user_id, caller_label, ledger_fleet_role, ledger_status,
    ledger_granted_at, ledger_present, target_cid, action, decision, reason)
  VALUES (
    auth.uid(), v_label, a->>'fleet_role', a->>'status',
    nullif(a->>'granted_at','')::timestamptz,
    coalesce((a->>'present')::boolean, false),
    coalesce(p_target_cid, 'FLEET'), p_action, p_decision, p_reason)
  ON CONFLICT (coalesce(caller_auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
               caller_label, target_cid, action, decision)
  DO UPDATE SET sightings = public.authority_access_receipts.sightings + 1,
                last_seen_at = now(),
                ledger_fleet_role = excluded.ledger_fleet_role,
                ledger_status = excluded.ledger_status,
                ledger_present = excluded.ledger_present,
                reason = coalesce(excluded.reason, public.authority_access_receipts.reason);
EXCEPTION WHEN others THEN
  RAISE WARNING 'authority_receipt_write_failed: %', SQLERRM;
END $$;

-- Receipt-bearing guard. Grants leave a trace, not only denials.
CREATE OR REPLACE FUNCTION public.admin_guard_action(
  p_action text, p_target_cid text DEFAULT NULL, p_write boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  a jsonb := public.fleet_authority();
  v_escape text;
BEGIN
  IF coalesce((a->>'is_operator')::boolean, false) THEN
    IF p_write AND NOT coalesce((a->>'may_write')::boolean, false) THEN
      PERFORM public.authority_receipt(p_action, p_target_cid, 'DENIED',
        'ledger role ' || coalesce(a->>'fleet_role','none') || ' may read and may not write');
      RAISE EXCEPTION 'ADMIN_READ_ONLY: ledger role % may read and may not write.',
        coalesce(a->>'fleet_role','none') USING ERRCODE = '42501';
    END IF;
    PERFORM public.authority_receipt(p_action, p_target_cid, 'GRANTED',
      'ledger row ' || coalesce(a->>'auth_user_id','?') || ' role ' || coalesce(a->>'fleet_role','?'));
    RETURN;
  END IF;

  v_escape := coalesce(current_setting('cob.admin', true), '');
  IF v_escape IN ('1','true','on','yes') THEN
    PERFORM public.authority_receipt(p_action, p_target_cid, 'GRANTED',
      'cob.admin escape · no ledger row · session_user ' || session_user);
    INSERT INTO public.admin_audit_access (operator, operator_email, target_cid, action, detail)
    VALUES (auth.uid(), session_user, coalesce(p_target_cid,'FLEET'), 'admin_guard_escape',
            jsonb_build_object('session_user', session_user, 'requested_action', p_action));
    RETURN;
  END IF;

  PERFORM public.authority_receipt(p_action, p_target_cid, 'DENIED',
    'absent from fleet_operators · session_user ' || session_user);
  RAISE EXCEPTION 'ADMIN_ONLY: this action is reserved to an active fleet operator on the ledger. Being connected as the service role is not authority.'
    USING ERRCODE = '42501';
END $$;

CREATE OR REPLACE FUNCTION public.admin_guard()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.admin_guard_action('admin_guard', public.current_cid(), true);
END $$;

-- Operator read of another tenant · gated and recorded.
CREATE OR REPLACE FUNCTION public.operator_read_guard(p_target_cid text, p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a jsonb := public.fleet_authority();
BEGIN
  IF coalesce((a->>'is_operator')::boolean, false) THEN
    PERFORM public.authority_receipt(p_action, p_target_cid, 'GRANTED',
      'operator read · ledger row ' || coalesce(a->>'auth_user_id','?') ||
      ' role ' || coalesce(a->>'fleet_role','?'));
    RETURN true;
  END IF;
  PERFORM public.authority_receipt(p_action, p_target_cid, 'DENIED', 'absent from fleet_operators');
  RETURN false;
END $$;

-- Policies that ask the ledger (M1d). Read is operator-wide; write needs FLEET_ADMIN.
DROP POLICY IF EXISTS fleet_ops_read_ledger ON public.fleet_operators;
CREATE POLICY fleet_ops_read_ledger ON public.fleet_operators
  FOR SELECT TO authenticated USING (public.is_fleet_operator());
DROP POLICY IF EXISTS fleet_ops_write_ledger ON public.fleet_operators;
CREATE POLICY fleet_ops_write_ledger ON public.fleet_operators
  FOR ALL TO authenticated
  USING (public.is_fleet_operator_write()) WITH CHECK (public.is_fleet_operator_write());
GRANT SELECT ON public.fleet_operators TO authenticated;
GRANT ALL ON public.fleet_operators TO service_role;
ALTER TABLE public.fleet_operators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authority_receipts_operator_read ON public.authority_access_receipts;
CREATE POLICY authority_receipts_operator_read ON public.authority_access_receipts
  FOR SELECT TO authenticated USING (public.is_fleet_operator());

DROP POLICY IF EXISTS admin_audit_operator_read ON public.admin_audit_access;
CREATE POLICY admin_audit_operator_read ON public.admin_audit_access
  FOR SELECT TO authenticated USING (public.is_fleet_operator());
GRANT SELECT ON public.admin_audit_access TO authenticated;
GRANT ALL ON public.admin_audit_access TO service_role;

-- ---------- M2 · classify the definer layer ----------
CREATE TABLE IF NOT EXISTS public.authority_secdef_register (
  fn_name          text NOT NULL,
  fn_args          text NOT NULL,
  bucket           text NOT NULL DEFAULT 'UNCLASSIFIED'
                   CHECK (bucket IN ('FLEET_BY_DESIGN','SCOPED_BY_CALLER','GENUINE_GAP','UNCLASSIFIED')),
  reason           text,
  callers          text,
  reachable_anon   boolean,
  reachable_auth   boolean,
  trigger_bound    boolean,
  remediation      text,
  remediated       boolean NOT NULL DEFAULT false,
  deferred_reason  text,
  classified_at    timestamptz NOT NULL DEFAULT now(),
  synced_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fn_name, fn_args)
);

GRANT SELECT ON public.authority_secdef_register TO authenticated;
GRANT ALL    ON public.authority_secdef_register TO service_role;
ALTER TABLE public.authority_secdef_register ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS secdef_register_operator_read ON public.authority_secdef_register;
CREATE POLICY secdef_register_operator_read ON public.authority_secdef_register
  FOR SELECT TO authenticated USING (public.is_fleet_operator());

-- The candidate rule, in code, so the set is re-derivable and never hand-kept.
CREATE OR REPLACE FUNCTION public.authority_secdef_candidates()
RETURNS TABLE(fn_name text, fn_args text, reachable_anon boolean, reachable_auth boolean,
              trigger_bound boolean, callers text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH secdef AS (
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosrc
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  ),
  cidtabs AS (
    SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'cid'
                         AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m')
  )
  SELECT s.proname, s.args,
         has_function_privilege('anon', s.oid, 'EXECUTE'),
         has_function_privilege('authenticated', s.oid, 'EXECUTE'),
         EXISTS (SELECT 1 FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgfoid = s.oid),
         (SELECT string_agg(DISTINCT p2.proname, ',')
            FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
           WHERE n2.nspname = 'public' AND p2.proname <> s.proname
             AND p2.prosrc ~* ('\m' || s.proname || '\M'))
    FROM secdef s
   WHERE EXISTS (SELECT 1 FROM cidtabs t WHERE s.prosrc ~* ('\m' || t.relname || '\M'))
     AND s.prosrc !~* 'current_cid'
     AND s.prosrc !~* 'resolve_tenant_context'
     AND s.args   !~* 'p_cid';
$$;

CREATE OR REPLACE FUNCTION public.authority_secdef_sync()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_new int; v_gone int;
BEGIN
  INSERT INTO public.authority_secdef_register (fn_name, fn_args, reachable_anon, reachable_auth, trigger_bound, callers)
  SELECT c.fn_name, c.fn_args, c.reachable_anon, c.reachable_auth, c.trigger_bound, c.callers
    FROM public.authority_secdef_candidates() c
  ON CONFLICT (fn_name, fn_args) DO UPDATE
    SET reachable_anon = excluded.reachable_anon,
        reachable_auth = excluded.reachable_auth,
        trigger_bound  = excluded.trigger_bound,
        callers        = excluded.callers,
        synced_at      = now();
  GET DIAGNOSTICS v_new = ROW_COUNT;

  DELETE FROM public.authority_secdef_register r
   WHERE NOT EXISTS (SELECT 1 FROM public.authority_secdef_candidates() c
                      WHERE c.fn_name = r.fn_name AND c.fn_args = r.fn_args);
  GET DIAGNOSTICS v_gone = ROW_COUNT;

  RETURN jsonb_build_object('synced', v_new, 'retired', v_gone,
    'candidates', (SELECT count(*) FROM public.authority_secdef_candidates()));
END $$;

CREATE OR REPLACE FUNCTION public.authority_secdef_report()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'candidates', (SELECT count(*) FROM public.authority_secdef_candidates()),
    'registered', (SELECT count(*) FROM public.authority_secdef_register),
    'FLEET_BY_DESIGN',  (SELECT count(*) FROM public.authority_secdef_register WHERE bucket='FLEET_BY_DESIGN'),
    'SCOPED_BY_CALLER', (SELECT count(*) FROM public.authority_secdef_register WHERE bucket='SCOPED_BY_CALLER'),
    'GENUINE_GAP',      (SELECT count(*) FROM public.authority_secdef_register WHERE bucket='GENUINE_GAP'),
    'UNCLASSIFIED',     (SELECT count(*) FROM public.authority_secdef_register WHERE bucket='UNCLASSIFIED'),
    'gap_repaired',     (SELECT count(*) FROM public.authority_secdef_register WHERE bucket='GENUINE_GAP' AND remediated),
    'gap_deferred',     (SELECT count(*) FROM public.authority_secdef_register WHERE bucket='GENUINE_GAP' AND NOT remediated),
    'fleet_by_design_reachable_by_tenant',
      (SELECT count(*) FROM public.authority_secdef_register
        WHERE bucket='FLEET_BY_DESIGN' AND (reachable_anon OR reachable_auth) AND NOT remediated),
    'scoped_without_named_callers',
      (SELECT count(*) FROM public.authority_secdef_register
        WHERE bucket='SCOPED_BY_CALLER' AND coalesce(btrim(reason),'') = ''));
$$;

SELECT public.authority_secdef_sync();

-- ---------- M2 · repairs before classification is asserted ----------

-- Fourteen internal maintenance functions the client never calls. Contraction,
-- not expansion: they keep working for the service role and for definer callers.
REVOKE EXECUTE ON FUNCTION public.audit_kernel_parts() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_kernel_absent_signals() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_layer_sync() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rekey_status() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_attempts_in_flight(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.session_context_purge() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.session_id_for_context(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tool_latency_report(text[], integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vocabulary_gaps() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_save_attempt(uuid, text, jsonb, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_session_context(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_cid_strict(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_fleet_board() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fleet_surfacing_health() FROM anon, authenticated;

-- work_dispose reached tenant rows by id alone. It now resolves the caller.
CREATE OR REPLACE FUNCTION public.work_dispose(
  p_work uuid, p_disposition text, p_reason text DEFAULT NULL::text,
  p_principal_acts boolean DEFAULT NULL::boolean, p_date_kind text DEFAULT NULL::text,
  p_lane text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_cid text;
  v_caller_cid text;
  v_date_kinds text[] := array['hard_deadline','scheduled_event','target','window','reference','expected_next'];
begin
  select cid into v_cid from work_item where work_id = p_work;
  if v_cid is null then raise exception 'WORK_ITEM_NOT_FOUND: %', p_work using errcode='23503'; end if;

  -- Authority · the row's client must be the caller's client, or the caller
  -- must be on the operator ledger, and that read leaves a receipt.
  v_caller_cid := public.current_cid();
  if v_caller_cid is distinct from v_cid then
    if not public.operator_read_guard(v_cid, 'work_dispose') then
      raise exception 'CROSS_TENANT_REFUSED: this item belongs to another client and you are not on the operator ledger.'
        using errcode='42501';
    end if;
  end if;

  if p_lane is not null and lower(btrim(p_lane)) = any(v_date_kinds) then
    raise exception 'LANE_IS_NOT_A_DATE_KIND: "%" is a date kind, not a lane. Pass it as p_date_kind. p_lane carries the client''s own lanes, such as legal or sales.',
      p_lane using errcode='22023';
  end if;

  if p_disposition = 'tracked' then
    if p_principal_acts is null then
      raise exception 'DISPOSITION_INCOMPLETE: tracking an item requires saying whether the principal is the one who must move.'
        using errcode='22023'; end if;
    if p_date_kind is not null and p_date_kind <> all(v_date_kinds) then
      raise exception 'DISPOSITION_DATE_KIND_UNKNOWN: % (hard_deadline|scheduled_event|target|window|reference|expected_next)', p_date_kind
        using errcode='22023'; end if;
    update work_item
       set principal_acts = p_principal_acts,
           date_kind = coalesce(p_date_kind, date_kind, 'target'),
           lane = coalesce(nullif(btrim(p_lane),''), lane),
           updated_at = now()
     where work_id = p_work;
    perform public.work_score(v_cid);
    perform public.work_sync_loops(v_cid);

  elsif p_disposition = 'forgotten' then
    if p_reason is null or btrim(p_reason)='' then
      raise exception 'DISPOSITION_REASON_REQUIRED: forgetting an item requires a reason. An item that vanishes without one is data loss, not triage.'
        using errcode='22023'; end if;
    perform public.work_close(p_work, 'dropped', p_reason, null, null);
    update work_item set principal_acts = coalesce(principal_acts,false),
                         lane = coalesce(nullif(btrim(p_lane),''), lane),
                         updated_at = now()
     where work_id = p_work;
    perform public.work_sync_loops(v_cid);

  else
    raise exception 'DISPOSITION_UNKNOWN: % (tracked|forgotten)', p_disposition using errcode='22023';
  end if;

  return jsonb_build_object('ok',true,'work_id',p_work,'cid',v_cid,'disposition',p_disposition,
    'date_kind',p_date_kind,'lane',p_lane,'reason',p_reason,'retrievable',true);
end $function$;

-- ---------- M3 · the last open table ----------
ALTER TABLE public.memory_entity_link ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memory_entity_link FROM anon, authenticated;
GRANT ALL ON public.memory_entity_link TO service_role;

-- ---------- M2 · the classification itself ----------
SELECT public.authority_secdef_sync();

UPDATE public.authority_secdef_register SET bucket='UNCLASSIFIED', reason=NULL, remediation=NULL, remediated=false;

-- FLEET_BY_DESIGN · cross-tenant on purpose, unreachable by a tenant principal.
UPDATE public.authority_secdef_register SET bucket='FLEET_BY_DESIGN', classified_at=now(),
  reason='Fleet maintenance or fleet reporting. Operates across every client by design. EXECUTE is held by no tenant-facing role, so a tenant principal cannot call it; it runs from cron or the service role.'
WHERE fn_name IN (
  'admin_fleet_board','admin_fleet_live','audit_kernel_parts','bridge_claim_next',
  'bridge_reap_stale_claims','cid_null_watchdog','council_minute_watchdog','fleet_surfacing_health',
  'hq_records_fleet_v1','hq_signals_fleet','kernel_boot_watchdog','kernel_challenge_sweep',
  'lane_a_commit2_selftest','next_cid','reap_stale_action_claims','reconcile_kernel_absent_signals',
  'register_layer_sync','register_silence_watchdog','rekey_status','run_scheduled_actions',
  'save_attempts_in_flight','session_context_purge','tool_latency_report','vocabulary_gaps',
  'watchdog_health','publish_doctrine','amend_doctrine_rule','ratify_doctrine_rule',
  'retire_doctrine_rule','set_doctrine_tier','mint_tenant','resolve_identity_v2');

-- SCOPED_BY_CALLER · the client is already resolved before this runs.
UPDATE public.authority_secdef_register SET bucket='SCOPED_BY_CALLER', classified_at=now(),
  reason='Trigger body. It never chooses a row: it runs inside the write it guards and reads the client identifier off NEW, which the write already carries.'
WHERE trigger_bound AND fn_name IN (
  'bridge_runs_immutable_once_terminal','execution_receipts_append_only',
  'guard_duplicate_name_kernel_activation','guard_protected_kernel_parts','handle_new_profile',
  'log_directive_phase','onboarding_bind_cid','tg_change_ledger','tg_tool_contract_guard',
  'trg_memory_entity_link');

UPDATE public.authority_secdef_register SET bucket='SCOPED_BY_CALLER', classified_at=now(),
  reason='Scoped by the caller''s own authenticated identity or by a named parent that has already resolved the client. Not reachable with another client''s identifier.'
WHERE fn_name IN (
  'resolve_tenant_context','resolve_hq_authority_v1','resolve_principal_context','redeem_access_code',
  'hq_blueprints_read','hq_scheduled_read','next_invoice_number','hq_records_counts_v1',
  'verify_dissertation_depth_v1','memory_signal','kernel_activate','kernel_validate',
  'close_save_attempt','close_session_context','session_id_for_context','resolve_cid_strict',
  'scheduled_action_receipt','work_close','ingest_budget','ingest_claim','ingest_commit',
  'ingest_enqueue','ingest_fail','ingest_release','ingest_session_close','ingest_session_open',
  'world_build_all_v1','world_build_events_v3','world_build_spine_v1','world_entity_heat_v1',
  'world_entity_heat_v2','world_hubs_v1','world_lane_heat_v1','world_link_mentions_v1','world_search_v1');

-- GENUINE_GAP · reachable, touches client data, resolved nothing. Repaired above.
UPDATE public.authority_secdef_register SET bucket='GENUINE_GAP', remediated=true, classified_at=now(),
  reason='Authority predicate that answered from a role string on tenant_members rather than from the operator ledger.',
  remediation='Rewritten to return public.is_fleet_operator(), so the ledger is the only answer.'
WHERE fn_name = 'is_cob_operator';

UPDATE public.authority_secdef_register SET bucket='GENUINE_GAP', remediated=true, classified_at=now(),
  reason='Reachable by a signed-in principal and reached a work_item by id alone, with no check that the row belonged to the caller''s client.',
  remediation='Now compares the row''s client to public.current_cid() and refuses unless the caller is on the operator ledger, in which case the cross-client read is recorded.'
WHERE fn_name = 'work_dispose';

UPDATE public.authority_secdef_register SET bucket='GENUINE_GAP', remediated=true, classified_at=now(),
  reason='Fleet-wide maintenance or reporting that was directly executable by anon or authenticated. Reachable is the defect, not the fleet scope.',
  remediation='EXECUTE revoked from anon and authenticated. Callable by the service role and by definer callers only.'
WHERE fn_name IN ('audit_kernel_parts','reconcile_kernel_absent_signals','register_layer_sync','rekey_status',
                  'save_attempts_in_flight','session_context_purge','tool_latency_report','vocabulary_gaps',
                  'admin_fleet_board','fleet_surfacing_health','close_save_attempt','close_session_context',
                  'session_id_for_context','resolve_cid_strict');
