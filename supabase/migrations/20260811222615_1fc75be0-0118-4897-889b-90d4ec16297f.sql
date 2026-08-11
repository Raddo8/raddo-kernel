
CREATE OR REPLACE FUNCTION public.work_raise(
  p_cid text, p_title text, p_kind text, p_origin text, p_registry text,
  p_ref text, p_detail text DEFAULT NULL::text, p_owner text DEFAULT NULL::text,
  p_due date DEFAULT NULL::date, p_subject uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_key text; v_id uuid; v_exact boolean := false;
  v_cand record; v_score real;
  v_sig_in jsonb; v_sig_keep jsonb;
  v_reason text; v_discarded jsonb;
begin
  v_key    := work_fingerprint(p_title);
  v_sig_in := work_title_signature(p_title);

  select * into v_cand from work_item
   where cid = p_cid and dedup_key = v_key and state not in ('superseded','dropped')
   limit 1;
  if v_cand.work_id is not null then
    v_id := v_cand.work_id;
    v_exact := true;
    v_score := similarity(lower(v_cand.title), lower(p_title));
    v_sig_keep := work_title_signature(v_cand.title);
  end if;

  -- Near-duplicate: same meaning, different words. Guarded.
  if v_id is null then
    select w.*, similarity(lower(w.title), lower(p_title)) as score
      into v_cand
      from work_item w
     where w.cid = p_cid
       and w.state not in ('superseded','dropped','done')
       and similarity(lower(w.title), lower(p_title)) > 0.62
     order by similarity(lower(w.title), lower(p_title)) desc
     limit 1;

    if v_cand.work_id is not null then
      v_score    := v_cand.score;
      v_sig_keep := work_title_signature(v_cand.title);
      v_reason   := null;
      v_discarded := '{}'::jsonb;

      if p_due is not null and v_cand.due_date is not null and p_due <> v_cand.due_date then
        v_reason := 'due_date_differs';
        v_discarded := v_discarded || jsonb_build_object('due_date', p_due);
      elsif (v_sig_in->'dates') <> (v_sig_keep->'dates') then
        v_reason := 'title_date_token_differs';
        v_discarded := v_discarded || jsonb_build_object('dates', v_sig_in->'dates');
      elsif p_owner is not null and v_cand.owner is not null
            and lower(p_owner) <> lower(v_cand.owner) then
        v_reason := 'owner_differs';
        v_discarded := v_discarded || jsonb_build_object('owner', p_owner);
      elsif (v_sig_in->'names') <> (v_sig_keep->'names') then
        v_reason := 'named_subject_differs';
        v_discarded := v_discarded || jsonb_build_object('names', v_sig_in->'names');
      elsif p_subject is not null and v_cand.subject_id is not null
            and p_subject <> v_cand.subject_id then
        v_reason := 'subject_differs';
        v_discarded := v_discarded || jsonb_build_object('subject_id', p_subject);
      end if;

      if v_reason is null then
        v_id := v_cand.work_id;
      else
        insert into work_merge_receipt(
          cid, decision, refusal_reason, kept_work_id, kept_title, kept_fingerprint,
          incoming_title, incoming_fingerprint, similarity_score, discarded,
          signature_kept, signature_incoming)
        values (
          p_cid, 'REFUSED', v_reason, v_cand.work_id, v_cand.title, v_cand.dedup_key,
          p_title, v_key, v_score, v_discarded, v_sig_keep, v_sig_in);
      end if;
    end if;
  end if;

  if v_id is null then
    insert into work_item(cid,kind,title,detail,origin,owner,due_date,subject_id,dedup_key)
    values (p_cid,p_kind,p_title,p_detail,p_origin,p_owner,p_due,p_subject,v_key)
    returning work_id into v_id;
  else
    -- Any absorb is a destructive write and leaves a receipt, exact or fuzzy.
    if (not v_exact) or v_cand.title is distinct from p_title then
      insert into work_merge_receipt(
        cid, decision, kept_work_id, kept_title, kept_fingerprint,
        incoming_title, incoming_fingerprint, similarity_score, discarded,
        signature_kept, signature_incoming)
      values (
        p_cid, 'MERGED', v_cand.work_id, v_cand.title, v_cand.dedup_key,
        p_title, v_key, v_score,
        jsonb_strip_nulls(jsonb_build_object(
          'match', case when v_exact then 'fingerprint' else 'similarity' end,
          'title', p_title,
          'due_date', case when v_cand.due_date is not null and p_due is not null
                             and v_cand.due_date <> p_due then p_due end,
          'detail', case when v_cand.detail is not null and p_detail is not null
                           and v_cand.detail <> p_detail then p_detail end)),
        v_sig_keep, v_sig_in);
    end if;

    update work_item set
      detail     = coalesce(detail, p_detail),
      owner      = coalesce(owner, p_owner),
      due_date   = coalesce(due_date, p_due),
      subject_id = coalesce(subject_id, p_subject),
      updated_at = now()
    where work_id = v_id;
  end if;

  insert into work_link(work_id,cid,registry,ref_id,role)
  values (v_id,p_cid,p_registry,p_ref,'origin')
  on conflict (work_id,registry,ref_id) do nothing;

  return v_id;
end $function$;
