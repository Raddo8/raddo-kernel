CREATE OR REPLACE FUNCTION public.sweep_unreachable_raise(p_cid text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  f      record;
  n      integer := 0;
  v_cid  text;
BEGIN
  -- The sweep is a fleet observation. It files under the caller's own client
  -- when there is one, and under an explicitly named client otherwise. It
  -- never invents an identity, and it never files with none.
  v_cid := coalesce(p_cid, public.current_cid());
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'SWEEP_NEEDS_CID: name the client this sweep is filed under';
  END IF;

  FOR f IN SELECT * FROM public.sweep_unreachable() LOOP
    PERFORM public.record_signal(
      p_title          := format('%s · %s', f.finding_kind, f.object_name),
      p_detail_md      := f.detail,
      p_pattern        := 'sweep-unreachable',
      p_signal_type    := 'fleet',
      p_status         := 'open',
      p_cid            := v_cid,
      p_provenance     := 'SYSTEM',
      p_source_subject := f.object_name,
      p_source_surface := 'sweep_unreachable',
      p_tool_version   := 'sweep_unreachable.v1'
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.sweep_unreachable_raise(text) TO service_role;
DROP FUNCTION IF EXISTS public.sweep_unreachable_raise();