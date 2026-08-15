CREATE OR REPLACE FUNCTION public.register_layer_evidence_pass()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_col text;
  v_rows bigint; v_days bigint; v_min timestamptz; v_max timestamptz;
  v_prod int := 0; v_conf int := 0; v_left int := 0;
BEGIN
  FOR r IN
    SELECT rl.register FROM public.register_layer rl
     WHERE rl.status = 'AMBIGUOUS' AND rl.source = 'derived' ORDER BY rl.register
  LOOP
    SELECT c.column_name INTO v_col
      FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.table_name=r.register
       AND c.data_type IN ('timestamp with time zone','timestamp without time zone')
     ORDER BY CASE c.column_name
                WHEN 'created_at' THEN 0 WHEN 'inserted_at' THEN 1 WHEN 'occurred_at' THEN 2
                WHEN 'logged_at' THEN 3 WHEN 'observed_at' THEN 4 WHEN 'started_at' THEN 5
                WHEN 'recorded_at' THEN 6 WHEN 'at' THEN 7 WHEN 'ts' THEN 8 ELSE 9 END,
              c.ordinal_position
     LIMIT 1;

    IF v_col IS NULL THEN
      UPDATE public.register_layer
         SET evidence = 'no naming evidence and no time column: this register does not record when a row was written, so accumulation cannot be observed'
       WHERE register = r.register;
      v_left := v_left + 1;
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*), count(DISTINCT date_trunc(''day'', %I)), min(%I), max(%I) FROM public.%I',
                   v_col, v_col, v_col, r.register)
      INTO v_rows, v_days, v_min, v_max;

    IF v_rows >= 50 OR v_days >= 7 THEN
      UPDATE public.register_layer
         SET layer='PRODUCTION', status='ASSIGNED', rationale='Accumulates by working.',
             evidence=format('behaviour: %s rows across %s distinct days on %I (%s to %s)',
                             v_rows, v_days, v_col, coalesce(v_min::date::text,'none'), coalesce(v_max::date::text,'none'))
       WHERE register = r.register;
      v_prod := v_prod + 1;
    ELSIF v_rows > 0 AND v_rows <= 12 AND v_days <= 2 THEN
      UPDATE public.register_layer
         SET layer='CONFIGURATION', status='ASSIGNED', rationale='Set deliberately, changes rarely.',
             evidence=format('behaviour: %s row(s) written on %s distinct day(s) on %I and not added to since (%s)',
                             v_rows, v_days, v_col, coalesce(v_max::date::text,'none'))
       WHERE register = r.register;
      v_conf := v_conf + 1;
    ELSE
      UPDATE public.register_layer
         SET evidence=format('no naming evidence; behaviour inconclusive on %I: %s rows across %s distinct days',
                             v_col, v_rows, v_days)
       WHERE register = r.register;
      v_left := v_left + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('to_production', v_prod, 'to_configuration', v_conf, 'still_ambiguous', v_left);
END;
$$;

SELECT public.register_layer_evidence_pass();