-- Lane A Commit 5 · arm the idempotency conflict guard.
-- Until now record_save_receipt returned the ORIGINAL receipt whenever the
-- client_request_id matched, regardless of content. With a fingerprint finally
-- supplied by the edge, a reused id carrying different content is a conflict
-- and must be refused rather than silently discarding the new content.

ALTER TABLE public.save_attempt DROP CONSTRAINT IF EXISTS sa_status_chk;
ALTER TABLE public.save_attempt ADD CONSTRAINT sa_status_chk CHECK (
  status = ANY (ARRAY['RECEIVED','REJECTED','PARTIAL','COMPLETED','ABANDONED','FAILED','IDEMPOTENCY_CONFLICT'])
);

CREATE OR REPLACE FUNCTION public.record_save_receipt(p_client_request_id text, p_session_id text, p_payload_hash text, p_layers jsonb, p_cid text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cid text; v_save uuid; v_missing text[]; v_jwt_role text;
  v_canon text[] := array['checkpoint','open_loops','memory','decisions','signals','rules_captured'];
  v_req int; v_ok int; v_bad int; v_status text; v_existing uuid; v_mirror_failed boolean;
  v_existing_hash text;
begin
  v_jwt_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');

  if p_cid is not null then
    if v_jwt_role <> 'service_role' then
      raise exception 'SAVE_RECEIPT_CID_NOT_ACCEPTED_FROM_CLIENT: p_cid is accepted only from a service_role caller. A client-supplied CID is never authority. Caller role was "%".', coalesce(nullif(v_jwt_role,''),'(none)') using errcode='42501';
    end if;
    if not exists (select 1 from tenants t where t.cid = p_cid) then
      raise exception 'SAVE_RECEIPT_UNKNOWN_CID: %', p_cid using errcode='23503';
    end if;
    v_cid := p_cid;
  else
    v_cid := public.current_cid();
  end if;

  if v_cid is null then raise exception 'SAVE_RECEIPT_UNAUTHENTICATED: no resolvable CID. A service-role caller must pass p_cid; a user-scoped caller must have exactly one ACTIVE membership.' using errcode='28000'; end if;
  if p_client_request_id is null or length(p_client_request_id) < 8 then
    raise exception 'SAVE_RECEIPT_BAD_REQUEST_ID: client_request_id must be at least 8 chars' using errcode='22023'; end if;

  select save_id, payload_hash into v_existing, v_existing_hash
    from save_receipts where cid = v_cid and client_request_id = p_client_request_id;

  if v_existing is not null then
    -- Conflict is only decidable when BOTH sides carry a fingerprint. Legacy
    -- receipts written before this commit have a null hash and keep the old
    -- replay behaviour; a caller running with the rollback switch on sends a
    -- null hash and likewise keeps it.
    if p_payload_hash is not null and v_existing_hash is not null
       and v_existing_hash is distinct from p_payload_hash then
      raise exception 'SAVE_RECEIPT_IDEMPOTENCY_CONFLICT: client_request_id % was already used for different content. Resubmit with a new client_request_id.', p_client_request_id
        using errcode='23505';
    end if;
    return jsonb_build_object('ok',true,'idempotent',true,'save_id',v_existing,
      'overall_status',(select overall_status from save_receipts where save_id=v_existing));
  end if;

  select array_agg(x) into v_missing from unnest(array['checkpoint','open_loops','memory','decisions','signals','rules_captured','notion_mirror']) x
   where not exists (select 1 from jsonb_array_elements(p_layers) e where e->>'layer' = x);
  if v_missing is not null then
    raise exception 'SAVE_RECEIPT_INCOMPLETE: layers absent from the receipt: %.', array_to_string(v_missing,', ') using errcode='22023'; end if;

  insert into save_receipts (client_request_id, cid, session_id, payload_hash, overall_status)
  values (p_client_request_id, v_cid, p_session_id, p_payload_hash, 'FAILED') returning save_id into v_save;

  insert into save_receipt_layers (save_id, layer, requested, attempted, saved, updated, failed,
     record_ids, error_code, error_message, retryable, verified, verified_at, layer_state)
  select v_save, e->>'layer', coalesce((e->>'requested')::int,0), coalesce((e->>'attempted')::int,0),
     coalesce((e->>'saved')::int,0), coalesce((e->>'updated')::int,0), coalesce((e->>'failed')::int,0),
     coalesce(e->'record_ids','[]'::jsonb), e->>'error_code', e->>'error_message',
     (e->>'retryable')::boolean, coalesce((e->>'verified')::boolean,false),
     case when coalesce((e->>'verified')::boolean,false) then now() else null end,
     coalesce(e->>'layer_state', case
       when coalesce((e->>'failed')::int,0) > 0 then 'FAILED'
       when coalesce((e->>'requested')::int,0) = 0 then 'EMPTY_EXPECTED'
       when coalesce((e->>'saved')::int,0)+coalesce((e->>'updated')::int,0) = 0 then 'EMPTY_UNEXPECTED'
       else 'CURRENT' end)
  from jsonb_array_elements(p_layers) e;

  select coalesce(sum(requested),0), coalesce(sum(saved+updated),0), coalesce(sum(failed),0)
    into v_req, v_ok, v_bad from save_receipt_layers where save_id=v_save and layer = any(v_canon);
  select exists(select 1 from save_receipt_layers where save_id=v_save and layer='notion_mirror' and (failed>0 or layer_state in ('FAILED','UNAVAILABLE'))) into v_mirror_failed;

  if v_req = 0 then v_status := 'NOOP';
  elsif v_bad = 0 and v_ok >= v_req and not exists (select 1 from save_receipt_layers where save_id=v_save and layer=any(v_canon) and requested>0 and not verified)
       then v_status := case when v_mirror_failed then 'PARTIAL' else 'SUCCESS' end;
  elsif v_ok > 0 then v_status := 'PARTIAL';
  else v_status := 'FAILED';
  end if;

  update save_receipts set overall_status = v_status, completed_at = now() where save_id = v_save;
  return jsonb_build_object('ok',true,'idempotent',false,'save_id',v_save,'cid',v_cid,'overall_status',v_status,
    'canonical_requested',v_req,'canonical_persisted',v_ok,'canonical_failed',v_bad,'notion_mirror_degraded',v_mirror_failed);
end $function$;