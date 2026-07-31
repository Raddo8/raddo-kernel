CREATE OR REPLACE FUNCTION public.observe_external_identity(
  p_issuer text,
  p_provider_subject text,
  p_tenant_claim text DEFAULT NULL::text,
  p_surface text DEFAULT NULL::text,
  p_token_version text DEFAULT NULL::text,
  p_verified_email text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_obs_id uuid;
  v_status text;
  v_pid uuid;
  v_new boolean := false;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  if v_role <> 'service_role' then
    raise exception 'OBSERVE_SERVER_ONLY' using errcode='42501';
  end if;

  if p_issuer is null or p_provider_subject is null then
    return jsonb_build_object('observed', false, 'reason', 'issuer and subject both required');
  end if;

  insert into identity_observations (
    issuer, provider_subject, token_version, surface, tenant_claim, verified_email,
    first_seen_at, last_seen_at, call_count, evidence, review_status
  ) values (
    p_issuer, p_provider_subject, p_token_version, p_surface, p_tenant_claim, p_verified_email,
    now(), now(), 1,
    'AUTO-OBSERVED on first sight. tenant_claim='||coalesce(p_tenant_claim,'-')||' surface='||coalesce(p_surface,'-')
      ||'. Recorded so no tenant can transact without an identity trace. OBSERVED grants NOTHING - it is not an authority record and resolves to no CID until a human authorizes a binding.',
    'OBSERVED'
  )
  on conflict (issuer, provider_subject) do nothing
  returning observation_id into v_obs_id;

  v_new := v_obs_id is not null;

  if not v_new then
    update identity_observations
       set last_seen_at = now(),
           call_count = coalesce(call_count, 0) + 1,
           token_version = coalesce(p_token_version, token_version),
           verified_email = coalesce(verified_email, p_verified_email),
           surface = coalesce(surface, p_surface),
           tenant_claim = coalesce(tenant_claim, p_tenant_claim)
     where issuer = p_issuer and provider_subject = p_provider_subject
     returning observation_id into v_obs_id;
  end if;

  select review_status, linked_principal_id into v_status, v_pid
    from identity_observations where observation_id = v_obs_id;

  return jsonb_build_object(
    'observed', true,
    'newly_seen', v_new,
    'observation_id', v_obs_id,
    'review_status', v_status,
    'bound', v_status = 'BOUND',
    'principal_id', v_pid
  );
end
$function$;