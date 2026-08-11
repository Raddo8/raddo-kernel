-- ── M1 · THE VERIFICATION GATE ────────────────────────────────────────────
CREATE TABLE public.probe_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL,
  subject_kind text NOT NULL,
  subject_ref text NOT NULL,
  claim text NOT NULL,
  method text NOT NULL,
  expected text NOT NULL,
  observed text NOT NULL,
  passed boolean NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  ran_by text NOT NULL,
  CONSTRAINT probe_runs_subject_kind_chk
    CHECK (subject_kind IN ('decision','migration','function','cron','register'))
);

CREATE INDEX probe_runs_cid_ran_at_idx ON public.probe_runs (cid, ran_at DESC);
CREATE INDEX probe_runs_subject_idx ON public.probe_runs (subject_kind, subject_ref);

GRANT SELECT ON public.probe_runs TO authenticated;
GRANT ALL ON public.probe_runs TO service_role;

ALTER TABLE public.probe_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "probe_runs readable within the tenant"
  ON public.probe_runs FOR SELECT TO authenticated
  USING (cid = public.current_cid());

-- ── Controlled vocabulary for verification_state ──────────────────────────
CREATE TABLE public.verification_state_alias (
  alias text PRIMARY KEY,
  canonical text NOT NULL
);

GRANT SELECT ON public.verification_state_alias TO authenticated;
GRANT ALL ON public.verification_state_alias TO service_role;
ALTER TABLE public.verification_state_alias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verification vocabulary is readable"
  ON public.verification_state_alias FOR SELECT TO authenticated USING (true);

INSERT INTO public.verification_state_alias (alias, canonical) VALUES
  ('unverified','unverified'),
  ('asserted','asserted'),
  ('claimed','asserted'),
  ('probe_passed','probe_passed'),
  ('probe-passed','probe_passed'),
  ('probe_failed','probe_failed'),
  ('probe-failed','probe_failed'),
  ('verified','verified'),
  ('unverified_legacy','unverified_legacy'),
  ('legacy','unverified_legacy');

CREATE OR REPLACE FUNCTION public.normalize_verification_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_in text; v_out text;
begin
  if new.verification_state is null then
    return new;
  end if;
  v_in := lower(btrim(new.verification_state));
  if v_in = '' then
    new.verification_state := null;
    return new;
  end if;
  select a.canonical into v_out from verification_state_alias a where a.alias = v_in;
  if v_out is null then
    raise exception 'VERIFICATION_STATE_UNMAPPED: "%" is not a known verification state. Canonical vocabulary: unverified|asserted|probe_passed|probe_failed|verified|unverified_legacy. Add an alias to public.verification_state_alias to accept a new synonym. Raised BEFORE any write.', new.verification_state
      using errcode = '22023';
  end if;
  new.verification_state := v_out;
  return new;
end $function$;

-- ── Backfill BEFORE the gate goes on, so history is labelled honestly ─────
UPDATE public.decisions SET verification_state = 'unverified_legacy'
WHERE verification_state IS NULL;

UPDATE public.improvement_signals SET verification_state = 'unverified_legacy'
WHERE verification_state IS NULL;

CREATE TRIGGER trg_normalize_verification_state_decisions
  BEFORE INSERT OR UPDATE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.normalize_verification_state();

CREATE TRIGGER trg_normalize_verification_state_signals
  BEFORE INSERT OR UPDATE ON public.improvement_signals
  FOR EACH ROW EXECUTE FUNCTION public.normalize_verification_state();

-- ── A completion claim must carry a passing probe ─────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_decision_completion_proof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_text text;
  v_word text;
  v_words text[] := array['executed','shipped','complete','completed','done','live','fixed','deployed'];
  v_hit text := null;
  v_probe_ok boolean := false;
  v_probe_id uuid;
begin
  v_text := lower(coalesce(new.title,'') || ' ' || coalesce(new.decision_md,''));

  foreach v_word in array v_words loop
    if v_text ~ ('\m' || v_word || '\M') then
      v_hit := v_word;
      exit;
    end if;
  end loop;

  if v_hit is null then
    return new;
  end if;

  if new.verification_state is null or new.verification_state not in ('probe_passed','verified') then
    raise exception 'DECISION_COMPLETION_UNPROVEN: this decision says "%" but carries verification_state %. A completion claim must be probe_passed or verified and must name a probe_runs row that passed. Run the probe, record it in public.probe_runs, then put its id in test_run_id.',
      v_hit, coalesce(new.verification_state,'null') using errcode = '22023';
  end if;

  begin
    v_probe_id := nullif(btrim(coalesce(new.test_run_id,'')),'')::uuid;
  exception when others then
    v_probe_id := null;
  end;

  if v_probe_id is null then
    raise exception 'DECISION_COMPLETION_UNPROVEN: this decision says "%" but test_run_id does not name a probe run. Record the probe in public.probe_runs and put its id in test_run_id.',
      v_hit using errcode = '22023';
  end if;

  select p.passed into v_probe_ok from probe_runs p where p.id = v_probe_id;

  if v_probe_ok is null then
    raise exception 'DECISION_COMPLETION_UNPROVEN: this decision says "%" and names probe run %, which does not exist.',
      v_hit, v_probe_id using errcode = '22023';
  end if;

  if v_probe_ok is false then
    raise exception 'DECISION_COMPLETION_UNPROVEN: this decision says "%" and names probe run %, which failed. A failed probe is not proof.',
      v_hit, v_probe_id using errcode = '22023';
  end if;

  return new;
end $function$;

CREATE TRIGGER trg_enforce_decision_completion_proof
  BEFORE INSERT OR UPDATE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_decision_completion_proof();