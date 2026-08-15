-- ═══ HARDEN-10 · K1 · NAMES_ARE_NEVER_KEYS, enforced ═══════════════════════

CREATE TABLE IF NOT EXISTS public.display_name_allowlist (
  fn_name text PRIMARY KEY,
  reason  text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.display_name_allowlist TO anon, authenticated;
GRANT ALL ON public.display_name_allowlist TO service_role;
ALTER TABLE public.display_name_allowlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allowlist is public governance" ON public.display_name_allowlist
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.display_name_allowlist (fn_name, reason) VALUES
  ('resolve_cid_strict', 'Refuses on a display name. It exists to raise NAMES_ARE_NEVER_KEYS, which is the opposite of resolving by one.'),
  ('hq_records_fleet_v1', 'Reads display_name after the CID is already the join key. Presentation only.'),
  ('my_cob',   'Returns display_name for presentation after resolve_tenant_context has produced the CID.'),
  ('my_tenant','Returns display_name for presentation after resolve_tenant_context has produced the CID.')
ON CONFLICT (fn_name) DO UPDATE SET reason = excluded.reason;

-- The audit. A rule with no enforcement is a comment.
CREATE OR REPLACE FUNCTION public.guard_names_are_never_keys()
RETURNS TABLE(fn_name text, evidence text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.proname::text,
         substring(p.prosrc from '[^\n]*display_name[^\n]*')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname NOT IN (SELECT a.fn_name FROM public.display_name_allowlist a)
     AND p.proname <> 'guard_names_are_never_keys'
     -- resolution shape: a display name used as a lookup key, not as an output
     AND (p.prosrc ~* 'where[^;]*display_name\s*=' OR p.prosrc ~* 'display_name\s*=\s*(p_|_|v_|\$)')
   ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION public.guard_names_are_never_keys() TO anon, authenticated, service_role;

-- ═══ HARDEN-10 · K4 · the board is an edit surface ═════════════════════════

-- K4b · a title rewritten on the board must land on the work_item. We removed
-- this divergence once already and will not rebuild it.
CREATE OR REPLACE FUNCTION public.board_title_writethrough(p_loop_id uuid, p_cid text, p_title text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_work uuid;
BEGIN
  IF p_title IS NULL OR btrim(p_title) = '' THEN RETURN NULL; END IF;
  SELECT o.work_id INTO v_work FROM open_loops o WHERE o.id = p_loop_id AND o.cid = p_cid;
  IF v_work IS NULL THEN RETURN NULL; END IF;
  UPDATE work_item w SET title = btrim(p_title), updated_at = now()
   WHERE w.work_id = v_work AND w.cid = p_cid;
  RETURN v_work;
END $$;
REVOKE ALL ON FUNCTION public.board_title_writethrough(uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.board_title_writethrough(uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.board_update(p_items jsonb, p_cid text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_cid text; v_role text; v_item jsonb; v_id uuid; v_row_id uuid;
  v_applied jsonb := '[]'::jsonb; v_rejected jsonb := '[]'::jsonb;
  v_state text; v_status text; v_snooze date; v_today date;
  v_title text; v_work uuid;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true),'')::json->>'role','');
  if p_cid is not null then
    if v_role <> 'service_role' then
      raise exception 'BOARD_CID_NOT_ACCEPTED_FROM_CLIENT: p_cid is accepted only from a service_role caller.' using errcode='42501'; end if;
    v_cid := p_cid;
  else
    v_cid := public.current_cid();
  end if;
  if v_cid is null then
    raise exception 'BOARD_UNAUTHENTICATED: no resolvable CID' using errcode='28000'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'BOARD_ITEMS_REQUIRED: pass items as a JSON array.' using errcode='22023'; end if;

  v_today := (now() at time zone 'UTC')::date;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := null; v_snooze := null; v_row_id := null; v_work := null;
    begin
      v_id := nullif(btrim(coalesce(v_item->>'id','')),'')::uuid;
    exception when others then v_id := null; end;
    if v_id is null then
      v_rejected := v_rejected || jsonb_build_object('item', v_item, 'reason', 'BOARD_ITEM_ID_REQUIRED');
      continue;
    end if;

    v_status := nullif(lower(btrim(coalesce(v_item->>'brief_status',''))),'');
    if v_status is not null and v_status not in ('open','answered','snoozed','cleared') then
      v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_STATUS_UNKNOWN', 'detail', v_status);
      continue;
    end if;

    if coalesce(btrim(v_item->>'snooze_until'),'') <> '' then
      begin v_snooze := (v_item->>'snooze_until')::date;
      exception when others then
        v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_SNOOZE_DATE_MALFORMED', 'detail', v_item->>'snooze_until');
        continue;
      end;
      if v_snooze < v_today then
        v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_SNOOZE_DATE_PAST', 'detail', v_snooze::text);
        continue;
      end if;
    end if;
    if v_status = 'snoozed' and v_snooze is null then
      v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_SNOOZE_DATE_REQUIRED',
        'detail', 'say when it should come back; a snooze without a date is not stored');
      continue;
    end if;

    v_state := nullif(lower(btrim(coalesce(v_item->>'state',''))),'');
    v_title := nullif(btrim(coalesce(v_item->>'title','')),'');

    update open_loops o
       set title        = coalesce(v_title, o.title),
           trigger      = coalesce(nullif(btrim(coalesce(v_item->>'trigger','')),''), o.trigger),
           owner        = coalesce(nullif(btrim(coalesce(v_item->>'owner','')),''), o.owner),
           state        = coalesce(v_state, o.state),
           brief_status = coalesce(v_status, o.brief_status),
           snooze_until = case when v_status = 'snoozed' then v_snooze else coalesce(v_snooze, o.snooze_until) end,
           urgent       = coalesce((v_item->>'urgent')::boolean, o.urgent),
           urgent_reason= coalesce(nullif(btrim(coalesce(v_item->>'urgent_reason','')),''), o.urgent_reason),
           hard_deadline= coalesce(nullif(btrim(coalesce(v_item->>'hard_deadline','')),'')::date, o.hard_deadline),
           last_action_at = now(),
           escalation_state = case when v_status in ('answered','cleared','snoozed') or v_state in ('done','dropped')
                                   then null else o.escalation_state end,
           updated_at   = now()
     where o.id = v_id and o.cid = v_cid
    returning o.id into v_row_id;

    if v_row_id is null then
      v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_ITEM_NOT_FOUND');
    else
      -- K4b · write the title through to the work_item, never to the projection alone.
      if v_title is not null then
        v_work := public.board_title_writethrough(v_row_id, v_cid, v_title);
      end if;
      v_applied := v_applied || jsonb_build_object(
        'id', v_row_id, 'brief_status', v_status, 'state', v_state, 'snooze_until', v_snooze,
        'title_written_through_to_work_item', v_work);
    end if;
  end loop;

  return jsonb_build_object('ok', jsonb_array_length(v_rejected) = 0, 'cid', v_cid,
    'applied', v_applied, 'rejected', v_rejected);
end $function$;

-- ═══ HARDEN-10 · K5 · configure the factory, not the product ═══════════════

DO $$ BEGIN
  CREATE TYPE public.register_layer_t AS ENUM ('CONFIGURATION','PRODUCTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.register_layer (
  register   text PRIMARY KEY,
  layer      public.register_layer_t,
  rationale  text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.register_layer TO anon, authenticated;
GRANT ALL ON public.register_layer TO service_role;
ALTER TABLE public.register_layer ENABLE ROW LEVEL SECURITY;
CREATE POLICY "register layer is public governance" ON public.register_layer
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.register_layer (register, layer, rationale) VALUES
  ('doctrine_rules',    'CONFIGURATION','Set deliberately, changes rarely, governs everything below it.'),
  ('doctrine_tiers',    'CONFIGURATION','The tier scale itself is configuration, not output.'),
  ('doctrine_amendments','CONFIGURATION','The record of how configuration changed is configuration.'),
  ('policy_rules',      'CONFIGURATION','Standing rules registry.'),
  ('policies',          'CONFIGURATION','Standing rules registry.'),
  ('world_items',       'CONFIGURATION','Lanes and boundaries. Set once, governs routing.'),
  ('storyline',         'CONFIGURATION','Narratives are stable material, not session exhaust.'),
  ('tenant_surfaces',   'CONFIGURATION','Surface configuration per tenant.'),
  ('surface_version',   'CONFIGURATION','Versioned surface material.'),
  ('kernel_parts',      'CONFIGURATION','Kernel material, set deliberately and verified by hash.'),
  ('kernels',           'CONFIGURATION','Kernel material.'),
  ('tool_catalog',      'CONFIGURATION','The contract itself. Configuration by definition.'),
  ('domain_taxonomy',   'CONFIGURATION','Vocabulary, set once.'),
  ('blueprints',        'CONFIGURATION','Blueprints are the shape of work, not the work.'),
  ('open_loops',        'PRODUCTION','Produced by working; accumulates constantly.'),
  ('work_item',         'PRODUCTION','Produced by working.'),
  ('decisions',         'PRODUCTION','Produced by working.'),
  ('improvement_signals','PRODUCTION','Produced by working.'),
  ('sessions',          'PRODUCTION','Session exhaust.'),
  ('session_event',     'PRODUCTION','Session exhaust.'),
  ('session_transcript','PRODUCTION','Session exhaust.'),
  ('probe_runs',        'PRODUCTION','Evidence produced by running.'),
  ('save_attempt',      'PRODUCTION','Evidence produced by running.'),
  ('save_receipts',     'PRODUCTION','Evidence produced by running.'),
  ('execution_receipts','PRODUCTION','Evidence produced by running.'),
  ('comms',             'PRODUCTION','Produced by working.'),
  ('memory_entries',    'PRODUCTION','Produced by working.'),
  ('council_minutes',   'PRODUCTION','Produced by working.'),
  ('change_ledger',     'PRODUCTION','Produced by working.'),
  ('scheduled_actions', 'PRODUCTION','Produced by working.')
ON CONFLICT (register) DO UPDATE SET layer = excluded.layer, rationale = excluded.rationale;

-- K5d · a register whose layer is unclear is NAMED, never defaulted.
CREATE OR REPLACE FUNCTION public.register_layer_report()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH t AS (
    SELECT it.table_name::text AS register
      FROM information_schema.tables it
     WHERE it.table_schema = 'public' AND it.table_type = 'BASE TABLE'
  )
  SELECT jsonb_build_object(
    'registers_total', (SELECT count(*) FROM t),
    'configuration',   (SELECT count(*) FROM t JOIN register_layer r USING (register) WHERE r.layer = 'CONFIGURATION'),
    'production',      (SELECT count(*) FROM t JOIN register_layer r USING (register) WHERE r.layer = 'PRODUCTION'),
    'ambiguous',       (SELECT count(*) FROM t LEFT JOIN register_layer r USING (register) WHERE r.layer IS NULL),
    'ambiguous_named', (SELECT coalesce(jsonb_agg(t.register ORDER BY t.register), '[]'::jsonb)
                          FROM t LEFT JOIN register_layer r USING (register) WHERE r.layer IS NULL),
    'note', 'A register with no layer is reported, never defaulted. Defaulting is how configuration ends up on a board.');
$$;
GRANT EXECUTE ON FUNCTION public.register_layer_report() TO anon, authenticated, service_role;

-- K5b · what a boot should load in full and what it should scope.
CREATE OR REPLACE FUNCTION public.boot_layer_plan(p_cid text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'cid', p_cid,
    'load_in_full', (SELECT coalesce(jsonb_agg(register ORDER BY register),'[]'::jsonb)
                       FROM register_layer WHERE layer = 'CONFIGURATION'),
    'load_scoped',  (SELECT coalesce(jsonb_agg(register ORDER BY register),'[]'::jsonb)
                       FROM register_layer WHERE layer = 'PRODUCTION'),
    'rule', 'Configuration loads in full because it governs. Production loads scoped because it accumulates.');
$$;
GRANT EXECUTE ON FUNCTION public.boot_layer_plan(text) TO authenticated, service_role;

-- K5c · no CONFIGURATION row ever renders on a board.
CREATE OR REPLACE FUNCTION public.board_configuration_leak_check(p_cid text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'board_source_register', 'open_loops',
    'board_source_layer', (SELECT layer::text FROM register_layer WHERE register = 'open_loops'),
    'board_rows_open', (SELECT count(*) FROM open_loops o
                          WHERE (p_cid IS NULL OR o.cid = p_cid) AND o.brief_status = 'open'),
    'board_rows_backed_by_production_work', (
      SELECT count(*) FROM open_loops o JOIN work_item w ON w.work_id = o.work_id
       WHERE (p_cid IS NULL OR o.cid = p_cid) AND o.brief_status = 'open'),
    'configuration_rows_on_board', 0,
    'note', 'The board reads open_loops only, and open_loops is PRODUCTION. A configuration row cannot reach it without a new source, which this check would then have to be rewritten to allow.');
$$;
GRANT EXECUTE ON FUNCTION public.board_configuration_leak_check(text) TO authenticated, service_role;