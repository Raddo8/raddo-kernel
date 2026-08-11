
CREATE OR REPLACE FUNCTION public.cob_rule_write(
  p_cid text,
  p_action text DEFAULT 'state'::text,
  p_id uuid DEFAULT NULL::uuid,
  p_text text DEFAULT NULL::text,
  p_title text DEFAULT NULL::text,
  p_scope text DEFAULT 'LOCKED'::text,
  p_rank integer DEFAULT NULL::integer,
  p_reason text DEFAULT NULL::text,
  p_tenancy text DEFAULT 'TENANT'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_cid text; v_key text; v_id uuid; v_before jsonb; v_status text; v_col jsonb; v_dup uuid;
  v_tenancy text;
begin
  v_cid := public.cob_guard(p_cid);
  v_key := public.cob_tenant_key_or_cid(v_cid);

  -- H2.2 · absent or unrecognised resolves to TENANT. A fleet mandate is never
  -- reached by accident: it has to be asked for by name, and proved.
  v_tenancy := upper(coalesce(nullif(btrim(p_tenancy),''), 'TENANT'));
  if v_tenancy <> 'FLEET' then v_tenancy := 'TENANT'; end if;
  if v_tenancy = 'FLEET' and not public.is_fleet_operator_cid(v_cid) then
    raise exception 'FLEET_WRITE_DENIED: principal % may not write a FLEET row into public.directives. A fleet rule binds every client, so only an active fleet operator can write one. Nothing was written. Send it again as TENANT if it is for your principal.', v_cid
      using errcode = '42501';
  end if;

  if p_action not in ('state','propose','confirm','amend','retire','restore','rank') then
    raise exception 'COB_RULE_BAD_ACTION: use state, propose, confirm, amend, retire, restore or rank (got %)', p_action using errcode='22023';
  end if;
  if p_scope is not null and p_scope not in ('LOCKED','SITUATIONAL') then
    raise exception 'COB_RULE_BAD_SCOPE: use LOCKED or SITUATIONAL (got %)', p_scope using errcode='22023';
  end if;

  if p_id is not null then
    select to_jsonb(d) into v_before from directives d
     where d.id = p_id and (d.tenant_id = any(public.cob_tenant_labels(v_cid)) or d.cid = v_cid);
    if v_before is null then
      raise exception 'COB_RULE_NOT_FOUND_IN_TENANT: that rule is not yours' using errcode='23503';
    end if;
  elsif p_action in ('confirm','amend','retire','restore','rank') then
    raise exception 'COB_RULE_NEEDS_ID: % acts on an existing rule, so it needs its id', p_action using errcode='22023';
  end if;

  if p_action in ('state','propose') then
    if coalesce(btrim(p_text),'') = '' then
      raise exception 'COB_RULE_NEEDS_TEXT: a rule needs its words' using errcode='22023';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'title', coalesce(d.title, left(d.text,60)), 'status', d.status,
             'similarity', round(public.cob_text_overlap(d.text, p_text)::numeric, 2))
             order by public.cob_text_overlap(d.text, p_text) desc), '[]'::jsonb)
      into v_col
      from directives d
     where (d.tenant_id = any(public.cob_tenant_labels(v_cid)) or d.cid = v_cid)
       and d.status <> 'retired' and public.cob_text_overlap(d.text, p_text) > 0.45;

    v_status := case when p_action = 'state' then 'active' else 'queued' end;

    if p_text ~* '(identity kernel|global preamble|preamble|your profile|your instructions|attestation|attest)'
       and p_text ~* '(ignore|override|overrule|disregard|bypass|skip|suspend|disable|turn off|no longer applies|does not apply|exempt from|rewrite your|edit your own|change your own)' then
      raise exception 'COB_RULE_CONFLICTS_WITH_KERNEL: the identity kernel is the baseline and a rule cannot overturn it. Say what you want to happen instead.' using errcode = '42501';
    end if;

    -- H1/H2 · the rule now names its client. A blank identifier is what made a
    -- client rule and a fleet mandate indistinguishable.
    insert into directives (tenant_id, cid, tenancy, text, title, scope, status, rank, confirmed_at)
    values (v_key, v_cid, 'TENANT'::public.tenancy_t, btrim(p_text), nullif(btrim(p_title),''), coalesce(p_scope,'LOCKED'),
            v_status, p_rank, case when v_status='active' then now() else null end)
    returning id into v_id;

    v_dup := (v_col->0->>'id')::uuid;
    if v_dup is not null then
      insert into rule_relation (a_id, b_id, kind, note, state, cid, found_by)
      values (v_dup, v_id, 'duplicate_of',
              format('Flagged on write · %s%% alike', ((v_col->0->>'similarity')::numeric*100)::int),
              'open', v_cid, 'cob:rule_write')
      on conflict do nothing;
    end if;

    insert into change_log (tenant_id, entity, entity_id, change, summary, actor)
    values (v_key, 'directive', v_id, 'created', left(coalesce(p_title, p_text), 200), 'cob');

    return jsonb_build_object('ok',true,'action',p_action,'id',v_id,'status',v_status,
      'tenancy','TENANT','binds','this client only',
      'governs', v_status='active', 'overlaps', v_col,
      'human', case when v_status='active'
        then 'In force now.' || case when jsonb_array_length(v_col) > 0
             then ' One rule already on file says something close to this.' else '' end
        else 'Written down, waiting on your yes. It does not govern until you confirm it.' end);
  end if;

  if p_action = 'confirm' then
    update directives set status='active', confirmed_at=now(), updated_at=now()
     where id=p_id returning id into v_id;
    v_status := 'active';
  elsif p_action = 'amend' then
    if coalesce(btrim(p_text),'') = '' then
      raise exception 'COB_RULE_NEEDS_TEXT: an amendment needs the new words' using errcode='22023'; end if;
    update directives set text=btrim(p_text), title=coalesce(nullif(btrim(p_title),''), title),
           scope=coalesce(p_scope, scope), status='active', confirmed_at=now(), updated_at=now()
     where id=p_id returning id into v_id;
    v_status := 'active';
  elsif p_action = 'retire' then
    update directives set status='retired', updated_at=now() where id=p_id returning id into v_id;
    v_status := 'retired';
  elsif p_action = 'restore' then
    update directives set status='active', confirmed_at=now(), updated_at=now()
     where id=p_id returning id into v_id;
    v_status := 'active';
  elsif p_action = 'rank' then
    update directives set rank=p_rank, updated_at=now() where id=p_id returning id into v_id;
    v_status := v_before->>'status';
  end if;

  insert into change_log (tenant_id, entity, entity_id, change, summary, actor)
  values (v_key, 'directive', v_id,
          case when p_action='rank' then 'edited' else 'status' end,
          left(coalesce(p_reason, p_action || ': ' || coalesce(v_before->>'title', v_before->>'text')), 200), 'cob');

  return jsonb_build_object('ok',true,'action',p_action,'id',v_id,'status',v_status,
    'governs', v_status='active', 'before', v_before, 'reason', p_reason,
    'human', case p_action
      when 'confirm' then 'Confirmed. It governs from now on.'
      when 'amend'   then 'Amended, and what it said before is still on the record.'
      when 'retire'  then 'Retired, not deleted. It stops governing and can be brought back.'
      when 'restore' then 'Back in force.'
      else 'Ranked.' end);
end $function$;
