-- H3.1 · directive_log gets its governed writer.
CREATE OR REPLACE FUNCTION public.log_directive_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.directive_log (cid, directive_id, phase, signature_ok, scope_checked, snapshot, receipt_md)
  VALUES (
    NEW.cid, NEW.id, coalesce(NEW.status,'unknown'),
    true, (NEW.scope IS NOT NULL),
    to_jsonb(NEW),
    CASE WHEN TG_OP='INSERT'
      THEN format('Directive raised in phase %s.', coalesce(NEW.status,'unknown'))
      ELSE format('Directive moved from %s to %s.', coalesce(OLD.status,'unknown'), coalesce(NEW.status,'unknown')) END
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS directives_phase_log ON public.directives;
CREATE TRIGGER directives_phase_log
AFTER INSERT OR UPDATE OF status ON public.directives
FOR EACH ROW EXECUTE FUNCTION public.log_directive_phase();

-- H3.3 · claim_code gets its writer.
CREATE OR REPLACE FUNCTION public.code_claim(
  p_claim uuid, p_code uuid, p_confidence numeric DEFAULT 1.0, p_cid text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cid text; v_by text;
BEGIN
  IF p_claim IS NULL OR p_code IS NULL THEN
    RAISE EXCEPTION 'CODE_CLAIM_ARGS_REQUIRED: name both the claim and the code.' USING ERRCODE='22023';
  END IF;
  SELECT cid INTO v_cid FROM public.world_claims WHERE claim_id = p_claim;
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
GRANT EXECUTE ON FUNCTION public.code_claim(uuid, uuid, numeric, text) TO service_role;

-- H3.4 · scores is retired: empty, no writer anywhere, superseded by the
-- work register's urgency scoring.
DROP TABLE IF EXISTS public.scores;

-- H4 · the tool list is generated from the manifest the connector publishes.
CREATE OR REPLACE FUNCTION public.sync_tool_catalog(p_version text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_version text; v_tools text[]; v_added int := 0; v_retired int := 0; v_kept int := 0;
BEGIN
  SELECT version, tools INTO v_version, v_tools
    FROM public.tool_manifest_registry
   WHERE p_version IS NULL OR version = p_version
   ORDER BY first_seen_at DESC LIMIT 1;

  IF v_version IS NULL THEN
    RAISE EXCEPTION 'TOOL_MANIFEST_ABSENT: no published manifest to generate from.' USING ERRCODE='P0002';
  END IF;

  INSERT INTO public.tool_catalog (tool_key, family, surface, purpose, status, provenance, verified_at, verified_how, updated_at)
  SELECT t, 'connector', 'mcp-council',
         'Published by the connector manifest.',
         'live', 'generated from tool_manifest_registry ' || v_version, now(),
         'listed in the manifest the connector published', now()
    FROM unnest(v_tools) t
   WHERE NOT EXISTS (SELECT 1 FROM public.tool_catalog c WHERE c.tool_key = t);
  GET DIAGNOSTICS v_added = ROW_COUNT;

  UPDATE public.tool_catalog
     SET status = 'live', verified_at = now(),
         provenance = 'generated from tool_manifest_registry ' || v_version, updated_at = now()
   WHERE tool_key = ANY(v_tools) AND status IS DISTINCT FROM 'live';
  GET DIAGNOSTICS v_kept = ROW_COUNT;

  UPDATE public.tool_catalog
     SET status = 'retired', updated_at = now(),
         notes = coalesce(notes || ' · ', '') || 'absent from manifest ' || v_version
   WHERE NOT (tool_key = ANY(v_tools)) AND coalesce(status,'') <> 'retired';
  GET DIAGNOSTICS v_retired = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'manifest_version', v_version,
    'manifest_tools', array_length(v_tools, 1), 'added', v_added,
    'revived', v_kept, 'retired', v_retired,
    'catalog_live', (SELECT count(*) FROM public.tool_catalog WHERE status = 'live'));
END $$;
GRANT EXECUTE ON FUNCTION public.sync_tool_catalog(text) TO service_role;

-- H5 · a sweeper finding can name what it is and who reaches it.
ALTER TABLE public.improvement_signals
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS caller text;