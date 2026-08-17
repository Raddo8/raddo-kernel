-- HARDEN-15 R4 · the contract compares published PARAMETERS against the
-- database function signature. Report-only, per established discipline.
CREATE TABLE IF NOT EXISTS public.tool_param_mismatch (
  id bigserial primary key,
  checked_at timestamptz not null default now(),
  tool text not null,
  fn text,
  published_only text[] not null default '{}',
  function_only text[] not null default '{}',
  verdict text not null
);
GRANT SELECT ON public.tool_param_mismatch TO authenticated;
GRANT ALL ON public.tool_param_mismatch TO service_role;
ALTER TABLE public.tool_param_mismatch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tool_param_mismatch_operator_read ON public.tool_param_mismatch;
CREATE POLICY tool_param_mismatch_operator_read ON public.tool_param_mismatch
  FOR SELECT TO authenticated USING (public.is_fleet_operator());

CREATE OR REPLACE FUNCTION public.check_tool_param_contract(p_tools jsonb)
RETURNS TABLE(tool text, fn text, published_only text[], function_only text[], verdict text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_args text[]; v_pub text[]; v_po text[]; v_fo text[]; v_fn text;
BEGIN
  DELETE FROM public.tool_param_mismatch WHERE checked_at < now() - interval '90 days';
  FOR r IN SELECT key AS tname, value AS spec FROM jsonb_each(p_tools) LOOP
    v_fn := coalesce(r.spec->>'fn', r.tname);
    SELECT array_agg(a ORDER BY a) INTO v_pub
      FROM jsonb_array_elements_text(coalesce(r.spec->'params','[]'::jsonb)) a;
    v_pub := coalesce(v_pub, '{}');

    SELECT array_agg(regexp_replace(nm, '^p_', '') ORDER BY nm) INTO v_args
    FROM (
      SELECT unnest(p.proargnames) AS nm
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_fn
      LIMIT 200
    ) s WHERE nm IS NOT NULL;

    IF v_args IS NULL THEN
      tool := r.tname; fn := v_fn; published_only := v_pub; function_only := '{}';
      verdict := 'NO_BACKING_FUNCTION';
    ELSE
      SELECT array_agg(x ORDER BY x) INTO v_po FROM unnest(v_pub) x WHERE NOT (x = ANY(v_args));
      SELECT array_agg(x ORDER BY x) INTO v_fo FROM unnest(v_args) x WHERE NOT (x = ANY(v_pub));
      tool := r.tname; fn := v_fn;
      published_only := coalesce(v_po,'{}'); function_only := coalesce(v_fo,'{}');
      verdict := CASE WHEN coalesce(array_length(v_po,1),0) > 0 THEN 'PUBLISHED_PARAM_NOT_ACCEPTED'
                      WHEN coalesce(array_length(v_fo,1),0) > 0 THEN 'FUNCTION_PARAM_NOT_PUBLISHED'
                      ELSE 'OK' END;
    END IF;

    INSERT INTO public.tool_param_mismatch(tool, fn, published_only, function_only, verdict)
    VALUES (tool, fn, published_only, function_only, verdict);
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.check_tool_param_contract(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_tool_param_contract(jsonb) TO service_role;