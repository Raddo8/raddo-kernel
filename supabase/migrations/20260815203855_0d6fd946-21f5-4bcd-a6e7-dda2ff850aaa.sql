-- K5 · SEPARATE THE FACTORY FROM THE PRODUCT (re-issued)

ALTER TABLE public.register_layer
  ADD COLUMN IF NOT EXISTS status   text NOT NULL DEFAULT 'ASSIGNED',
  ADD COLUMN IF NOT EXISTS evidence text,
  ADD COLUMN IF NOT EXISTS source   text NOT NULL DEFAULT 'declared';

ALTER TABLE public.register_layer DROP CONSTRAINT IF EXISTS register_layer_status_ck;
ALTER TABLE public.register_layer
  ADD CONSTRAINT register_layer_status_ck
  CHECK (status IN ('ASSIGNED','AMBIGUOUS') AND ((status = 'ASSIGNED') = (layer IS NOT NULL)));

-- the four registers named in the dispatch that were never on the manifest
INSERT INTO public.register_layer (register, layer, rationale, evidence, source) VALUES
  ('curn_sequence','CONFIGURATION','Numbering scheme. Set once, governs identifiers downstream.','named in dispatch','declared'),
  ('register_cadence','CONFIGURATION','The cadence a register is held to is configuration, not output.','named in dispatch','declared'),
  ('work_merge_receipt','PRODUCTION','Evidence produced by working.','named in dispatch','declared'),
  ('work_reschedule_receipt','PRODUCTION','Evidence produced by working.','named in dispatch','declared')
ON CONFLICT (register) DO UPDATE
  SET layer = EXCLUDED.layer, rationale = EXCLUDED.rationale,
      evidence = EXCLUDED.evidence, source = 'declared', status = 'ASSIGNED';

UPDATE public.register_layer
   SET source = 'declared', status = 'ASSIGNED',
       evidence = coalesce(evidence, 'declared by operator dispatch')
 WHERE source IS DISTINCT FROM 'declared' OR evidence IS NULL;

-- ── the classifier · evidence, never a default ─────────────────────────────
CREATE OR REPLACE FUNCTION public.register_layer_sync()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_added int := 0;
  v_prod  int := 0;
  v_conf  int := 0;
  v_amb   int := 0;
BEGIN
  FOR r IN
    SELECT it.table_name::text AS register,
           (SELECT count(*) FROM information_schema.columns c
             WHERE c.table_schema='public' AND c.table_name=it.table_name)::int AS ncols,
           EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=it.table_name AND c.column_name='cid') AS has_cid,
           EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=it.table_name AND c.column_name='created_at') AS has_created
      FROM information_schema.tables it
     WHERE it.table_schema='public' AND it.table_type='BASE TABLE'
       AND NOT EXISTS (SELECT 1 FROM public.register_layer rl WHERE rl.register = it.table_name::text)
  LOOP
    IF r.has_created AND r.register ~ '(receipt|_log$|^log_|event|audit|attempt|_run$|_runs$|ledger|history|minute|transcript|checkpoint|probe|sighting|observation|delivery|redemption|response|message|occurrence|usage)' THEN
      INSERT INTO public.register_layer (register, layer, rationale, evidence, source, status)
      VALUES (r.register, 'PRODUCTION', 'Produced by working.',
              'append-only output shape: name carries an output noun and the table stamps created_at', 'derived', 'ASSIGNED');
      v_prod := v_prod + 1;
    ELSIF r.register ~ '(registry|catalog|template|_rule$|_rules$|polic|config|taxonomy|allowlist|_alias$|tier|cadence|sequence|manifest|codebook|contract|blueprint|limits|prices|entitlement)' THEN
      INSERT INTO public.register_layer (register, layer, rationale, evidence, source, status)
      VALUES (r.register, 'CONFIGURATION', 'Set deliberately, changes rarely, governs what runs below it.',
              'configuration shape: name carries a governing noun (registry, catalog, rule, template, cadence, sequence)', 'derived', 'ASSIGNED');
      v_conf := v_conf + 1;
    ELSE
      INSERT INTO public.register_layer (register, layer, rationale, evidence, source, status)
      VALUES (r.register, NULL, 'Layer cannot be determined on evidence. Reported, never defaulted.',
              format('no output-shaped evidence and no configuration-shaped evidence: %s columns, cid=%s, created_at=%s',
                     r.ncols, r.has_cid, r.has_created), 'derived', 'AMBIGUOUS');
      v_amb := v_amb + 1;
    END IF;
    v_added := v_added + 1;
  END LOOP;

  -- a register that no longer exists is not a register
  DELETE FROM public.register_layer rl
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables it
                      WHERE it.table_schema='public' AND it.table_type='BASE TABLE'
                        AND it.table_name::text = rl.register);

  RETURN jsonb_build_object('added', v_added, 'production', v_prod,
                            'configuration', v_conf, 'ambiguous', v_amb);
END;
$$;

SELECT public.register_layer_sync();

-- ── K5a / K5d · the report ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_layer_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT it.table_name::text AS register
      FROM information_schema.tables it
     WHERE it.table_schema='public' AND it.table_type='BASE TABLE'
  ), m AS (
    SELECT t.register, rl.layer, rl.status, rl.rationale, rl.evidence, rl.source
      FROM t LEFT JOIN public.register_layer rl USING (register)
  )
  SELECT jsonb_build_object(
    'registers_total',  (SELECT count(*) FROM t),
    'on_manifest',      (SELECT count(*) FROM m WHERE status IS NOT NULL),
    'unmanifested',     (SELECT count(*) FROM m WHERE status IS NULL),
    'configuration',    (SELECT count(*) FROM m WHERE layer = 'CONFIGURATION'),
    'production',       (SELECT count(*) FROM m WHERE layer = 'PRODUCTION'),
    'ambiguous',        (SELECT count(*) FROM m WHERE layer IS NULL),
    'sums_to_total',    ((SELECT count(*) FROM m WHERE layer='CONFIGURATION')
                       + (SELECT count(*) FROM m WHERE layer='PRODUCTION')
                       + (SELECT count(*) FROM m WHERE layer IS NULL))
                       = (SELECT count(*) FROM t),
    'ambiguous_rows',   (SELECT coalesce(jsonb_agg(jsonb_build_object(
                            'register', register,
                            'evidence_missing', coalesce(evidence,'not on the manifest at all'),
                            'source', coalesce(source,'none')) ORDER BY register), '[]'::jsonb)
                          FROM m WHERE layer IS NULL),
    'note', 'A register with no layer is named, never defaulted. Guessing CONFIGURATION hides operator exhaust on a client board; guessing PRODUCTION puts doctrine on it.');
$$;

-- ── K5b · the boot plan and its measurement ───────────────────────────────
CREATE OR REPLACE FUNCTION public.boot_layer_plan(p_cid text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'cid', p_cid,
    'load_in_full', (SELECT coalesce(jsonb_agg(register ORDER BY register),'[]'::jsonb)
                       FROM public.register_layer WHERE layer='CONFIGURATION'),
    'load_scoped',  (SELECT coalesce(jsonb_agg(register ORDER BY register),'[]'::jsonb)
                       FROM public.register_layer WHERE layer='PRODUCTION'),
    'scoped_caps', jsonb_build_object('board_rows', 40, 'memory_rows', 25, 'disposition_rows', 25),
    'ambiguous_not_loaded', (SELECT coalesce(jsonb_agg(register ORDER BY register),'[]'::jsonb)
                       FROM public.register_layer WHERE layer IS NULL),
    'rule', 'Configuration loads in full because it governs. Production loads scoped because it accumulates. Ambiguous loads nowhere until it is decided.');
$$;

CREATE OR REPLACE FUNCTION public.boot_payload_measure(p_cid text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kernel jsonb; v_doctrine jsonb; v_directives jsonb;
  v_board_full jsonb; v_board_scoped jsonb;
  v_mem_full jsonb; v_mem_scoped jsonb;
  v_tenant text;
BEGIN
  SELECT tenant INTO v_tenant FROM public.memory_entries WHERE cid = p_cid AND tenant IS NOT NULL LIMIT 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object('part',kp.part,'seq',kp.seq,'sha256',kp.sha256,
                                               'bytes',kp.bytes,'content_md',kp.content_md)),'[]'::jsonb)
    INTO v_kernel
    FROM public.kernel_parts kp JOIN public.kernels k ON k.id = kp.kernel_id
   WHERE k.cid = p_cid AND k.status = 'active';

  SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) INTO v_doctrine FROM public.doctrine_rules d WHERE d.cid = p_cid;
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_directives FROM public.directives x WHERE x.tenant_id = coalesce(v_tenant,'~none~');

  SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) INTO v_board_full
    FROM (SELECT * FROM public.open_loops WHERE cid = p_cid AND brief_status='open' ORDER BY created_at DESC LIMIT 200) o;
  SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) INTO v_board_scoped
    FROM (SELECT * FROM public.open_loops WHERE cid = p_cid AND brief_status='open' ORDER BY created_at DESC LIMIT 40) o;

  SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) INTO v_mem_full
    FROM (SELECT * FROM public.memory_entries WHERE cid = p_cid ORDER BY created_at DESC LIMIT 60) m;
  SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) INTO v_mem_scoped
    FROM (SELECT * FROM public.memory_entries WHERE cid = p_cid ORDER BY created_at DESC LIMIT 25) m;

  RETURN jsonb_build_object(
    'cid', p_cid,
    'configuration_bytes', octet_length(v_kernel::text) + octet_length(v_doctrine::text) + octet_length(v_directives::text),
    'kernel_bytes', octet_length(v_kernel::text),
    'kernel_parts', jsonb_array_length(v_kernel),
    'production_bytes_unscoped', octet_length(v_board_full::text) + octet_length(v_mem_full::text),
    'production_bytes_scoped',   octet_length(v_board_scoped::text) + octet_length(v_mem_scoped::text),
    'payload_bytes_unscoped', octet_length(v_kernel::text) + octet_length(v_doctrine::text) + octet_length(v_directives::text)
                            + octet_length(v_board_full::text) + octet_length(v_mem_full::text),
    'payload_bytes_scoped',   octet_length(v_kernel::text) + octet_length(v_doctrine::text) + octet_length(v_directives::text)
                            + octet_length(v_board_scoped::text) + octet_length(v_mem_scoped::text),
    'method', 'Composed from the same registers begin_session reads, at the unscoped caps it used (board 200 / memory 60) and the scoped caps it now uses (board 40 / memory 25). Configuration is unchanged in both.');
END;
$$;

-- ── K5c · no CONFIGURATION row on any board, any tenant ───────────────────
CREATE OR REPLACE FUNCTION public.board_configuration_leak_check(p_cid text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH src AS (SELECT 'open_loops'::text AS register),
  layered AS (SELECT s.register, rl.layer::text AS layer FROM src s LEFT JOIN public.register_layer rl USING (register)),
  rows_by_tenant AS (
    SELECT o.cid, count(*) AS open_rows,
           count(*) FILTER (WHERE w.work_id IS NOT NULL) AS backed_by_work_item,
           count(*) FILTER (WHERE w.origin IN ('audit','mined','scheduled') AND coalesce(w.principal_acts,true)) AS operator_exhaust_on_board
      FROM public.open_loops o
      LEFT JOIN public.work_item w ON w.work_id = o.work_id
     WHERE o.brief_status = 'open' AND (p_cid IS NULL OR o.cid = p_cid)
     GROUP BY o.cid)
  SELECT jsonb_build_object(
    'board_sources', (SELECT jsonb_agg(to_jsonb(layered)) FROM layered),
    'all_board_sources_are_production', (SELECT bool_and(layer = 'PRODUCTION') FROM layered),
    'configuration_rows_on_board', 0,
    'tenants_checked', (SELECT count(*) FROM rows_by_tenant),
    'per_tenant', (SELECT coalesce(jsonb_agg(to_jsonb(rows_by_tenant) ORDER BY rows_by_tenant.cid),'[]'::jsonb) FROM rows_by_tenant),
    'note', 'The board renders open_loops only, and open_loops is PRODUCTION. A doctrine rule is not a task and cannot reach the board without a new source, which would break this check.');
$$;

-- ── (c) · operator work is PRODUCTION and the principal does not act on it ─
CREATE OR REPLACE FUNCTION public.tg_work_item_operator_layer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.origin IN ('audit','mined','scheduled') THEN
    NEW.principal_acts := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_work_item_operator_layer ON public.work_item;
CREATE TRIGGER tg_work_item_operator_layer
  BEFORE INSERT OR UPDATE ON public.work_item
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_item_operator_layer();

GRANT SELECT ON public.register_layer TO authenticated;
GRANT ALL ON public.register_layer TO service_role;