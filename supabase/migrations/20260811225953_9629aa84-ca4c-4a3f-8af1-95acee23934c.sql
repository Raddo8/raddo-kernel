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

  INSERT INTO public.tool_catalog (tool_key, family, surface, purpose, status, provenance, verified_at, verified_how, notes, updated_at)
  SELECT t, 'connector', 'mcp-council',
         'Published by the connector manifest.',
         'live', 'session-registry', now(),
         'listed in the manifest the connector published',
         'generated from manifest ' || v_version, now()
    FROM unnest(v_tools) t
   WHERE NOT EXISTS (SELECT 1 FROM public.tool_catalog c WHERE c.tool_key = t);
  GET DIAGNOSTICS v_added = ROW_COUNT;

  UPDATE public.tool_catalog
     SET status = 'live', verified_at = now(), provenance = 'session-registry',
         notes = 'generated from manifest ' || v_version, updated_at = now()
   WHERE tool_key = ANY(v_tools) AND status IS DISTINCT FROM 'live';
  GET DIAGNOSTICS v_kept = ROW_COUNT;

  UPDATE public.tool_catalog
     SET status = 'deprecated', updated_at = now(),
         notes = coalesce(notes || ' · ', '') || 'absent from manifest ' || v_version
   WHERE NOT (tool_key = ANY(v_tools)) AND coalesce(status,'') <> 'deprecated';
  GET DIAGNOSTICS v_retired = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'manifest_version', v_version,
    'manifest_tools', array_length(v_tools, 1), 'added', v_added,
    'revived', v_kept, 'retired', v_retired,
    'catalog_live', (SELECT count(*) FROM public.tool_catalog WHERE status = 'live'));
END $$;