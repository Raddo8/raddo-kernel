CREATE OR REPLACE FUNCTION public.sweep_unreachable_raise(p_cid text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  f     record;
  n     integer := 0;
  v_cid text;
  v_prev text;
BEGIN
  v_cid := coalesce(p_cid, public.current_cid());
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'SWEEP_NEEDS_CID: name the client this sweep is filed under';
  END IF;

  -- The sweep is a system writer, not a client. It says so for the duration of
  -- its own transaction and restores whatever it found afterwards, so the
  -- register's provenance guard judges it on what it is.
  v_prev := coalesce(current_setting('request.jwt.claims', true), '');
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  FOR f IN SELECT * FROM public.sweep_unreachable() LOOP
    PERFORM public.record_signal(
      p_title          := format('%s · %s', f.finding_kind, f.object_name),
      p_detail_md      := f.detail,
      p_pattern        := 'sweep-unreachable',
      p_signal_type    := 'fleet',
      p_status         := 'open',
      p_client_ref     := 'sweep:' || f.finding_kind || ':' || f.object_name,
      p_cid            := v_cid,
      p_provenance     := 'OPERATOR',
      p_source_subject := f.object_name,
      p_source_surface := 'sweep_unreachable',
      p_tool_version   := 'sweep_unreachable.v1'
    );
    n := n + 1;
  END LOOP;

  PERFORM set_config('request.jwt.claims', v_prev, true);
  RETURN n;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.sweep_unreachable_raise(text) TO service_role;