-- Lane A Commit 3: durable attempt lifecycle with envelope-encrypted recovery

ALTER TABLE public.save_attempt DROP CONSTRAINT IF EXISTS sa_status_chk;
ALTER TABLE public.save_attempt ADD CONSTRAINT sa_status_chk
  CHECK (status = ANY (ARRAY['RECEIVED','REJECTED','PARTIAL','COMPLETED','ABANDONED','FAILED']));

ALTER TABLE public.save_attempt DROP CONSTRAINT IF EXISTS sa_stage_chk;
ALTER TABLE public.save_attempt ADD CONSTRAINT sa_stage_chk
  CHECK (failure_stage IS NULL OR failure_stage = ANY (ARRAY[
    'AUTH','CID_RESOLUTION','MANIFEST_VERSION','SESSION_VALIDATION',
    'LAYER_WRITE','LEG_EXCEPTION','VERIFICATION','RECEIPT']));

-- Opens an attempt and (optionally) its envelope-encrypted recovery blob.
-- The edge function canonicalizes, fingerprints and encrypts. This function
-- never sees plaintext and cannot decrypt: the master key is not in Postgres.
CREATE OR REPLACE FUNCTION public.open_save_attempt_v2(
  p_client_request_id text,
  p_payload_hash text,
  p_requested_layer_counts jsonb,
  p_cid text DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_surface text DEFAULT NULL,
  p_tool_version text DEFAULT NULL,
  p_ritual text DEFAULT NULL,
  p_schema_version text DEFAULT NULL,
  p_hash_algorithm text DEFAULT 'SHA-256',
  p_canonicalization_version text DEFAULT 'v1',
  p_principal_id uuid DEFAULT NULL,
  p_external_identity_id uuid DEFAULT NULL,
  p_ciphertext_b64 text DEFAULT NULL,
  p_iv_b64 text DEFAULT NULL,
  p_wrapped_dek_b64 text DEFAULT NULL,
  p_wrap_iv_b64 text DEFAULT NULL,
  p_aad text DEFAULT NULL,
  p_alg text DEFAULT 'AES-256-GCM',
  p_master_key_version text DEFAULT 'V1',
  p_plaintext_bytes integer DEFAULT NULL,
  p_recovery_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_id uuid;
  v_vault uuid;
  v_prior record;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  if v_role <> 'service_role' then
    raise exception 'SAVE_ATTEMPT_SERVER_ONLY' using errcode='42501';
  end if;
  if p_client_request_id is null or length(p_client_request_id) < 8 then
    raise exception 'SAVE_ATTEMPT_BAD_REQUEST_ID' using errcode='22023';
  end if;
  if p_payload_hash is null or length(p_payload_hash) < 16 then
    raise exception 'SAVE_ATTEMPT_BAD_HASH' using errcode='22023';
  end if;

  select * into v_prior
    from save_attempt
   where client_request_id = p_client_request_id
     and cid is not distinct from p_cid
     and payload_hash = p_payload_hash
   order by received_at desc limit 1;

  if v_prior.save_attempt_id is not null then
    return jsonb_build_object('ok', true, 'idempotent', true,
      'save_attempt_id', v_prior.save_attempt_id,
      'payload_hash', v_prior.payload_hash,
      'prior_status', v_prior.status,
      'prior_failure_stage', v_prior.failure_stage);
  end if;

  insert into save_attempt (
    client_request_id, principal_id, external_identity_id, cid, session_id,
    surface, tool_version, payload_hash, requested_layer_counts, recovery_payload,
    status, ritual, schema_version, payload_hash_algorithm,
    payload_hash_key_version, canonicalization_version, recovery_state,
    recovery_expires_at
  ) values (
    p_client_request_id, p_principal_id, p_external_identity_id, p_cid, p_session_id,
    p_surface, p_tool_version, p_payload_hash, coalesce(p_requested_layer_counts,'{}'::jsonb), null,
    'RECEIVED', p_ritual, p_schema_version, p_hash_algorithm,
    p_master_key_version, p_canonicalization_version,
    case when p_ciphertext_b64 is null then 'NONE' else 'ENCRYPTED' end,
    p_recovery_expires_at
  ) returning save_attempt_id into v_id;

  if p_ciphertext_b64 is not null then
    insert into save_recovery_vault (
      save_attempt_id, ciphertext, iv, wrapped_dek, wrap_iv, aad, alg,
      master_key_version, plaintext_bytes, expires_at
    ) values (
      v_id, decode(p_ciphertext_b64,'base64'), decode(p_iv_b64,'base64'),
      decode(p_wrapped_dek_b64,'base64'), decode(p_wrap_iv_b64,'base64'),
      coalesce(p_aad, v_id::text), coalesce(p_alg,'AES-256-GCM'),
      coalesce(p_master_key_version,'V1'), p_plaintext_bytes,
      coalesce(p_recovery_expires_at, now() + interval '72 hours')
    ) returning vault_id into v_vault;
  end if;

  return jsonb_build_object('ok', true, 'idempotent', false,
    'save_attempt_id', v_id, 'vault_id', v_vault, 'payload_hash', p_payload_hash);
end $function$;

-- Stamps the terminal state of an attempt. Server-only.
CREATE OR REPLACE FUNCTION public.stamp_save_attempt(
  p_save_attempt_id uuid,
  p_status text,
  p_failure_stage text DEFAULT NULL,
  p_save_id uuid DEFAULT NULL,
  p_cid text DEFAULT NULL,
  p_recovery_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_role text; v_row save_attempt;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  if v_role <> 'service_role' then
    raise exception 'SAVE_ATTEMPT_SERVER_ONLY' using errcode='42501';
  end if;

  update save_attempt
     set status = p_status,
         failure_stage = coalesce(p_failure_stage, failure_stage),
         save_id = coalesce(p_save_id, save_id),
         cid = coalesce(cid, p_cid),
         completed_at = case when p_status = 'COMPLETED' then now() else completed_at end,
         recovery_expires_at = coalesce(p_recovery_expires_at, recovery_expires_at)
   where save_attempt_id = p_save_attempt_id
   returning * into v_row;

  if v_row.save_attempt_id is null then
    return jsonb_build_object('ok', false, 'reason', 'attempt_not_found');
  end if;

  if p_recovery_expires_at is not null then
    update save_recovery_vault
       set expires_at = p_recovery_expires_at
     where save_attempt_id = p_save_attempt_id and erased_at is null;
  end if;

  return jsonb_build_object('ok', true, 'save_attempt_id', v_row.save_attempt_id,
    'status', v_row.status, 'failure_stage', v_row.failure_stage,
    'save_id', v_row.save_id, 'completed_at', v_row.completed_at,
    'recovery_expires_at', v_row.recovery_expires_at);
end $function$;

REVOKE ALL ON FUNCTION public.open_save_attempt_v2(text,text,jsonb,text,text,text,text,text,text,text,text,uuid,uuid,text,text,text,text,text,text,text,integer,timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_save_attempt(uuid,text,text,uuid,text,timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_save_attempt_v2(text,text,jsonb,text,text,text,text,text,text,text,text,uuid,uuid,text,text,text,text,text,text,text,integer,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.stamp_save_attempt(uuid,text,text,uuid,text,timestamptz) TO service_role;