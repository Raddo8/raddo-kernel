
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

  -- Logged at the moment of the decision. A receipt row is lost if the calling
  -- transaction is abandoned; this line is not.
  RAISE LOG 'AUTHORITY % · action=% target=% caller=% ledger_role=% reason=%',
    p_decision, p_action, coalesce(p_target_cid,'FLEET'), v_label,
    coalesce(a->>'fleet_role','none'), coalesce(p_reason,'');

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
