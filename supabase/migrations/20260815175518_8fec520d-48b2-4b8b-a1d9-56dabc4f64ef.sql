-- HARDEN-10 · K3 (a)(b) · tool contract: derive, log, report-only.

CREATE TABLE IF NOT EXISTS public.tool_function_map (
  tool_key      text PRIMARY KEY REFERENCES public.tool_catalog(tool_key) ON DELETE CASCADE,
  fn_name       text,
  edge_function text,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tool_function_map TO authenticated;
GRANT ALL ON public.tool_function_map TO service_role;
ALTER TABLE public.tool_function_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tool_function_map readable by signed-in operators"
  ON public.tool_function_map FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.tool_contract_violation (
  id              bigserial PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),
  cid             text,
  tool_key        text,
  actor           text,
  register        text NOT NULL,
  op              text,
  declared_writes text,
  mode            text NOT NULL,
  ledger_id       bigint
);
GRANT SELECT ON public.tool_contract_violation TO authenticated;
GRANT ALL ON public.tool_contract_violation TO service_role;
ALTER TABLE public.tool_contract_violation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "violations readable by signed-in operators"
  ON public.tool_contract_violation FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS tool_contract_violation_tool_idx
  ON public.tool_contract_violation (tool_key, at DESC);

-- Enforcement mode lives in one row so the switch is a data change, never a deploy.
CREATE TABLE IF NOT EXISTS public.tool_contract_mode (
  only_row  boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  mode      text NOT NULL DEFAULT 'report' CHECK (mode IN ('report','raise')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason    text
);
GRANT SELECT ON public.tool_contract_mode TO authenticated;
GRANT ALL ON public.tool_contract_mode TO service_role;
ALTER TABLE public.tool_contract_mode ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mode readable by signed-in operators"
  ON public.tool_contract_mode FOR SELECT TO authenticated USING (true);
INSERT INTO public.tool_contract_mode (only_row, mode, reason)
VALUES (true, 'report', 'HARDEN-10 K3b: report-only for one cycle. HARDEN-01 M1 went straight to raise and cost forty minutes.')
ON CONFLICT (only_row) DO NOTHING;

-- Seed the map from the name rules that already hold, plus the two known aliases.
INSERT INTO public.tool_function_map (tool_key, fn_name)
SELECT c.tool_key,
       (SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN (c.tool_key, 'cob_' || c.tool_key, c.tool_key || '_v1')
         ORDER BY (p.proname = c.tool_key) DESC LIMIT 1)
FROM public.tool_catalog c
ON CONFLICT (tool_key) DO NOTHING;

UPDATE public.tool_function_map SET edge_function = 'mcp-council'
 WHERE fn_name IS NULL;

-- Tables named in a function body. Reads and writes are read off the source,
-- never authored, so the contract cannot drift from the code.
CREATE OR REPLACE FUNCTION public.fn_tables_touched(p_fn text, p_mode text)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_src text; v_out text[] := '{}'; v_pat text; m text[];
BEGIN
  SELECT string_agg(pg_get_functiondef(p.oid), E'\n')
    INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = p_fn;
  IF v_src IS NULL THEN RETURN '{}'; END IF;

  IF p_mode = 'writes' THEN
    FOR m IN SELECT regexp_matches(v_src,
        '(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?([a-z_][a-z0-9_]*)', 'gi')
    LOOP v_out := v_out || m[1]; END LOOP;
  ELSE
    FOR m IN SELECT regexp_matches(v_src,
        '(?:from|join)\s+(?:public\.)?([a-z_][a-z0-9_]*)', 'gi')
    LOOP v_out := v_out || m[1]; END LOOP;
  END IF;

  SELECT coalesce(array_agg(DISTINCT t ORDER BY t), '{}')
    INTO v_out
    FROM unnest(v_out) AS t
   WHERE EXISTS (SELECT 1 FROM information_schema.tables it
                  WHERE it.table_schema = 'public' AND it.table_name = t
                    AND it.table_type = 'BASE TABLE');
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.fn_tables_touched(text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tables_touched(text,text) TO service_role;

-- Named failure paths become the degraded_behavior sentence.
CREATE OR REPLACE FUNCTION public.fn_degraded_sentence(p_fn text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_src text; v_codes text[] := '{}'; m text[];
BEGIN
  SELECT string_agg(pg_get_functiondef(p.oid), E'\n') INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = p_fn;
  IF v_src IS NULL THEN
    RETURN 'No database function is mapped to this tool. The path is declared through its edge function instead.';
  END IF;
  FOR m IN SELECT regexp_matches(v_src, 'raise\s+exception\s+''([A-Z][A-Z0-9_]+)', 'g')
  LOOP v_codes := v_codes || m[1]; END LOOP;
  SELECT coalesce(array_agg(DISTINCT c ORDER BY c), '{}') INTO v_codes FROM unnest(v_codes) c;
  IF array_length(v_codes,1) IS NULL THEN
    RETURN 'Fails closed on a Postgres error. No named refusal is declared in the body, so a caller sees the raw error rather than a stated reason.';
  END IF;
  RETURN 'Fails closed. Named refusals: ' || array_to_string(v_codes, ', ') || '. Each raises rather than returning a bare success.';
END $$;
REVOKE ALL ON FUNCTION public.fn_degraded_sentence(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_degraded_sentence(text) TO service_role;

-- The generator. Runs on deploy; overwrites derived rows every time.
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
         SET reads  = 'db:' || r.fn_name || ' \u00b7 ' ||
                      coalesce(nullif(array_to_string(v_reads, ', '), ''), 'no register read'),
             writes = 'db:' || r.fn_name || ' \u00b7 ' ||
                      coalesce(nullif(array_to_string(v_writes, ', '), ''), 'no register written'),
             degraded_behavior = public.fn_degraded_sentence(r.fn_name),
             provenance = 'derived',
             updated_at = now()
       WHERE tool_key = r.tool_key;
      n_db := n_db + 1;
    ELSIF coalesce(nullif(btrim(coalesce(reads_null_check(), '')), ''), '') IS NOT NULL THEN
      NULL;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'derived_from_db_functions', n_db, 'edge_only_remaining', n_edge);
END $$;