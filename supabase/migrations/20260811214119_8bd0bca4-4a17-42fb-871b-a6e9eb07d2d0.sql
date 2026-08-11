-- HARDEN-05 · D6 · loops raised during a session are triaged at save, sync and
-- end, never auto-tracked. Canon 11.7 already assigns the roles: work_item is
-- the operational position register, open_loops is the continuity projection.
-- Nothing new is built. The abandoned register is reconnected.

-- ── 5 · owner gets the normalize_loop_state treatment ────────────────────
CREATE TABLE IF NOT EXISTS public.owner_alias (
  alias text PRIMARY KEY,
  canonical text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.owner_alias TO authenticated;
GRANT ALL ON public.owner_alias TO service_role;
ALTER TABLE public.owner_alias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_alias readable" ON public.owner_alias;
CREATE POLICY "owner_alias readable" ON public.owner_alias FOR SELECT TO authenticated USING (true);

INSERT INTO public.owner_alias (alias, canonical) VALUES
  ('cob','COB'),
  ('jake','Jake'),
  ('jake + cob','Jake + COB'),
  ('cob + jake','Jake + COB'),
  ('jake and cob','Jake + COB'),
  ('buddy + jake','Jake + COB'),
  ('janie','Janie Burkett'),
  ('janie burkett','Janie Burkett')
ON CONFLICT (alias) DO UPDATE SET canonical = excluded.canonical;

CREATE OR REPLACE FUNCTION public.normalize_owner_label(p_owner text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- Unknown spellings pass through untouched, exactly like loop_state_alias.
  -- A vocabulary that silently discards what it does not recognise is worse
  -- than no vocabulary.
  select coalesce(
    (select a.canonical from owner_alias a where a.alias = lower(btrim(coalesce(p_owner,'')))),
    nullif(btrim(coalesce(p_owner,'')),'')
  );
$function$;

CREATE OR REPLACE FUNCTION public.normalize_owner_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.owner := public.normalize_owner_label(new.owner);
  return new;
end $function$;

DROP TRIGGER IF EXISTS trg_open_loops_owner ON public.open_loops;
CREATE TRIGGER trg_open_loops_owner BEFORE INSERT OR UPDATE OF owner ON public.open_loops
  FOR EACH ROW EXECUTE FUNCTION public.normalize_owner_trg();

DROP TRIGGER IF EXISTS trg_work_item_owner ON public.work_item;
CREATE TRIGGER trg_work_item_owner BEFORE INSERT OR UPDATE OF owner ON public.work_item
  FOR EACH ROW EXECUTE FUNCTION public.normalize_owner_trg();

UPDATE public.open_loops SET owner = public.normalize_owner_label(owner)
 WHERE owner IS DISTINCT FROM public.normalize_owner_label(owner);
UPDATE public.work_item SET owner = public.normalize_owner_label(owner)
 WHERE owner IS DISTINCT FROM public.normalize_owner_label(owner);

-- ── 2 · open_loops becomes derived ───────────────────────────────────────
ALTER TABLE public.open_loops ADD COLUMN IF NOT EXISTS principal_acts boolean;
ALTER TABLE public.open_loops ADD COLUMN IF NOT EXISTS work_id uuid;
CREATE INDEX IF NOT EXISTS open_loops_work_id_idx ON public.open_loops (work_id);

-- Backfill: every open_loops row without a work_item counterpart gets one.
-- 90 rows were created in the four days since work_item's last write, and
-- CID-100002 / 100003 / 100004 have never had a single row.
INSERT INTO public.work_item (cid, kind, title, detail, origin, owner, due_date, state, dedup_key, principal_acts, created_at)
SELECT DISTINCT ON (o.cid, public.work_fingerprint(o.title))
       o.cid, 'task', o.title, o.trigger, 'audit', o.owner, o.hard_deadline,
       case when o.brief_status in ('cleared','answered') then 'done' else 'open' end,
       public.work_fingerprint(o.title), null, o.created_at
  FROM public.open_loops o
 WHERE o.cid IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.work_link k WHERE k.registry='open_loops' AND k.ref_id = o.id::text)
   AND NOT EXISTS (
     SELECT 1 FROM public.work_item w WHERE w.cid = o.cid AND w.dedup_key = public.work_fingerprint(o.title))
 ORDER BY o.cid, public.work_fingerprint(o.title), o.created_at;

-- Link every open_loops row to its work_item, by fingerprint.
INSERT INTO public.work_link (work_id, cid, registry, ref_id, role)
SELECT w.work_id, o.cid, 'open_loops', o.id::text, 'origin'
  FROM public.open_loops o
  JOIN public.work_item w ON w.cid = o.cid AND w.dedup_key = public.work_fingerprint(o.title)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.work_link k WHERE k.work_id = w.work_id AND k.registry='open_loops' AND k.ref_id = o.id::text)
ON CONFLICT (work_id, registry, ref_id) DO NOTHING;

UPDATE public.open_loops o
   SET work_id = k.work_id
  FROM public.work_link k
 WHERE k.registry='open_loops' AND k.ref_id = o.id::text AND o.work_id IS DISTINCT FROM k.work_id;

-- ── the projector · open_loops is what work_item projects, nothing more ──
CREATE OR REPLACE FUNCTION public.work_sync_loops(p_cid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_projected int := 0; v_withheld int := 0; v_created int := 0; v_today date;
begin
  if p_cid is null then raise exception 'WORK_SYNC_CID_REQUIRED' using errcode='22023'; end if;
  v_today := (now() at time zone coalesce((select timezone from tenants where cid=p_cid),'UTC'))::date;

  -- Stamp the projection verdict onto every linked loop.
  update open_loops o
     set principal_acts = w.principal_acts,
         work_id = w.work_id,
         updated_at = now()
    from work_item w
   where w.work_id = o.work_id and o.cid = p_cid
     and (o.principal_acts is distinct from w.principal_acts);

  -- A principal-acting, open, unsnoozed work_item with no projection gets one.
  insert into open_loops (cid, tenant, title, trigger, owner, state, brief_status, work_id, principal_acts, surfaced_count)
  select w.cid, public.cob_tenant_key_or_cid(w.cid), w.title, w.detail, w.owner, 'open', 'open', w.work_id, true, 0
    from work_item w
   where w.cid = p_cid and w.state = 'open' and w.principal_acts is true
     and (w.snooze_until is null or w.snooze_until <= v_today)
     and not exists (select 1 from open_loops o where o.work_id = w.work_id);
  get diagnostics v_created = row_count;

  select count(*) into v_projected from open_loops o
   where o.cid=p_cid and o.brief_status='open' and o.superseded_by is null and o.principal_acts is true;
  select count(*) into v_withheld from open_loops o
   where o.cid=p_cid and o.brief_status='open' and o.superseded_by is null and o.principal_acts is not true;

  return jsonb_build_object('ok',true,'cid',p_cid,'projected',v_projected,
    'withheld',v_withheld,'created',v_created);
end $function$;

GRANT EXECUTE ON FUNCTION public.work_sync_loops(text) TO service_role;

-- ── 1 · anything raised mid-session goes through work_raise ──────────────
CREATE OR REPLACE FUNCTION public.session_raise(
  p_cid text,
  p_title text,
  p_origin text,
  p_principal_acts boolean DEFAULT NULL,
  p_detail text DEFAULT NULL,
  p_owner text DEFAULT NULL,
  p_kind text DEFAULT 'task',
  p_due date DEFAULT NULL,
  p_session_id text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_work uuid; v_loop uuid;
begin
  if p_cid is null or btrim(p_cid)='' then raise exception 'RAISE_CID_REQUIRED' using errcode='22023'; end if;
  if p_title is null or btrim(p_title)='' then raise exception 'RAISE_TITLE_REQUIRED' using errcode='22023'; end if;
  if p_origin is null or btrim(p_origin)='' then
    raise exception 'RAISE_ORIGIN_REQUIRED: origin records what raised this. An item with no origin cannot be triaged.'
      using errcode='22023'; end if;

  v_work := public.work_raise(p_cid, p_title, coalesce(p_kind,'task'), p_origin,
                              'session', coalesce(p_session_id,'unattributed'),
                              p_detail, p_owner, p_due, null);

  if p_principal_acts is not null then
    update work_item set principal_acts = p_principal_acts, updated_at = now() where work_id = v_work;
  end if;

  -- It reaches open_loops only when the principal is the one who must move.
  perform public.work_sync_loops(p_cid);
  select o.id into v_loop from open_loops o where o.work_id = v_work limit 1;

  return jsonb_build_object('ok',true,'work_id',v_work,'cid',p_cid,
    'principal_acts',p_principal_acts,
    'tracked_on_board', v_loop is not null,
    'loop_id', v_loop,
    'disposition', case when p_principal_acts is null then 'undisposed' else 'disposed' end);
end $function$;

GRANT EXECUTE ON FUNCTION public.session_raise(text,text,text,boolean,text,text,text,date,text) TO service_role;

-- ── 3 and 4 · the disposition queue. An undisposed item blocks a clean close.
CREATE OR REPLACE FUNCTION public.work_disposition_queue(p_cid text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb; v_n int;
begin
  if p_cid is null then raise exception 'DISPOSITION_CID_REQUIRED' using errcode='22023'; end if;

  select count(*) into v_n from work_item w
   where w.cid=p_cid and w.state in ('open','snoozed','blocked')
     and (w.principal_acts is null or w.date_kind is null);

  select jsonb_agg(x order by x->>'created_at') into v from (
    select jsonb_build_object(
      'work_id', w.work_id, 'title', w.title, 'detail', w.detail, 'kind', w.kind,
      'origin', w.origin, 'owner', w.owner, 'due_date', w.due_date,
      'principal_acts', w.principal_acts, 'date_kind', w.date_kind,
      'created_at', w.created_at,
      'missing', (case when w.principal_acts is null then jsonb_build_array('principal_acts') else '[]'::jsonb end)
               || (case when w.date_kind is null then jsonb_build_array('lane') else '[]'::jsonb end),
      'offered_actions', jsonb_build_array('track','forget')
    ) x
    from work_item w
    where w.cid=p_cid and w.state in ('open','snoozed','blocked')
      and (w.principal_acts is null or w.date_kind is null)
    order by w.created_at
    limit greatest(1, coalesce(p_limit,50))
  ) s;

  return jsonb_build_object('ok',true,'cid',p_cid,'undisposed',v_n,
    'clean', v_n = 0,
    'reason', case when v_n = 0 then null else
      v_n || ' item(s) raised have not been disposed of. Each is either tracked (say who acts and which lane) or forgotten (close it with a reason). Neither silently persists nor silently vanishes.' end,
    'items', coalesce(v,'[]'::jsonb));
end $function$;

GRANT EXECUTE ON FUNCTION public.work_disposition_queue(text,integer) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.work_dispose(
  p_work uuid,
  p_disposition text,
  p_reason text DEFAULT NULL,
  p_principal_acts boolean DEFAULT NULL,
  p_lane text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cid text;
begin
  select cid into v_cid from work_item where work_id = p_work;
  if v_cid is null then raise exception 'WORK_ITEM_NOT_FOUND: %', p_work using errcode='23503'; end if;

  if p_disposition = 'tracked' then
    if p_principal_acts is null then
      raise exception 'DISPOSITION_INCOMPLETE: tracking an item requires saying whether the principal is the one who must move.'
        using errcode='22023'; end if;
    if p_lane is not null and p_lane not in ('hard_deadline','scheduled_event','target','window','reference','expected_next') then
      raise exception 'DISPOSITION_LANE_UNKNOWN: % (hard_deadline|scheduled_event|target|window|reference|expected_next)', p_lane
        using errcode='22023'; end if;
    update work_item
       set principal_acts = p_principal_acts,
           date_kind = coalesce(p_lane, date_kind, 'target'),
           updated_at = now()
     where work_id = p_work;
    perform public.work_score(v_cid);
    perform public.work_sync_loops(v_cid);

  elsif p_disposition = 'forgotten' then
    -- Forgotten is a state with a reason, never an absence.
    if p_reason is null or btrim(p_reason)='' then
      raise exception 'DISPOSITION_REASON_REQUIRED: forgetting an item requires a reason. An item that vanishes without one is data loss, not triage.'
        using errcode='22023'; end if;
    perform public.work_close(p_work, 'dropped', p_reason, null, null);
    update work_item set principal_acts = coalesce(principal_acts,false), updated_at = now() where work_id = p_work;
    perform public.work_sync_loops(v_cid);

  else
    raise exception 'DISPOSITION_UNKNOWN: % (tracked|forgotten)', p_disposition using errcode='22023';
  end if;

  return jsonb_build_object('ok',true,'work_id',p_work,'cid',v_cid,'disposition',p_disposition,
    'reason',p_reason,'retrievable',true);
end $function$;

GRANT EXECUTE ON FUNCTION public.work_dispose(uuid,text,text,boolean,text) TO service_role;

-- ── the board renders the projection, and says what it withheld ──────────
CREATE OR REPLACE FUNCTION public.board_render(p_cid text DEFAULT NULL::text, p_bump boolean DEFAULT true, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cid text; v_role text; v_today date; v_row record;
  v_items jsonb := '[]'::jsonb; v_withheld jsonb := '[]'::jsonb;
  v_count int; v_urgent boolean; v_esc text; v_actions jsonb; v_mech int := 0;
  v_undisposed int := 0;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  if p_cid is not null then
    if v_role <> 'service_role' then
      raise exception 'BOARD_CID_NOT_ACCEPTED_FROM_CLIENT' using errcode='42501'; end if;
    v_cid := p_cid;
  else v_cid := public.current_cid(); end if;
  if v_cid is null then raise exception 'BOARD_UNAUTHENTICATED' using errcode='28000'; end if;

  v_today := (now() at time zone coalesce((select timezone from tenants where cid = v_cid), 'UTC'))::date;

  -- D6 · the board is the projection of work_item, refreshed before it renders.
  perform public.work_sync_loops(v_cid);

  for v_row in
    select * from open_loops o
     where o.cid = v_cid and o.brief_status = 'open'
       and (o.snooze_until is null or o.snooze_until <= v_today)
       and o.superseded_by is null
       -- D6.2 · only what the principal must act on reaches the board.
       and o.principal_acts is true
     order by o.state nulls last, o.created_at
     limit greatest(1, coalesce(p_limit, 200))
  loop
    v_count := coalesce(v_row.surfaced_count, 0) + (case when p_bump then 1 else 0 end);
    v_urgent := coalesce(v_row.urgent, false) or v_row.hard_deadline is not null;
    v_esc := v_row.escalation_state;

    if not v_urgent then
      if v_count >= 8 then v_esc := 'mechanism_review';
      elsif v_count >= 3 and v_row.last_action_at is null then v_esc := 'flagged';
      end if;
    else
      v_esc := null;
    end if;

    if p_bump then
      update open_loops
         set surfaced_count = v_count, last_surfaced = now(),
             escalation_state = v_esc,
             escalated_at = case when v_esc is not null and v_row.escalation_state is distinct from v_esc
                                 then now() else escalated_at end,
             updated_at = now()
       where id = v_row.id;
    end if;

    v_actions := jsonb_build_array('answer', 'clear');
    if v_count >= 3 and not v_urgent then
      v_actions := v_actions || jsonb_build_array('snooze', 'rewrite', 'escalate');
    end if;

    v_items := v_items || jsonb_build_object(
      'id', v_row.id, 'work_id', v_row.work_id,
      'title', v_row.title, 'trigger', v_row.trigger, 'owner', v_row.owner,
      'state', v_row.state, 'brief_status', v_row.brief_status, 'surfaced_count', v_count,
      'snooze_until', v_row.snooze_until, 'hard_deadline', v_row.hard_deadline,
      'urgent', v_urgent, 'urgent_reason', v_row.urgent_reason,
      'escalation_state', v_esc,
      'offered_actions', v_actions,
      'note', case
        when v_esc = 'mechanism_review' then 'Surfaced ' || v_count || ' times. The surfacing is broken, not the principal. Rewrite or escalate; do not show it again unchanged.'
        when v_esc = 'flagged' then 'Surfaced ' || v_count || ' times with no action. Rewrite it, escalate it, or snooze it with a date. Do not surface it again unchanged.'
        when v_urgent then 'Urgent carve-out. Stays visible regardless of count.'
        else null end
    );

    if v_esc = 'mechanism_review' then v_mech := v_mech + 1; end if;
  end loop;

  -- What was held back, and why. Canon 11.8: never a bare absence.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'work_id', o.work_id, 'title', o.title,
           'reason', case
             when o.principal_acts is false then 'not yours to act on'
             when o.principal_acts is null then 'not yet disposed of · say who acts, or forget it with a reason'
             when o.snooze_until > v_today then 'snoozed until ' || o.snooze_until
             else 'withheld' end)), '[]'::jsonb)
    into v_withheld
    from open_loops o
   where o.cid = v_cid and o.brief_status = 'open' and o.superseded_by is null
     and (o.principal_acts is not true or o.snooze_until > v_today);

  select count(*) into v_undisposed from work_item w
   where w.cid = v_cid and w.state in ('open','snoozed','blocked')
     and (w.principal_acts is null or w.date_kind is null);

  if p_bump and v_mech > 0 then
    perform public.cob_signal_raise_internal(
      v_cid,
      'board_surfacing_mechanism_failing',
      v_mech || ' open loop(s) have been surfaced eight or more times without resolution. The surfacing mechanism is the defect, not the principal.',
      null, 'board_render', 'board', 'open_loops', null, 'operator', 'board_render'
    );
  end if;

  return jsonb_build_object('ok', true, 'cid', v_cid, 'today', v_today,
    'bumped', p_bump, 'count', jsonb_array_length(v_items),
    'mechanism_review_count', v_mech,
    'undisposed_count', v_undisposed,
    'empty_reason', case when jsonb_array_length(v_items) = 0 then
        case when v_undisposed > 0
          then 'Nothing is on the board because ' || v_undisposed || ' raised item(s) have not been disposed of yet.'
          when jsonb_array_length(v_withheld) > 0
          then 'Nothing is on the board because every open item is withheld. See withheld for the reason on each.'
          else 'Nothing is open on this board. No item is being withheld.' end
      else null end,
    'items', v_items, 'withheld', v_withheld);
end $function$;

-- Project every tenant once so the state is real, not latent.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT cid FROM tenants LOOP
    PERFORM public.work_sync_loops(c);
  END LOOP;
END $$;