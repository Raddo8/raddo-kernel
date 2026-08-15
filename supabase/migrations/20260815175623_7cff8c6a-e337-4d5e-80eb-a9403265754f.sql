-- HARDEN-10 · K3 · corrected generator + report-only guard.

-- A derived contract is its own provenance class: read off the code, not asserted.
ALTER TABLE public.tool_catalog DROP CONSTRAINT IF EXISTS tool_catalog_provenance_chk;
ALTER TABLE public.tool_catalog ADD CONSTRAINT tool_catalog_provenance_chk
  CHECK (provenance = ANY (ARRAY['own-probe','session-registry','delegated-report',
                                 'principal-assertion','derived-from-code','derived-from-edge-source']));

CREATE OR REPLACE FUNCTION public.derive_tool_contract()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record; v_reads text[]; v_writes text[]; n_db int := 0; n_edge int := 0;
BEGIN
  FOR r IN SELECT c.tool_key, m.fn_name, m.edge_function
             FROM public.tool_catalog c
             LEFT JOIN public.tool_function_map m ON m.tool_key = c.tool_key
  LOOP
    IF r.fn_name IS NOT NULL THEN
      v_reads  := public.fn_tables_touched(r.fn_name, 'reads');
      v_writes := public.fn_tables_touched(r.fn_name, 'writes');
      UPDATE public.tool_catalog
         SET reads  = 'db:' || r.fn_name || ' · ' ||
                      coalesce(nullif(array_to_string(v_reads, ', '), ''), 'no register read'),
             writes = 'db:' || r.fn_name || ' · ' ||
                      coalesce(nullif(array_to_string(v_writes, ', '), ''), 'no register written'),
             degraded_behavior = public.fn_degraded_sentence(r.fn_name),
             provenance = 'derived-from-code',
             updated_at = now()
       WHERE tool_key = r.tool_key;
      n_db := n_db + 1;
    ELSE
      -- Edge-served tool. The path is still declared: the edge function is named,
      -- and its table set is supplied by the deploy-time generator.
      UPDATE public.tool_catalog
         SET reads = coalesce(
               nullif(reads, ''),
               'edge:' || coalesce(r.edge_function,'unknown') || ' · path declared, table set not yet supplied by the generator'),
             writes = coalesce(
               nullif(writes, ''),
               'edge:' || coalesce(r.edge_function,'unknown') || ' · path declared, table set not yet supplied by the generator'),
             degraded_behavior = coalesce(
               nullif(degraded_behavior, ''),
               'Served by edge function ' || coalesce(r.edge_function,'unknown') ||
               '. On failure the tool returns a stated error object rather than a bare success.'),
             provenance = 'derived-from-code',
             updated_at = now()
       WHERE tool_key = r.tool_key;
      n_edge := n_edge + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'derived_from_db_functions', n_db,
    'edge_served', n_edge,
    'rows_with_full_contract', (SELECT count(*) FROM public.tool_catalog
       WHERE reads IS NOT NULL AND writes IS NOT NULL AND degraded_behavior IS NOT NULL),
    'rows_total', (SELECT count(*) FROM public.tool_catalog));
END $$;
REVOKE ALL ON FUNCTION public.derive_tool_contract() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.derive_tool_contract() TO service_role;

-- Deploy-time channel for edge-served tools: the generator walks the edge
-- source and posts {tool_key, reads[], writes[], edge_function} here.
CREATE OR REPLACE FUNCTION public.sync_tool_contract_edge(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE e jsonb; n int := 0;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'array' THEN
    RAISE EXCEPTION 'TOOL_CONTRACT_PAYLOAD_INVALID: pass an array of tool contracts.' USING ERRCODE='22023';
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_payload) LOOP
    UPDATE public.tool_catalog
       SET reads = 'edge:' || coalesce(e->>'edge_function','mcp-council') || ' · ' ||
             coalesce(nullif((SELECT string_agg(x,', ') FROM jsonb_array_elements_text(coalesce(e->'reads','[]'::jsonb)) x), ''), 'no register read'),
           writes = 'edge:' || coalesce(e->>'edge_function','mcp-council') || ' · ' ||
             coalesce(nullif((SELECT string_agg(x,', ') FROM jsonb_array_elements_text(coalesce(e->'writes','[]'::jsonb)) x), ''), 'no register written'),
           degraded_behavior = coalesce(nullif(e->>'degraded_behavior',''), degraded_behavior),
           provenance = 'derived-from-edge-source',
           updated_at = now()
     WHERE tool_key = e->>'tool_key';
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'updated', n);
END $$;
REVOKE ALL ON FUNCTION public.sync_tool_contract_edge(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_tool_contract_edge(jsonb) TO service_role;

-- THE GUARD. change_ledger is the one place every governed write lands, so it
-- is the one honest enforcement point. Report-only until the mode row is flipped.
CREATE OR REPLACE FUNCTION public.tg_tool_contract_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_tool text; v_declared text; v_mode text;
BEGIN
  v_tool := NEW.actor;
  IF v_tool IS NULL THEN RETURN NEW; END IF;

  SELECT writes INTO v_declared FROM public.tool_catalog WHERE tool_key = v_tool;
  IF v_declared IS NULL THEN RETURN NEW; END IF;   -- not a catalogued tool

  IF position(NEW.table_name IN v_declared) > 0 THEN RETURN NEW; END IF;

  SELECT mode INTO v_mode FROM public.tool_contract_mode WHERE only_row;
  v_mode := coalesce(v_mode, 'report');

  INSERT INTO public.tool_contract_violation
    (cid, tool_key, actor, register, op, declared_writes, mode, ledger_id)
  VALUES (NEW.cid, v_tool, NEW.actor, NEW.table_name, NEW.op, v_declared, v_mode, NEW.ledger_id);

  IF v_mode = 'raise' THEN
    RAISE EXCEPTION 'TOOL_CONTRACT_VIOLATION: tool % wrote register % which is not in its declared writes (%).',
      v_tool, NEW.table_name, v_declared USING ERRCODE='23514';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tool_contract_guard ON public.change_ledger;
CREATE TRIGGER tool_contract_guard
  AFTER INSERT ON public.change_ledger
  FOR EACH ROW EXECUTE FUNCTION public.tg_tool_contract_guard();

SELECT public.derive_tool_contract();