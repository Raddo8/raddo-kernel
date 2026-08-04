-- 1. Synthetic marker on the shared thread (additive).
ALTER TABLE public.taylor_messages
  ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS taylor_messages_synthetic_idx
  ON public.taylor_messages (cid, is_synthetic, created_at);

-- 2. Keep the thread append-only for CONTENT, while allowing the synthetic
--    classification flag to be set. Deletes remain forbidden outright.
CREATE OR REPLACE FUNCTION public.taylor_messages_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'taylor_messages is append-only';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.thread_id IS DISTINCT FROM OLD.thread_id
     OR NEW.cid IS DISTINCT FROM OLD.cid
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.surface IS DISTINCT FROM OLD.surface
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'taylor_messages is append-only';
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: the Redwood probe rows (2026-08-04 01:45 UTC, CID-100001) and any
-- row explicitly labelled synthetic. The VOID correction row stays visible.
UPDATE public.taylor_messages
   SET is_synthetic = true
 WHERE id IN (
   'd2eeccc5-5c65-4e47-99b4-e3c404f5131b',
   '29261a45-2f4b-472e-a2a0-9f40b63e690e',
   'c18c88d4-5b45-4e81-84c8-0037e711af7d',
   'afed04b4-4ea3-46b2-9a8e-fbc8c8218f76'
 );

UPDATE public.taylor_messages
   SET is_synthetic = true
 WHERE is_synthetic = false
   AND content ILIKE '%[synthetic%';

-- 3. record_taylor_turn: one distinct reason per state, and prefer the live
--    onboarding record when an older one has been superseded.
CREATE OR REPLACE FUNCTION public.record_taylor_turn(
  p_client_request_id text,
  p_answer text,
  p_question_id uuid DEFAULT NULL::uuid,
  p_fact_section text DEFAULT NULL::text,
  p_fact text DEFAULT NULL::text,
  p_session_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_uid uuid; v_cid text; v_status text; v_onb uuid; v_state text;
        v_fact_id uuid; v_receipt uuid; v_prior public.taylor_turn_receipts%rowtype;
        v_n int; v_bound boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null then return jsonb_build_object('ok',false,'reason','UNAUTHENTICATED'); end if;
  if p_client_request_id is null or length(trim(p_client_request_id)) < 8 then
    return jsonb_build_object('ok',false,'reason','CLIENT_REQUEST_ID_REQUIRED'); end if;

  select * into v_prior from taylor_turn_receipts where client_request_id = p_client_request_id;
  if found then
    if v_prior.auth_user_id <> v_uid then
      return jsonb_build_object('ok',false,'reason','REQUEST_ID_BELONGS_TO_ANOTHER_SUBJECT'); end if;
    return jsonb_build_object('ok',true,'idempotent',true,'receipt_id',v_prior.receipt_id,
                              'cid',v_prior.cid,'onboarding_id',v_prior.onboarding_id);
  end if;

  select r.out_status, r.out_cid into v_status, v_cid from resolve_tenant_context(p_session_id) r;
  if v_status <> 'OK' then return jsonb_build_object('ok',false,'reason',v_status); end if;

  -- Prefer a BOUND record. A superseded or quarantined row must never shadow the
  -- live one for the same subject and CID.
  select ot.id, ot.identity_state into v_onb, v_state
    from onboarding_tenants ot
   where ot.user_id = v_uid and ot.cid = v_cid
   order by (ot.identity_state = 'BOUND') desc, ot.updated_at desc
   limit 1;

  -- SELF-HEAL A: a new client's row arrives with cid null. Bind when provable.
  if v_onb is null then
    select count(*) into v_n from tenant_members tm
     where tm.auth_user_id = v_uid and tm.status = 'ACTIVE';
    if v_n = 1 then
      update onboarding_tenants ot
         set cid = v_cid, identity_state = 'BOUND', bound_at = now(), bound_by = 'record_taylor_turn_autobind'
       where ot.user_id = v_uid and ot.cid is null
         and ot.identity_state = 'PENDING_BINDING'
       returning ot.id into v_onb;
      if v_onb is not null then v_state := 'BOUND'; v_bound := true; end if;
    end if;
  end if;

  -- SELF-HEAL B: the only record for this subject and CID was SUPERSEDED with no
  -- live successor. Membership is provable, so revive that same row rather than
  -- refusing every turn forever. Never touches identity keys.
  if v_onb is not null and v_state = 'SUPERSEDED' then
    select count(*) into v_n from tenant_members tm
     where tm.auth_user_id = v_uid and tm.cid = v_cid and tm.status = 'ACTIVE';
    if v_n = 1 then
      update onboarding_tenants ot
         set identity_state = 'BOUND', bound_at = now(), bound_by = 'record_taylor_turn_supersede_heal'
       where ot.id = v_onb;
      v_state := 'BOUND'; v_bound := true;
    end if;
  end if;

  if v_onb is null then return jsonb_build_object('ok',false,'reason','NO_ONBOARDING_RECORD_FOR_CID','cid',v_cid); end if;

  -- One distinct reason per state. Never one string for two states.
  if v_state is null then
    return jsonb_build_object('ok',false,'reason','ONBOARDING_STATE_MISSING','cid',v_cid);
  elsif v_state = 'PENDING_BINDING' then
    return jsonb_build_object('ok',false,'reason','ONBOARDING_PENDING_BINDING','identity_state',v_state,'cid',v_cid);
  elsif v_state = 'QUARANTINED' then
    return jsonb_build_object('ok',false,'reason','ONBOARDING_QUARANTINED','identity_state',v_state,'cid',v_cid);
  elsif v_state = 'SUPERSEDED' then
    return jsonb_build_object('ok',false,'reason','ONBOARDING_SUPERSEDED','identity_state',v_state,'cid',v_cid);
  elsif v_state <> 'BOUND' then
    return jsonb_build_object('ok',false,'reason','ONBOARDING_STATE_UNRECOGNIZED','identity_state',v_state,'cid',v_cid);
  end if;

  if p_question_id is not null then
    select count(*) into v_n from taylor_questions q where q.id = p_question_id and q.tenant_id = v_onb;
    if v_n <> 1 then return jsonb_build_object('ok',false,'reason','QUESTION_NOT_OWNED_BY_THIS_ONBOARDING'); end if;
    update taylor_questions set answer = p_answer, answered_at = now(), status = 'answered'
     where id = p_question_id and tenant_id = v_onb;
  end if;

  if p_fact is not null and length(trim(p_fact)) > 0 then
    insert into intake_facts (tenant_id, source, section, fact)
      values (v_onb, 'taylor', coalesce(p_fact_section,'notes'), left(p_fact,200))
      returning id into v_fact_id;
  end if;

  insert into taylor_turn_receipts (client_request_id, auth_user_id, cid, onboarding_id, question_id, fact_id, outcome)
    values (p_client_request_id, v_uid, v_cid, v_onb, p_question_id, v_fact_id,
            case when v_bound then 'ok_autobound' else 'ok' end)
    returning receipt_id into v_receipt;

  return jsonb_build_object('ok',true,'receipt_id',v_receipt,'cid',v_cid,
                            'onboarding_id',v_onb,'fact_id',v_fact_id,'autobound',v_bound);
end $function$;