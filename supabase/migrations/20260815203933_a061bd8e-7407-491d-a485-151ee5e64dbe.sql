CREATE OR REPLACE FUNCTION public.register_layer_evidence_pass()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_rows bigint; v_days bigint; v_min timestamptz; v_max timestamptz;
  v_prod int := 0; v_conf int := 0; v_left int := 0;
BEGIN
  FOR r IN
    SELECT rl.register
      FROM public.register_layer rl
     WHERE rl.status = 'AMBIGUOUS' AND rl.source = 'derived'
     ORDER BY rl.register
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=r.register AND c.column_name='created_at') THEN
      v_left := v_left + 1;
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*), count(DISTINCT date_trunc(''day'', created_at)), min(created_at), max(created_at) FROM public.%I',
      r.register) INTO v_rows, v_days, v_min, v_max;

    IF v_rows >= 50 OR v_days >= 7 THEN
      UPDATE public.register_layer
         SET layer = 'PRODUCTION', status = 'ASSIGNED',
             rationale = 'Accumulates by working.',
             evidence = format('behaviour: %s rows written across %s distinct days (%s to %s)',
                               v_rows, v_days, coalesce(v_min::date::text,'none'), coalesce(v_max::date::text,'none'))
       WHERE register = r.register;
      v_prod := v_prod + 1;
    ELSIF v_rows > 0 AND v_rows <= 12 AND v_days <= 2 THEN
      UPDATE public.register_layer
         SET layer = 'CONFIGURATION', status = 'ASSIGNED',
             rationale = 'Set deliberately, changes rarely.',
             evidence = format('behaviour: %s row(s) written on %s distinct day(s) and not added to since (%s)',
                               v_rows, v_days, coalesce(v_max::date::text,'none'))
       WHERE register = r.register;
      v_conf := v_conf + 1;
    ELSE
      UPDATE public.register_layer
         SET evidence = format('no naming evidence; behaviour inconclusive: %s rows across %s distinct days',
                               v_rows, v_days)
       WHERE register = r.register;
      v_left := v_left + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('to_production', v_prod, 'to_configuration', v_conf, 'still_ambiguous', v_left);
END;
$$;

SELECT public.register_layer_evidence_pass();