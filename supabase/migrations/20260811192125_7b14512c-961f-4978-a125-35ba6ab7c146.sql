-- ═══════════════════════════════════════════════════════════════════
-- HARDEN-04 · T1 · per-tenant timezone, IANA only
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS timezone text;
UPDATE public.tenants SET timezone = 'America/Chicago' WHERE timezone IS NULL;
ALTER TABLE public.tenants ALTER COLUMN timezone SET DEFAULT 'America/Chicago';
ALTER TABLE public.tenants ALTER COLUMN timezone SET NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_iana_timezone()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.timezone IS NULL OR btrim(NEW.timezone) = '' THEN
    RAISE EXCEPTION 'TIMEZONE_REQUIRED: a tenant must carry an IANA zone name, for example America/Chicago.'
      USING ERRCODE = '22023';
  END IF;
  IF position('/' in NEW.timezone) = 0
     OR NEW.timezone ~ '[+-][0-9]'
     OR NEW.timezone LIKE 'Etc/%'
     OR NEW.timezone LIKE 'posix/%' THEN
    RAISE EXCEPTION 'TIMEZONE_MUST_BE_IANA: % is a fixed offset or an abbreviation. A fixed offset is a daylight-saving bug on a delay. Use a region name such as America/Chicago.', NEW.timezone
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = NEW.timezone) THEN
    RAISE EXCEPTION 'TIMEZONE_UNKNOWN: % is not a known IANA zone name.', NEW.timezone
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenants_timezone_iana ON public.tenants;
CREATE TRIGGER tenants_timezone_iana
BEFORE INSERT OR UPDATE OF timezone ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.assert_iana_timezone();

CREATE OR REPLACE FUNCTION public.tenant_timezone(p_cid text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT t.timezone FROM tenants t WHERE t.cid = p_cid), 'America/Chicago')
$$;

-- Boundary renderer. Storage stays UTC; this is the pre-rendered local string.
CREATE OR REPLACE FUNCTION public.render_local(p_cid text, p_ts timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tz text; v_local text; v_date text; v_time text; v_abbrev text; v_prev text;
BEGIN
  IF p_ts IS NULL THEN RETURN NULL; END IF;
  v_tz := public.tenant_timezone(p_cid);
  v_prev := current_setting('TimeZone', true);
  PERFORM set_config('TimeZone', v_tz, true);
  v_local  := to_char(p_ts, 'YYYY-MM-DD HH24:MI:SS TZ');
  v_date   := to_char(p_ts, 'YYYY-MM-DD');
  v_time   := to_char(p_ts, 'HH24:MI');
  v_abbrev := to_char(p_ts, 'TZ');
  PERFORM set_config('TimeZone', coalesce(v_prev, 'UTC'), true);
  RETURN jsonb_build_object(
    'utc', to_char(p_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'local', v_local,
    'local_date', v_date,
    'local_time', v_time,
    'zone', v_tz,
    'zone_abbrev', v_abbrev
  );
END $$;

CREATE OR REPLACE FUNCTION public.tenant_clock(p_cid text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.render_local(p_cid, now()) || jsonb_build_object('cid', p_cid)
$$;

GRANT EXECUTE ON FUNCTION public.tenant_timezone(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.render_local(text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_clock(text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════
-- HARDEN-04 · T2 · tenant_session_context gets a governed writer
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.tenant_session_context ALTER COLUMN auth_user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.open_session_context(
  p_session_id text,
  p_cid text,
  p_auth_user_id uuid DEFAULT NULL,
  p_source text DEFAULT 'connector',
  p_ttl interval DEFAULT interval '12 hours'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_exp timestamptz;
BEGIN
  IF p_session_id IS NULL OR btrim(p_session_id) = '' THEN
    RAISE EXCEPTION 'SESSION_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;
  PERFORM public.cob_guard(p_cid);
  v_uid := coalesce(
    p_auth_user_id,
    auth.uid(),
    (SELECT tm.auth_user_id FROM tenant_members tm
      WHERE tm.cid = p_cid AND tm.status = 'ACTIVE'
      ORDER BY tm.auth_user_id LIMIT 1)
  );
  v_exp := now() + coalesce(p_ttl, interval '12 hours');

  INSERT INTO tenant_session_context (session_id, auth_user_id, cid, source, established_at, expires_at)
  VALUES (p_session_id, v_uid, p_cid, coalesce(p_source, 'connector'), now(), v_exp)
  ON CONFLICT (session_id) DO UPDATE
    SET cid = EXCLUDED.cid,
        auth_user_id = coalesce(EXCLUDED.auth_user_id, tenant_session_context.auth_user_id),
        source = EXCLUDED.source,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL;

  RETURN jsonb_build_object('session_id', p_session_id, 'cid', p_cid,
                            'auth_user_id', v_uid, 'expires_at', v_exp);
END $$;

CREATE OR REPLACE FUNCTION public.close_session_context(p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  UPDATE tenant_session_context SET revoked_at = now()
   WHERE session_id = p_session_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('session_id', p_session_id, 'revoked', v_n);
END $$;

CREATE OR REPLACE FUNCTION public.session_context_purge()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  DELETE FROM tenant_session_context
   WHERE (expires_at IS NOT NULL AND expires_at < now() - interval '7 days')
      OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

GRANT EXECUTE ON FUNCTION public.open_session_context(text, text, uuid, text, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_session_context(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.session_context_purge() TO service_role;

-- session_event.session_id resolves from the context substrate.
CREATE OR REPLACE FUNCTION public.session_id_for_context(p_session_id text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN c.session_id ~ '^[0-9a-fA-F-]{36}$' THEN c.session_id::uuid ELSE NULL END
    FROM tenant_session_context c
   WHERE c.session_id = p_session_id
     AND c.revoked_at IS NULL
     AND (c.expires_at IS NULL OR c.expires_at > now())
$$;
GRANT EXECUTE ON FUNCTION public.session_id_for_context(text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════
-- HARDEN-04 · T3 · doctrine provenance and the only-governed-writer law
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.doctrine_amendments
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'GOVERNED';

ALTER TABLE public.doctrine_amendments DROP CONSTRAINT IF EXISTS doctrine_amendments_action_check;
ALTER TABLE public.doctrine_amendments ADD CONSTRAINT doctrine_amendments_action_check
  CHECK (action = ANY (ARRAY['PROPOSE','RATIFY','AMEND','HARDEN','RELAX','RETIRE','PUBLISH','BACKFILL']));

INSERT INTO public.doctrine_amendments
  (action, rule_key, from_tier, to_tier, from_version, to_version, actor, reason, receipt, provenance, at)
SELECT 'BACKFILL', r.rule_key, NULL, r.tier, NULL, r.version,
       'UNKNOWN_LEGACY', 'UNKNOWN_LEGACY: this rule entered doctrine_rules before a governed writer existed. No actor and no reason were recorded at the time and none are invented here.',
       NULL, 'UNKNOWN_LEGACY', r.added_at
  FROM public.doctrine_rules r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.doctrine_amendments a
    WHERE a.rule_key = r.rule_key AND a.to_version = r.version
 );

CREATE OR REPLACE FUNCTION public.doctrine_rules_governed_writer_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('cob.doctrine_writer', true), '') <> 'on' THEN
    RAISE EXCEPTION 'DOCTRINE_GOVERNED_WRITER_ONLY: doctrine_rules is written only by propose_doctrine_rule, ratify_doctrine_rule or amend_doctrine_rule. A direct % was refused so every rule keeps an actor, a reason and a version trail.', TG_OP
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS doctrine_rules_writer_law ON public.doctrine_rules;
CREATE TRIGGER doctrine_rules_writer_law
BEFORE INSERT OR UPDATE ON public.doctrine_rules
FOR EACH ROW EXECUTE FUNCTION public.doctrine_rules_governed_writer_only();

REVOKE INSERT, UPDATE, DELETE ON public.doctrine_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.doctrine_rules TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.propose_doctrine_rule(
  p_tier integer, p_rule_key text, p_rule_text text, p_source text, p_actor text,
  p_scope text DEFAULT 'FLEET'::text, p_cid text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_id uuid; v_v int;
begin
  perform admin_guard();
  perform set_config('cob.doctrine_writer','on',true);
  select coalesce(max(version),0)+1 into v_v from doctrine_rules where rule_key=p_rule_key;
  insert into doctrine_rules (tier, rule_key, rule_text, scope, cid, status, source, version)
  values (p_tier, p_rule_key, p_rule_text, p_scope, p_cid, 'DRAFT', p_source, v_v)
  returning rule_id into v_id;
  insert into doctrine_amendments (action, rule_key, to_tier, to_version, actor, reason, provenance)
  values ('PROPOSE', p_rule_key, p_tier, v_v, p_actor, 'proposed: '||left(p_rule_text,120), 'GOVERNED');
  perform set_config('cob.doctrine_writer','off',true);
  return jsonb_build_object('rule_id',v_id,'rule_key',p_rule_key,'version',v_v,'status','DRAFT',
    'note','DRAFT grants nothing. It governs only after ratify_doctrine_rule.');
end $$;

CREATE OR REPLACE FUNCTION public.ratify_doctrine_rule(
  p_rule_key text, p_version integer, p_ratified_by text, p_receipt text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_tier int; v_prior int;
begin
  perform admin_guard();
  if p_ratified_by is null or p_receipt is null then
    raise exception 'RATIFICATION_REQUIRES_A_HUMAN_AND_A_RECEIPT' using errcode='42501'; end if;
  perform set_config('cob.doctrine_writer','on',true);
  update doctrine_rules set status='SUPERSEDED'
    where rule_key=p_rule_key and status='ACTIVE' returning version into v_prior;
  update doctrine_rules
     set status='ACTIVE', ratified_by=p_ratified_by, ratified_at=now(), ratification_receipt=p_receipt
   where rule_key=p_rule_key and version=p_version and status='DRAFT'
   returning tier into v_tier;
  if v_tier is null then raise exception 'NO_DRAFT_AT_THAT_VERSION: % v%', p_rule_key, p_version; end if;
  insert into doctrine_amendments (action, rule_key, to_tier, from_version, to_version, actor, reason, receipt, provenance)
  values ('RATIFY', p_rule_key, v_tier, v_prior, p_version, p_ratified_by, 'ratified into force', p_receipt, 'GOVERNED');
  insert into doctrine_publications (published_by, rule_count, tier0_count, corpus_sha256, corpus, note)
  select p_ratified_by,
         count(*)::int,
         count(*) filter (where tier = 0)::int,
         encode(sha256(convert_to(coalesce(string_agg(rule_key||':'||version||':'||rule_text, E'\n' order by rule_key), ''), 'UTF8')), 'hex'),
         coalesce(jsonb_agg(jsonb_build_object('rule_key',rule_key,'version',version,'tier',tier,'text',rule_text) order by rule_key), '[]'::jsonb),
         'published on ratification of '||p_rule_key||' v'||p_version
    from doctrine_rules where status='ACTIVE';
  perform set_config('cob.doctrine_writer','off',true);
  return jsonb_build_object('rule_key',p_rule_key,'version',p_version,'tier',v_tier,'status','ACTIVE',
    'superseded_version',v_prior,'ratified_by',p_ratified_by);
end $$;

CREATE OR REPLACE FUNCTION public.amend_doctrine_rule(
  p_rule_key text, p_new_text text, p_actor text, p_reason text, p_receipt text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_tier int; v_old int; v_new int; v_src text;
begin
  perform admin_guard();
  select tier, version, source into v_tier, v_old, v_src
    from doctrine_rules where rule_key=p_rule_key and status='ACTIVE';
  if v_tier is null then raise exception 'NO_ACTIVE_RULE: %', p_rule_key; end if;
  if v_tier = 0 and p_receipt is null then
    raise exception 'TIER0_AMENDMENT_REQUIRES_A_RECEIPT: a company bylaw is not amended without a signed reason.'
      using errcode='42501'; end if;
  v_new := v_old + 1;
  perform set_config('cob.doctrine_writer','on',true);
  if v_tier <> 0 then
    update doctrine_rules set status='SUPERSEDED' where rule_key=p_rule_key and version=v_old;
  end if;
  insert into doctrine_rules (tier, rule_key, rule_text, status, source, version, change_reason,
                              ratified_by, ratified_at, ratification_receipt)
  values (v_tier, p_rule_key, p_new_text, case when v_tier=0 then 'DRAFT' else 'ACTIVE' end,
          v_src, v_new, p_reason,
          case when v_tier=0 then null else p_actor end,
          case when v_tier=0 then null else now() end,
          case when v_tier=0 then null else p_receipt end);
  insert into doctrine_amendments (action, rule_key, from_tier, to_tier, from_version, to_version, actor, reason, receipt, provenance)
  values ('AMEND', p_rule_key, v_tier, v_tier, v_old, v_new, p_actor, p_reason, p_receipt, 'GOVERNED');
  perform set_config('cob.doctrine_writer','off',true);
  return jsonb_build_object('rule_key',p_rule_key,'from_version',v_old,'to_version',v_new,'tier',v_tier,
    'status', case when v_tier=0 then 'DRAFT — a bylaw amendment must be ratified before it governs' else 'ACTIVE' end);
end $$;

-- T6 · fleet authority resolvable from a client identifier, because the
-- connector reaches the database as service_role with no auth.uid().
CREATE OR REPLACE FUNCTION public.is_fleet_operator_cid(p_cid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members tm
      JOIN fleet_operators fo ON fo.auth_user_id = tm.auth_user_id
     WHERE tm.cid = p_cid AND tm.status = 'ACTIVE' AND fo.status = 'ACTIVE'
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_fleet_operator_cid(text) TO service_role, authenticated;

-- The connector's governed FLEET path: authority checked by cid, then the
-- same governed writer runs. Never bypasses doctrine_amendments.
CREATE OR REPLACE FUNCTION public.propose_doctrine_rule_as_cid(
  p_cid text, p_rule_key text, p_rule_text text, p_reason text DEFAULT NULL, p_tier integer DEFAULT 2)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_id uuid; v_v int;
begin
  perform public.cob_guard(p_cid);
  if not public.is_fleet_operator_cid(p_cid) then
    raise exception 'COB_RULE_FLEET_REQUIRES_OPERATOR: a fleet rule binds every client, so only an active fleet operator can write one. Nothing was written.'
      using errcode='42501';
  end if;
  perform set_config('cob.doctrine_writer','on',true);
  select coalesce(max(version),0)+1 into v_v from doctrine_rules where rule_key=p_rule_key;
  insert into doctrine_rules (tier, rule_key, rule_text, scope, cid, status, source, version)
  values (coalesce(p_tier,2), p_rule_key, p_rule_text, 'FLEET', NULL, 'DRAFT', 'connector:rule_write', v_v)
  returning rule_id into v_id;
  insert into doctrine_amendments (action, rule_key, to_tier, to_version, actor, reason, provenance)
  values ('PROPOSE', p_rule_key, coalesce(p_tier,2), v_v, 'connector:'||p_cid,
          coalesce(p_reason, 'proposed: '||left(p_rule_text,120)), 'GOVERNED');
  perform set_config('cob.doctrine_writer','off',true);
  return jsonb_build_object('rule_id',v_id,'rule_key',p_rule_key,'version',v_v,'status','DRAFT',
    'scope','FLEET',
    'note','DRAFT grants nothing. It governs only after ratify_doctrine_rule.');
end $$;
GRANT EXECUTE ON FUNCTION public.propose_doctrine_rule_as_cid(text, text, text, text, integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════
-- HARDEN-04 · T4 · cid_t applied to every tenant-scoped cid column
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cid_t_apply_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  applied boolean NOT NULL,
  detail text,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cid_t_apply_log TO authenticated, service_role;
ALTER TABLE public.cid_t_apply_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet operators read cid_t apply log"
  ON public.cid_t_apply_log FOR SELECT TO authenticated
  USING (public.is_fleet_operator());

DO $do$
DECLARE r record; v_bad bigint;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND c.column_name = 'cid'
       AND c.udt_name = 'text' AND t.table_type = 'BASE TABLE'
     ORDER BY c.table_name
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE cid IS NOT NULL AND cid !~ ''^CID-[0-9]{6}$''', r.table_name) INTO v_bad;
      IF v_bad > 0 THEN
        INSERT INTO public.cid_t_apply_log(table_name, applied, detail)
        VALUES (r.table_name, false, format('%s rows hold a non-conforming cid; left as text', v_bad));
        CONTINUE;
      END IF;
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN cid TYPE public.cid_t', r.table_name);
      INSERT INTO public.cid_t_apply_log(table_name, applied, detail) VALUES (r.table_name, true, 'cid_t applied');
    EXCEPTION WHEN others THEN
      INSERT INTO public.cid_t_apply_log(table_name, applied, detail) VALUES (r.table_name, false, SQLERRM);
    END;
  END LOOP;
END $do$;