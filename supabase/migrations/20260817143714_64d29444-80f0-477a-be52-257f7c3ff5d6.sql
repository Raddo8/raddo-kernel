-- HARDEN-15 R1/Q3 · the canary write leg must exercise the same path a client
-- uses: a BOOTED session, and work_dispose without a declared cid.
CREATE OR REPLACE FUNCTION public.client_access_canary(p_phase text DEFAULT 'SCHEDULED'::text, p_label text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_run uuid; r record; v_j jsonb; v_n int; v_k int;
  v_boot text; v_tx text; v_boot_d text; v_tx_d text;
  v_wr text; v_wr_d text; v_work uuid; v_prev boolean; v_prev_lane text;
  v_sid text; v_claims text;
  v_total int := 0; v_bok int := 0; v_tok int := 0; v_wok int := 0; v_fail int := 0; v_unv int := 0;
BEGIN
  INSERT INTO public.client_access_canary_run (phase, label)
  VALUES (coalesce(p_phase,'SCHEDULED'), p_label)
  RETURNING run_id INTO v_run;

  v_claims := current_setting('request.jwt.claims', true);

  FOR r IN
    SELECT cid, cob_name FROM public.tenants
     WHERE tenancy = 'TENANT' AND status IN ('live','provisioning')
     ORDER BY cid
  LOOP
    v_total := v_total + 1;
    v_boot := 'UNVERIFIED'; v_tx := 'UNVERIFIED'; v_boot_d := NULL; v_tx_d := NULL;
    v_wr := 'UNVERIFIED'; v_wr_d := NULL;

    BEGIN
      v_j := public.boot_layer_plan(r.cid);
      IF v_j IS NULL THEN
        v_boot := 'UNVERIFIED'; v_boot_d := 'boot_layer_plan returned null · not proven, not assumed healthy';
      ELSE
        SELECT count(*) INTO v_k FROM public.kernel_parts kp
          JOIN public.kernels k ON k.id = kp.kernel_id
         WHERE k.cid = r.cid;
        v_boot := 'OK';
        v_boot_d := 'boot_layer_plan resolved · kernel parts reachable: ' || v_k;
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        IF public.canary_by_design_refusal(SQLERRM) THEN
          v_boot := 'UNVERIFIED'; v_boot_d := 'refused by design outside the gateway · ' || SQLERRM;
        ELSE
          v_boot := 'FAIL'; v_boot_d := 'permission denied · ' || SQLERRM;
        END IF;
      WHEN others THEN v_boot := 'UNVERIFIED'; v_boot_d := SQLSTATE || ' · ' || SQLERRM;
    END;

    BEGIN
      v_j := public.board_render(r.cid, false, 1);
      v_tx := CASE WHEN v_j IS NULL THEN 'UNVERIFIED' ELSE 'OK' END;
      v_tx_d := CASE WHEN v_j IS NULL THEN 'board_render returned null · not proven'
                     ELSE 'board_render resolved' END;
    EXCEPTION
      WHEN insufficient_privilege THEN
        IF public.canary_by_design_refusal(SQLERRM) THEN
          BEGIN
            SELECT count(*) INTO v_n FROM public.open_loops WHERE cid = r.cid;
            v_tx := 'OK';
            v_tx_d := 'board_render is gateway-only from this context (' ||
                      split_part(SQLERRM, ':', 1) ||
                      '); governed row read proved access · open_loops rows visible: ' || v_n;
          EXCEPTION WHEN others THEN
            v_tx := 'UNVERIFIED';
            v_tx_d := 'board_render gateway-only and fallback governed read failed · ' || SQLERRM;
          END;
        ELSE
          v_tx := 'FAIL'; v_tx_d := 'permission denied · ' || SQLERRM;
        END IF;
      WHEN others THEN v_tx := 'UNVERIFIED'; v_tx_d := SQLSTATE || ' · ' || SQLERRM;
    END;

    -- ── one governed WRITE on the CLIENT path ─────────────────────────
    -- HARDEN-15 correction: no declared cid. A canary session is booted the
    -- same way a client's is, the write resolves through that session, and
    -- the session is closed again. Boot is the path, not an obstacle.
    BEGIN
      SELECT work_id, principal_acts, lane INTO v_work, v_prev, v_prev_lane
        FROM public.work_item
       WHERE cid = r.cid AND coalesce(state,'') NOT IN ('closed','dropped')
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1;

      IF v_work IS NULL THEN
        v_wr := 'UNVERIFIED';
        v_wr_d := 'no open work item to exercise · write path not proven, not assumed healthy';
      ELSE
        v_sid := gen_random_uuid()::text;
        PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
        PERFORM public.open_session_context(v_sid, r.cid, NULL, 'canary', interval '2 minutes');
        BEGIN
          PERFORM public.work_dispose(v_work, 'tracked', NULL, coalesce(v_prev,false), NULL, v_prev_lane);
          UPDATE public.work_item
             SET principal_acts = v_prev, lane = v_prev_lane, updated_at = updated_at
           WHERE work_id = v_work;
          v_wr := 'OK';
          v_wr_d := 'work_dispose accepted a booted client write on work_id ' || v_work || ' · reverted';
        EXCEPTION WHEN others THEN
          v_wr := 'FAIL';
          v_wr_d := 'governed write refused · ' || SQLSTATE || ' · ' || SQLERRM;
        END;
        PERFORM public.close_session_context(v_sid);
        PERFORM set_config('request.jwt.claims', coalesce(v_claims,''), true);
      END IF;
    EXCEPTION WHEN others THEN
      v_wr := 'FAIL';
      v_wr_d := 'governed write refused · ' || SQLSTATE || ' · ' || SQLERRM;
    END;

    INSERT INTO public.client_access_canary_result
      (run_id, cid, cob_name, boot_status, transact_status, boot_detail, transact_detail, write_status, write_detail)
    VALUES (v_run, r.cid, r.cob_name, v_boot, v_tx, v_boot_d, v_tx_d, v_wr, v_wr_d);

    IF v_boot = 'OK' THEN v_bok := v_bok + 1; END IF;
    IF v_tx   = 'OK' THEN v_tok := v_tok + 1; END IF;
    IF v_wr   = 'OK' THEN v_wok := v_wok + 1; END IF;
    IF 'FAIL' IN (v_boot, v_tx, v_wr) THEN v_fail := v_fail + 1;
    ELSIF 'UNVERIFIED' IN (v_boot, v_tx, v_wr) THEN v_unv := v_unv + 1; END IF;
  END LOOP;

  UPDATE public.client_access_canary_run
     SET tenants_total = v_total, boot_ok = v_bok, transact_ok = v_tok, write_ok = v_wok,
         failed = v_fail, unverified = v_unv,
         notes = CASE WHEN v_total = 0
           THEN 'no ACTIVE tenants matched (tenancy TENANT, status live or provisioning)'
           ELSE v_total || ' tenants probed · ' || v_fail || ' failing · ' || v_unv || ' unverified' END
   WHERE run_id = v_run;

  RETURN jsonb_build_object(
    'ok', true, 'run_id', v_run, 'phase', coalesce(p_phase,'SCHEDULED'), 'label', p_label,
    'tenants_total', v_total, 'boot_ok', v_bok, 'transact_ok', v_tok, 'write_ok', v_wok,
    'failed', v_fail, 'unverified', v_unv,
    'tenants', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'cid', cid, 'cob_name', cob_name, 'boot', boot_status, 'transact', transact_status,
        'write', write_status, 'boot_detail', boot_detail, 'transact_detail', transact_detail,
        'write_detail', write_detail) ORDER BY cid), '[]'::jsonb)
      FROM public.client_access_canary_result WHERE run_id = v_run));
END $function$;

SELECT public.client_access_canary('AFTER','HARDEN-15 correction R1-R4');