CREATE OR REPLACE FUNCTION public.cob_decision_write(
  p_cid text,
  p_title text,
  p_decision_md text,
  p_rationale_md text DEFAULT NULL,
  p_reversibility text DEFAULT NULL,
  p_decided_by text DEFAULT NULL,
  p_minute_id uuid DEFAULT NULL,
  p_supersedes uuid DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_verification_state text DEFAULT NULL,
  p_test_run_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_cid text; v_id uuid; v_curn text;
begin
  v_cid := public.cob_guard(p_cid);
  if coalesce(btrim(p_title),'')='' or coalesce(btrim(p_decision_md),'')='' then
    raise exception 'COB_DECISION_NEEDS_TITLE_AND_BODY: a decision needs what was decided, in words' using errcode='22023';
  end if;
  if p_supersedes is not null and not exists (select 1 from decisions d where d.id=p_supersedes and d.cid=v_cid) then
    raise exception 'COB_DECISION_SUPERSEDES_NOT_FOUND: that earlier decision is not this client''s' using errcode='23503';
  end if;

  v_curn := public.next_curn(v_cid, 'D');

  insert into decisions (cid, curn, title, decision_md, rationale_md, reversibility, decided_by,
                         minute_id, decided_at, provenance, source_surface, source_session_id,
                         verification_state, test_run_id, authoritative)
  values (v_cid, v_curn, p_title, p_decision_md, p_rationale_md, p_reversibility,
          coalesce(p_decided_by,'principal'), p_minute_id, now(), 'CLIENT', 'cob:decision_write',
          p_session_id, coalesce(nullif(btrim(p_verification_state),''), 'recorded'),
          nullif(btrim(p_test_run_id),''), true)
  returning id into v_id;

  if p_supersedes is not null then
    update decisions set superseded_by = v_id where id = p_supersedes and cid = v_cid;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'curn', v_curn, 'cid', v_cid);
end $function$;