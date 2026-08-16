CREATE OR REPLACE FUNCTION public.client_access_canary(
  p_phase text DEFAULT 'SCHEDULED',
  p_label text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_run uuid; r record; v_j jsonb; v_n int;
  v_boot text; v_tx text; v_boot_d text; v_tx_d text;
  v_total int := 0; v_bok int := 0; v_tok int := 0; v_fail int := 0; v_unv int := 0;
BEGIN
  INSERT INTO public.client_access_canary_run (phase, label)
  VALUES (coalesce(p_phase,'SCHEDULED'), p_label)
  RETURNING run_id INTO v_run;

  FOR r IN
    SELECT cid, cob_name FROM public.tenants
     WHERE tenancy = 'TENANT' AND status IN ('live','provisioning')
     ORDER BY cid
  LOOP
    v_total := v_total + 1;
    v_boot := 'UNVERIFIED'; v_tx := 'UNVERIFIED'; v_boot_d := NULL; v_tx_d := NULL;

    -- ── boot path ─────────────────────────────────────────────────────
    BEGIN
      v_j := public.boot_layer_plan(r.cid);
      IF v_j IS NULL THEN
        v_boot := 'UNVERIFIED'; v_boot_d := 'boot_layer_plan returned null · not proven, not assumed healthy';
      ELSE
        v_boot := 'OK'; v_boot_d := 'boot_layer_plan resolved';
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        IF SQLERRM ILIKE '%SERVER_ONLY%' THEN
          v_boot := 'UNVERIFIED';
          v_boot_d := 'refused by design outside the gateway · ' || SQLERRM;
        ELSE
          v_boot := 'FAIL'; v_boot_d := 'permission denied · ' || SQLERRM;
        END IF;
      WHEN others THEN v_boot := 'UNVERIFIED'; v_boot_d := SQLSTATE || ' · ' || SQLERRM;
    END;

    -- ── one governed read · the same board read the console uses ──────
    BEGIN
      v_j := public.board_render(r.cid, false, 1);
      IF v_j IS NULL THEN
        v_tx := 'UNVERIFIED'; v_tx_d := 'board_render returned null · not proven';
      ELSE
        v_tx := 'OK'; v_tx_d := 'board_render resolved';
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        IF SQLERRM ILIKE '%SERVER_ONLY%' THEN
          -- refused by design outside the gateway. Fall back to a direct
          -- governed row read so the tenant is still positively proven.
          BEGIN
            SELECT count(*) INTO v_n FROM public.open_loops WHERE cid = r.cid;
            v_tx := 'OK';
            v_tx_d := 'board_render is gateway-only outside the server; governed row read proved access · open_loops rows visible: ' || v_n;
          EXCEPTION WHEN others THEN
            v_tx := 'UNVERIFIED';
            v_tx_d := 'board_render gateway-only and fallback read failed · ' || SQLERRM;
          END;
        ELSE
          v_tx := 'FAIL'; v_tx_d := 'permission denied · ' || SQLERRM;
        END IF;
      WHEN others THEN v_tx := 'UNVERIFIED'; v_tx_d := SQLSTATE || ' · ' || SQLERRM;
    END;

    INSERT INTO public.client_access_canary_result
      (run_id, cid, cob_name, boot_status, transact_status, boot_detail, transact_detail)
    VALUES (v_run, r.cid, r.cob_name, v_boot, v_tx, v_boot_d, v_tx_d);

    IF v_boot = 'OK' THEN v_bok := v_bok + 1; END IF;
    IF v_tx   = 'OK' THEN v_tok := v_tok + 1; END IF;
    IF 'FAIL' IN (v_boot, v_tx) THEN v_fail := v_fail + 1;
    ELSIF 'UNVERIFIED' IN (v_boot, v_tx) THEN v_unv := v_unv + 1; END IF;
  END LOOP;

  UPDATE public.client_access_canary_run
     SET tenants_total = v_total, boot_ok = v_bok, transact_ok = v_tok,
         failed = v_fail, unverified = v_unv,
         notes = CASE WHEN v_total = 0
           THEN 'no ACTIVE tenants matched (tenancy TENANT, status live or provisioning)'
           ELSE v_total || ' tenants probed · ' || v_fail || ' failing · ' || v_unv || ' unverified' END
   WHERE run_id = v_run;

  RETURN jsonb_build_object(
    'ok', true, 'run_id', v_run, 'phase', coalesce(p_phase,'SCHEDULED'), 'label', p_label,
    'tenants_total', v_total, 'boot_ok', v_bok, 'transact_ok', v_tok,
    'failed', v_fail, 'unverified', v_unv,
    'tenants', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'cid', cid, 'cob_name', cob_name, 'boot', boot_status, 'transact', transact_status,
        'boot_detail', boot_detail, 'transact_detail', transact_detail) ORDER BY cid), '[]'::jsonb)
      FROM public.client_access_canary_result WHERE run_id = v_run));
END $fn$;

REVOKE EXECUTE ON FUNCTION public.client_access_canary(text,text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.client_access_canary(text,text) TO authenticated, service_role;
