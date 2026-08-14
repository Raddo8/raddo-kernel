-- Captures schema state that exists only in the live production database.
-- Without this file, a redeploy from source silently loses the objects below.
--
-- Contents: six function definitions read verbatim from the live database via
-- pg_get_functiondef, the world_items / domain_taxonomy / item_domain shelf DDL,
-- the seeded domain keyword arrays, and the world_item_enrich trigger.
--
-- Two of these are governance repairs whose loss is silent:
--   * tg_change_ledger did not set the `tenancy` column, so every fleet-scoped row
--     it tried to log was rejected by the tenancy check constraint. Fleet-level
--     changes were invisible in the audit ledger.
--   * propose_doctrine_rule did not set `tenancy`, so no FLEET doctrine rule could
--     be written at all.
--
-- The changes are already live. This file exists to make them reproducible.

begin;

-- 1. tg_change_ledger
CREATE OR REPLACE FUNCTION public.tg_change_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cid text; v_pk text; v_before jsonb; v_after jsonb; v_fields text[];
begin
  v_before := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_after  := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_cid := coalesce(v_after->>'cid', v_before->>'cid', v_after->>'tenant_id', v_before->>'tenant_id');
  v_pk  := coalesce(v_after->>tg_argv[0], v_before->>tg_argv[0]);

  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into v_fields
      from jsonb_each(v_after) a
     where a.value is distinct from (v_before -> a.key);
    if v_fields is null or array_length(v_fields,1) is null then return new; end if;
  end if;

  insert into change_ledger(cid, table_name, row_pk, pk_col, op, before_row, after_row, changed_fields,
                            actor, actor_role, session_ref, reason, tenancy)
  values (v_cid, tg_table_name, v_pk, tg_argv[0], tg_op, v_before, v_after, v_fields,
          change_actor(),
          coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role', 'server'),
          nullif(current_setting('cob.session', true),''),
          nullif(current_setting('cob.reason', true),''),
          (case when v_cid is null then 'FLEET' else 'TENANT' end)::public.tenancy_t);
  return coalesce(new, old);
end $function$;

-- 2. propose_doctrine_rule
CREATE OR REPLACE FUNCTION public.propose_doctrine_rule(p_tier integer, p_rule_key text, p_rule_text text, p_source text, p_actor text, p_scope text DEFAULT 'FLEET'::text, p_cid text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_v int;
begin
  perform admin_guard();
  perform set_config('cob.doctrine_writer','on',true);
  select coalesce(max(version),0)+1 into v_v from doctrine_rules where rule_key=p_rule_key;
  insert into doctrine_rules (tier, rule_key, rule_text, scope, cid, status, source, version, tenancy)
  values (p_tier, p_rule_key, p_rule_text, p_scope, p_cid, 'DRAFT', p_source, v_v,
          (case when p_cid is null then 'FLEET' else 'TENANT' end)::public.tenancy_t)
  returning rule_id into v_id;
  insert into doctrine_amendments (action, rule_key, to_tier, to_version, actor, reason, provenance)
  values ('PROPOSE', p_rule_key, p_tier, v_v, p_actor, 'proposed: '||left(p_rule_text,120), 'GOVERNED');
  perform set_config('cob.doctrine_writer','off',true);
  return jsonb_build_object('rule_id',v_id,'rule_key',p_rule_key,'version',v_v,'status','DRAFT',
    'note','DRAFT grants nothing. It governs only after ratify_doctrine_rule.');
end $function$;

-- shelf DDL: world_items / domain_taxonomy / item_domain
alter table public.world_items
  add column if not exists domain_key  text,
  add column if not exists occurred_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='world_items_domain_key_fkey')
     and exists (select 1 from pg_constraint
                  where conrelid='public.domain_taxonomy'::regclass and contype='p') then
    alter table public.world_items add constraint world_items_domain_key_fkey
      foreign key (domain_key) references public.domain_taxonomy(domain_key);
  end if;
end $$;

create index if not exists world_items_cid_domain_idx   on public.world_items(cid, domain_key);
create index if not exists world_items_cid_occurred_idx on public.world_items(cid, occurred_at desc nulls last);
create index if not exists world_items_cid_type_idx     on public.world_items(cid, item_type);

alter table public.domain_taxonomy
  add column if not exists keywords text[] not null default '{}';

alter table public.item_domain
  add column if not exists world_item_id uuid references public.world_items(id) on delete cascade;

create index if not exists item_domain_world_item_idx
  on public.item_domain(cid, world_item_id) where world_item_id is not null;
create index if not exists item_domain_cid_domain_idx
  on public.item_domain(cid, domain_key);

-- seeded domain keyword arrays
update public.domain_taxonomy set keywords = v.kw
from (values
  ('legal', array['contract', 'attorney', 'counsel', 'lawsuit', 'compliance', 'license', 'licence', 'regulation', 'regulatory', 'statute', 'liability', '501', 'bylaws', 'waiver', 'consent', 'terms', 'dispute', 'litigation', 'tax exempt', 'exemption']::text[]),
  ('capital', array['equity', 'shareholder', 'investor', 'valuation', 'cap table', 'ownership stake', 'fundraise round', 'dilution', 'member unit']::text[]),
  ('property', array['lease', 'building', 'facility', 'warehouse', 'venue', 'campus', 'real estate', 'square feet', 'premises', 'title deed']::text[]),
  ('risk', array['insurance', 'coverage', 'policy schedule', 'exposure', 'indemnity', 'broker', 'deductible', 'incident', 'safety']::text[]),
  ('people', array['employee', 'staff', 'hire', 'hiring', 'payroll', 'salary', 'benefits', 'onboarding', 'headcount', 'job description', 'manager', 'team', 'serve team', 'volunteer', 'coach', 'director of operations', 'part time', 'full time']::text[]),
  ('cash', array['expense', 'budget', 'invoice', 'revenue', 'deficit', 'fundraising', 'drawdown', 'reimburse', 'ledger', 'banking', 'payment', 'spending', 'financial', 'finance', 'dollar', 'commingled', 'accounting', 'sage', 'baseline income', 'year to date', 'profit', 'loss', 'variance']::text[]),
  ('sales', array['pricing', 'price', 'ticket sales', 'order', 'sold', 'merch', 'storefront', 'registration fee', 'checkout', 'sku']::text[]),
  ('customers', array['contact list', 'contacts', 'registrant', 'attendee', 'member', 'membership', 'prospect', 'pipeline', 'crm', 'roster', 'import list', 'audience list', 'subscriber']::text[]),
  ('ops', array['process', 'workflow', 'procedure', 'playbook', 'handbook', 'checklist', 'logistics', 'meeting', 'deadline', 'schedule', 'coordination', 'admin', 'approval', 'ticket board', 'monday ticket', 'request form', 'booth', 'stakeholder ask', 'follow up', 'cadence', 'standard']::text[]),
  ('supply', array['vendor', 'supplier', 'purchase', 'purchasing', 'procurement', 'shipping', 'accounts payable', 'ramp', 'amazon order', 'purchase order', 'requisition']::text[]),
  ('tech', array['software', 'platform', 'integration', 'connector', 'login', 'api', 'database', 'import', 'export', 'automation', 'subscription', 'sub account', 'tagging', 'gohighlevel', 'notion', 'slack', 'planning center', 'mighty networks', 'spreadsheet', 'csv', 'docx', 'metadata', 'field mapping']::text[]),
  ('marketing', array['brand', 'branding', 'campaign', 'content', 'social media', 'website', 'newsletter', 'design', 'logo', 'messaging', 'promotion', 'copy', 'pamphlet', 'video', 'livestream']::text[]),
  ('strategy', array['vision', 'plan', 'planning', 'roadmap', 'priority', 'priorities', 'goal', 'objective', 'proposal', 'direction', 'strategy', 'positioning', 'readiness', 'launch']::text[]),
  ('network', array['relationship', 'introduction', 'referral', 'stakeholder', 'pastor', 'leadership', 'partner', 'point of contact', 'connect', 'orbit', 'who to talk to']::text[]),
  ('family', array['spouse', 'child', 'children', 'household', 'family', 'domestic']::text[]),
  ('health', array['medical', 'doctor', 'health', 'therapy', 'illness', 'provider portal', 'diagnosis', 'care decision']::text[]),
  ('education', array['school', 'tuition', 'class', 'course', 'curriculum', 'student', 'cohort', 'training', 'teaching', 'session series', 'enrolment', 'enrollment']::text[]),
  ('giving', array['donation', 'charitable', 'tithe', 'grant', 'philanthropy', 'offering', 'generosity', 'stewardship', 'give', 'giving']::text[]),
  ('estate', array['will', 'trust', 'beneficiary', 'estate', 'inheritance', 'succession', 'personal account']::text[]),
  ('travel', array['trip', 'flight', 'hotel', 'itinerary', 'travel', 'lodging', 'on site visit']::text[]),
  ('interests', array['hobby', 'sport', 'fitness', 'music', 'reading', 'creative work', 'faith practice']::text[])
) as v(dk, kw)
where public.domain_taxonomy.domain_key = v.dk;

-- 3. tg_world_item_enrich
CREATE OR REPLACE FUNCTION public.tg_world_item_enrich()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_raw text; v_ts timestamptz; v_dom text;
begin
  -- occurred_at: happened-time. Never overwrite an explicit value. Recorded-time stays in created_at.
  if new.occurred_at is null then
    v_raw := coalesce(
      nullif(new.provenance->>'occurred_at',''),
      nullif(new.provenance->>'happened_at',''),
      nullif(new.provenance->>'date',''),
      nullif(new.provenance->>'original_date',''),
      nullif(substring(coalesce(new.title,'')  from '^([0-9]{4}-[0-9]{2}-[0-9]{2})'),''),
      nullif(substring(coalesce(new.body,'')   from '^([0-9]{4}-[0-9]{2}-[0-9]{2})'),''),
      nullif(substring(coalesce(new.title,'')  from '([0-9]{4}-[0-9]{2}-[0-9]{2}) · '),''),
      nullif(substring(coalesce(new.body,'')   from '([0-9]{4}-[0-9]{2}-[0-9]{2}) · '),''));
    if v_raw is not null then
      begin v_ts := v_raw::timestamptz; exception when others then v_ts := null; end;
    end if;
    new.occurred_at := coalesce(v_ts, new.first_seen);
  end if;

  -- domain_key: the shelf. Taken only from an explicit, valid taxonomy key. Never guessed at write time.
  if new.domain_key is null then
    v_dom := lower(btrim(coalesce(new.provenance->>'domain', new.provenance->>'domain_key','')));
    if v_dom <> '' and exists (select 1 from domain_taxonomy d where d.domain_key = v_dom) then
      new.domain_key := v_dom;
    end if;
  end if;

  return new;
end $function$;

drop trigger if exists world_item_enrich on public.world_items;
create trigger world_item_enrich before insert or update on public.world_items
for each row execute function public.tg_world_item_enrich();

-- 4. cob_domain_suggest
CREATE OR REPLACE FUNCTION public.cob_domain_suggest(p_text text, p_scope text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with stop as (select unnest(array['and','the','for','with','that','their','this','from','they','what','when','where','which','have','has','are','was','were','been','into','over','under','plus','etc','who','how','its','his','her','all','any','each','other','than','then','them','these','those','also','just','only','more','most','some','such','both','own','same','very','can','will','does','did','not','but','you','your','our','ours','principal','things','thing','stuff','actually','done','gets','carry','carries','records','record','documents','document','accounts','account','folders','folder','files','file','system','systems','platforms']) w),
txt as (select lower(coalesce(p_text,'')) t),
terms as (
  select d.domain_key, t.term, t.wt
  from domain_taxonomy d
  cross join lateral (
    select regexp_split_to_table(lower(d.label),'[^a-z]+') term, 3 wt
    union all select regexp_split_to_table(lower(d.definition),'[^a-z]+'), 1
    union all select lower(k), 6 from unnest(d.keywords) k
  ) t
  where length(t.term) >= 4 and t.term not in (select w from stop)
    and (p_scope is null or d.scope = p_scope or d.scope = 'both')
),
hit as (
  select distinct on (tm.domain_key, tm.term) tm.domain_key, tm.term, tm.wt
  from terms tm, txt
  where case
          when position(' ' in tm.term) > 0 then txt.t like '%'||tm.term||'%'
          else txt.t ~ ('\m' || left(tm.term, greatest(4, length(tm.term)-2)))
        end
  order by tm.domain_key, tm.term, tm.wt desc
),
scored as (select domain_key, sum(wt) s, array_agg(term order by wt desc, term) words from hit group by 1)
select coalesce(jsonb_agg(jsonb_build_object('domain_key',domain_key,'score',s,'matched',to_jsonb(words)) order by s desc, domain_key),'[]'::jsonb)
from (select * from scored order by s desc, domain_key limit 3) x;
$function$;

-- 5. cob_fetch
CREATE OR REPLACE FUNCTION public.cob_fetch(p_cid text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_cid text; v_lbl text[]; v_out jsonb;
begin
  v_cid := public.cob_guard(p_cid);
  v_lbl := public.cob_tenant_labels(v_cid);

  select jsonb_build_object('register','memory','id',m.id,'title',m.title,'lane',m.lane,
           'category',m.category,'status',m.status,'body_md',m.body_md,'created_at',m.created_at,
           'occurred_at',m.occurred_at,
           'own_words',(m.created_by is null or m.created_by not like 'cob:harvest%'))
    into v_out from memory_entries m where m.id=p_id and m.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','claim','id',c.id,'predicate',c.predicate,'body_md',c.value_text,
           'grade',c.grade,'status',c.status,'confidence',c.confidence,'sensitivity',c.sensitivity,
           'source_ref',c.source_ref,'observed_at',c.observed_at,'recorded_at',c.created_at,
           'supersedes',c.supersedes,
           'subject', (select jsonb_build_object('id',e.id,'name',e.name,'etype',e.etype,'tag',e.tag)
                        from world_entities e where e.id=c.subject_id),
           'object', (select jsonb_build_object('id',e2.id,'name',e2.name,'etype',e2.etype)
                        from world_entities e2 where e2.id=c.object_id))
    into v_out from world_claims c where c.id=p_id and c.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','entity','id',e.id,'name',e.name,'etype',e.etype,'tag',e.tag,
           'status',e.status,'lifecycle',e.lifecycle,'origin_date',e.origin_date,'merged_into',e.merged_into,
           'claims',(select coalesce(jsonb_agg(jsonb_build_object('id',c2.id,'predicate',c2.predicate,'body_md',c2.value_text)
                       order by c2.observed_at desc),'[]'::jsonb)
                     from world_claims c2 where c2.subject_id=e.id and c2.cid=v_cid),
           'edges',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'etype',g.etype,'dir',
                         case when g.src_id=e.id then 'out' else 'in' end,'other',
                         case when g.src_id=e.id then g.dst_id else g.src_id end)),'[]'::jsonb)
                     from world_edges g where g.cid=v_cid and (g.src_id=e.id or g.dst_id=e.id)))
    into v_out from world_entities e where e.id=p_id and e.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','edge','id',g.id,'etype',g.etype,'meta',g.meta,'created_at',g.created_at,
           'src',(select jsonb_build_object('id',s.id,'name',s.name,'etype',s.etype) from world_entities s where s.id=g.src_id),
           'dst',(select jsonb_build_object('id',d2.id,'name',d2.name,'etype',d2.etype) from world_entities d2 where d2.id=g.dst_id))
    into v_out from world_edges g where g.id=p_id and g.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','narrative','id',s.id,'kind',s.kind,'lane',s.lane,'title',s.title,
           'revision',s.revision,'status',s.status,'supersedes',s.supersedes,'body_md',s.body_md)
    into v_out from storyline s where s.id=p_id and s.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','open_loop','id',o.id,'title',o.title,'trigger',o.trigger,
           'owner',o.owner,'state',o.state,'brief_status',o.brief_status,'surfaced_count',o.surfaced_count,
           'created_at',o.created_at,'occurred_at',o.occurred_at)
    into v_out from open_loops o where o.id=p_id and (o.tenant = any(v_lbl) or o.cid=v_cid);
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','rule','id',d.id,'title',d.title,'body_md',d.text,'scope',d.scope,
           'status',d.status,'governs',d.status='active','rank',d.rank,
           'stated_at',d.created_at,'confirmed_at',d.confirmed_at,'occurred_at',d.occurred_at,
           'overlaps',(select coalesce(jsonb_agg(jsonb_build_object('kind',rr.kind,'other',
                          case when rr.a_id=d.id then rr.b_id else rr.a_id end,'note',rr.note)),'[]'::jsonb)
                       from rule_relation rr where (rr.a_id=d.id or rr.b_id=d.id) and rr.state='open'))
    into v_out from directives d where d.id=p_id and (d.tenant_id = any(v_lbl) or d.cid=v_cid);
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','blueprint','id',b.id,'title',b.title,'intent',b.intent,
           'current_state',b.current_state,'next_action',b.next_action,'owner',b.owner,'status',b.status,
           'loop_cadence',b.loop_cadence,'version',b.version,'milestones',b.milestones,'updated_at',b.updated_at)
    into v_out from blueprints b where b.id=p_id and (b.tenant_id = any(v_lbl) or b.cid=v_cid);
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','decision','id',dc.id,'curn',dc.curn,'title',dc.title,
           'body_md',dc.decision_md,'rationale_md',dc.rationale_md,'authority_tier',dc.authority_tier,
           'reversibility',dc.reversibility,'decided_by',dc.decided_by,'decided_at',dc.decided_at,
           'superseded_by',dc.superseded_by,'authoritative',dc.authoritative,
           'verification_state',dc.verification_state,'minute_id',dc.minute_id)
    into v_out from decisions dc where dc.id=p_id and dc.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','signal','id',s2.id,'curn',s2.curn,'title',s2.pattern,
           'body_md',s2.detail_md,'recurrence',s2.recurrence,'sightings',s2.sightings,'status',s2.status,
           'audience',s2.audience,'silent',s2.silent,'classification',s2.classification,
           'first_seen',s2.first_seen,'last_seen',s2.last_seen,'signal_key',s2.signal_key)
    into v_out from improvement_signals s2 where s2.id=p_id and s2.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','comm','id',cm.comm_id,'channel',cm.channel,'direction',cm.direction,
           'state',cm.state,'to_whom',cm.to_whom,'title',cm.subject,'body_md',cm.body_md,
           'prepared_by',cm.prepared_by,'approved_at',cm.approved_at,'sent_at',cm.sent_at,
           'failed_reason',cm.failed_reason,'external_url',cm.external_url,
           'occurred_at',cm.occurred_at,'created_at',cm.created_at)
    into v_out from comms cm where cm.comm_id=p_id and (cm.cid=v_cid or cm.tenant = any(v_lbl));
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','office_record','id',orx.record_id,'title',orx.name,'kind',orx.kind,
           'linked_entity',orx.linked_entity,'record_date',orx.record_date,'linked_decision',orx.linked_decision,
           'body_md',orx.note,'source_ref',orx.source_ref,'migrated_from',orx.migrated_from,
           'links',jsonb_strip_nulls(jsonb_build_object('box',orx.box_link,'drive',orx.drive_link,'other',orx.other_link)),
           'occurred_at',orx.occurred_at,'created_at',orx.created_at)
    into v_out from office_record_index orx where orx.record_id=p_id and orx.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','probe_run','id',pr.id,'title',pr.claim,'probe_kind',pr.probe_kind,
           'subject_kind',pr.subject_kind,'subject_ref',pr.subject_ref,'method',pr.method,
           'expected',pr.expected,'observed',pr.observed,'passed',pr.passed,'ran_at',pr.ran_at,'ran_by',pr.ran_by)
    into v_out from probe_runs pr where pr.id=p_id and pr.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','work_item','id',w.work_id,'title',w.title,'body_md',w.detail,
           'kind',w.kind,'origin',w.origin,'owner',w.owner,'state',w.state,'lane',w.lane,
           'urgency',w.urgency,'significance',w.significance,'relationship',w.relationship,
           'due_date',w.due_date,'ref_date',w.ref_date,'date_basis',w.date_basis,'date_kind',w.date_kind,
           'trigger',w.trigger,'surfaced_count',w.surfaced_count,'last_surfaced',w.last_surfaced,
           'consequence',w.consequence,'consequence_note',w.consequence_note,'principal_acts',w.principal_acts,
           'close_reason',w.close_reason,'closed_at',w.closed_at,'created_at',w.created_at,
           'subject',(select jsonb_build_object('id',we.id,'name',we.name,'etype',we.etype)
                       from world_entities we where we.id=w.subject_id))
    into v_out from work_item w where w.work_id=p_id and w.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','bulletin','id',bl.id,'title',bl.title,'type',bl.type,
           'priority',bl.priority,'audience',bl.audience,'effective',bl.effective,'expires',bl.expires,
           'body_md',bl.body_md,'action_md',bl.action_md,'seen',bl.seen,'seen_at',bl.seen_at,
           'occurred_at',bl.occurred_at,'created_at',bl.created_at)
    into v_out from bulletins bl where bl.id=p_id and bl.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','session','id',ss.id,'title',ss.title,'surface',ss.surface,
           'opened_at',ss.opened_at,'closed_at',ss.closed_at,'close_kind',ss.close_kind,
           'kernel_version',ss.kernel_version,'tool_manifest_version',ss.tool_manifest_version,'meta',ss.meta,
           'transcript_parts',(select count(*) from session_transcript st2 where st2.session_id=ss.id and st2.cid=v_cid))
    into v_out from sessions ss where ss.id=p_id and (ss.cid=v_cid or ss.tenant = any(v_lbl));
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','session_transcript','id',st.transcript_id,'session_id',st.session_id,
           'fidelity',st.fidelity,'part',st.part,'parts_total',st.parts_total,'chars',st.chars,
           'scrubbed',st.scrubbed,'scrub_note',st.scrub_note,'written_by',st.written_by,'body_md',st.body_md,
           'occurred_at',st.occurred_at,'created_at',st.created_at)
    into v_out from session_transcript st where st.transcript_id=p_id and st.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','goal','id',g2.id,'title',g2.title,'body_md',g2.description,
           'why',g2.why,'value_pillar',g2.value_pillar,'target_date',g2.target_date,'priority',g2.priority,
           'status',g2.status,'version',g2.version,'created_at',g2.created_at,'updated_at',g2.updated_at)
    into v_out from goals g2 where g2.id=p_id and (g2.cid=v_cid or g2.tenant_id = any(v_lbl));
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','document','id',dr.id,'title',dr.filename,'doc_id',dr.doc_id,
           'category',dr.category,'install_version',dr.install_version,'drift',dr.drift,
           'install_sha256',dr.install_sha256,'observed_sha256',dr.observed_sha256,
           'last_checked',dr.last_checked,'created_at',dr.created_at)
    into v_out from document_registry dr where dr.id=p_id and dr.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','world_item','id',wi.id,'title',wi.title,'body_md',wi.body,
           'item_type',wi.item_type,'domain_key',wi.domain_key,'occurred_at',wi.occurred_at,'source',wi.source,'confidence',wi.confidence,'synthetic',wi.synthetic,
           'provenance',wi.provenance,'provenance_refs',wi.provenance_refs,
           'first_seen',wi.first_seen,'created_at',wi.created_at,'updated_at',wi.updated_at)
    into v_out from world_items wi where wi.id=p_id and wi.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  select jsonb_build_object('register','source','id',ws.id,'title',ws.label,'kind',ws.kind,'scope',ws.scope,
           'connected_at',ws.connected_at,'last_wave',ws.last_wave,'last_mined_at',ws.last_mined_at,
           'meta',ws.meta,'created_at',ws.created_at,
           'claims_from_source',(select count(*) from world_claims c3 where c3.source_id=ws.id and c3.cid=v_cid))
    into v_out from world_sources ws where ws.id=p_id and ws.cid=v_cid;
  if v_out is not null then return jsonb_build_object('ok',true,'found',true,'item',v_out); end if;

  return jsonb_build_object('ok',true,'found',false,'id',p_id,
    'registers_searched', jsonb_build_array('memory','claim','entity','edge','narrative','open_loop','rule',
      'blueprint','decision','signal','comm','office_record','probe_run','work_item','bulletin','session',
      'session_transcript','goal','document','world_item','source'),
    'human','Nothing of yours has that id. All 21 registers were searched. It may belong to another client, or it may have been superseded.');
end $function$;

-- 6. cob_search
CREATE OR REPLACE FUNCTION public.cob_search(p_cid text, p_q text, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_cid text; v_lim int; v_hits jsonb; v_extra jsonb;
begin
  v_cid := public.cob_guard(p_cid);
  if coalesce(btrim(p_q),'') = '' then
    raise exception 'COB_SEARCH_NEEDS_WORDS: give me something to look for' using errcode='22023'; end if;
  v_lim := greatest(1, least(coalesce(p_limit,25), 100));

  -- The registers world_search_v1 already covers: storyline, memory, claims, loops.
  select coalesce(jsonb_agg(jsonb_build_object(
           'register', s.register, 'id', s.rid, 'lane', s.lane, 'title', s.title,
           'snippet', s.snippet, 'score', round(s.rank::numeric,3)) order by s.rank desc), '[]'::jsonb)
    into v_hits
  from public.world_search_v1(v_cid, p_q, v_lim) s;

  -- The ones it does not: standing rules, blueprints, and the world_items shelf.
  select coalesce(jsonb_agg(x order by (x->>'score')::numeric desc), '[]'::jsonb) into v_extra from (
    select * from (
      select jsonb_build_object('register','rule','id',d.id,'lane',null,
               'title', coalesce(d.title, left(d.text,70)), 'snippet', left(d.text,240),
               'governs', d.status='active', 'status', d.status,
               'score', round(public.cob_text_overlap(d.text, p_q)::numeric,3)) x
      from directives d
      where (d.tenant_id = any(public.cob_tenant_labels(v_cid)) or d.cid = v_cid)
        and d.status <> 'retired' and public.cob_text_overlap(d.text, p_q) > 0.20
      union all
      select jsonb_build_object('register','blueprint','id',b.id,'lane',b.title,
               'title', b.title, 'snippet', left(coalesce(b.intent,''),240),
               'status', b.status, 'version', b.version,
               'score', round(public.cob_text_overlap(coalesce(b.title,'')||' '||coalesce(b.intent,''), p_q)::numeric,3)) x
      from blueprints b
      where b.tenant_id = any(public.cob_tenant_labels(v_cid))
        and public.cob_text_overlap(coalesce(b.title,'')||' '||coalesce(b.intent,''), p_q) > 0.20
      union all
      select jsonb_build_object('register','world_item','id',wi.id,'lane',wi.domain_key,
               'title', wi.title, 'snippet', left(coalesce(wi.body,''),240),
               'item_type', wi.item_type, 'sensitivity', wi.sensitivity,
               'occurred_at', wi.occurred_at,
               'score', round(greatest(
                   public.cob_text_overlap(coalesce(wi.title,''), p_q),
                   public.cob_text_overlap(coalesce(wi.title,'')||' '||coalesce(wi.body,''), p_q))::numeric,3)) x
      from world_items wi
      where wi.cid = v_cid and wi.synthetic = false
        and greatest(
              public.cob_text_overlap(coalesce(wi.title,''), p_q),
              public.cob_text_overlap(coalesce(wi.title,'')||' '||coalesce(wi.body,''), p_q)) > 0.20
    ) y0
    order by (y0.x->>'score')::numeric desc
    limit v_lim
  ) y;

  return jsonb_build_object('ok',true,'cid',v_cid,'query',p_q,
    'hits', v_hits || v_extra,
    'counts', jsonb_build_object('total', jsonb_array_length(v_hits) + jsonb_array_length(v_extra),
                                 'limit', v_lim),
    'how_it_looked', 'Exact words first, then loosened words, then closest by meaning when the words find little. Meaning only fires where this client has embeddings on file.',
    'next', 'Every hit carries a register and an id. Call fetch with that id to read the whole thing.');
end $function$;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='world_items' and column_name='domain_key') then
    raise exception 'verification failed: world_items.domain_key missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='world_items' and column_name='occurred_at') then
    raise exception 'verification failed: world_items.occurred_at missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='domain_taxonomy' and column_name='keywords') then
    raise exception 'verification failed: domain_taxonomy.keywords missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='item_domain' and column_name='world_item_id') then
    raise exception 'verification failed: item_domain.world_item_id missing';
  end if;
  if not exists (select 1 from pg_proc
                 where proname='tg_change_ledger' and pronamespace='public'::regnamespace
                   and pg_get_functiondef(oid) like '%tenancy%') then
    raise exception 'verification failed: tg_change_ledger does not set tenancy';
  end if;
end $$;

commit;
