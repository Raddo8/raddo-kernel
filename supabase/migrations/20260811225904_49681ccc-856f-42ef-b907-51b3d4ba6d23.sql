CREATE OR REPLACE FUNCTION public.code_claim(
  p_claim uuid, p_code uuid, p_confidence numeric DEFAULT 1.0, p_cid text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cid text; v_by text;
BEGIN
  IF p_claim IS NULL OR p_code IS NULL THEN
    RAISE EXCEPTION 'CODE_CLAIM_ARGS_REQUIRED: name both the claim and the code.' USING ERRCODE='22023';
  END IF;
  SELECT cid INTO v_cid FROM public.world_claims WHERE id = p_claim;
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'CLAIM_NOT_FOUND: no claim %.', p_claim USING ERRCODE='P0002';
  END IF;
  IF p_cid IS NOT NULL AND v_cid IS DISTINCT FROM p_cid THEN
    RAISE EXCEPTION 'CODE_CLAIM_WRONG_TENANT: that claim belongs to another tenant.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.codebook WHERE code_id = p_code) THEN
    RAISE EXCEPTION 'CODE_NOT_FOUND: no codebook entry %.', p_code USING ERRCODE='P0002';
  END IF;

  v_by := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'email', session_user);

  INSERT INTO public.claim_code (cid, claim_id, code_id, confidence, coded_by, coded_at)
  VALUES (v_cid, p_claim, p_code, coalesce(p_confidence, 1.0), v_by, now());

  RETURN jsonb_build_object('ok', true, 'claim_id', p_claim, 'code_id', p_code,
                            'cid', v_cid, 'coded_by', v_by);
END $$;