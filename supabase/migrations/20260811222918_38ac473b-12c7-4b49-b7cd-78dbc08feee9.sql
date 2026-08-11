
CREATE OR REPLACE FUNCTION public.record_fleet_write_denial(
  p_principal text, p_table text, p_identity jsonb, p_cid text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_key text; v_detail text; v_cid text;
BEGIN
  PERFORM set_config('cob.intel_writer', 'on', true);
  v_cid := coalesce(p_cid, 'CID-100001');

  v_key := regexp_replace(
             lower('fleet-write-denied:' || coalesce(p_principal,'unknown') || ':' || coalesce(p_table,'unknown')),
             '[^a-z0-9]+', '-', 'g');

  v_detail := format(
    'Principal %s attempted a FLEET write into public.%s and was refused. Identifying fields on the attempted row: %s. A fleet row binds every client, so only an active fleet operator may write one. Nothing was written.',
    coalesce(p_principal,'unknown'), coalesce(p_table,'unknown'), coalesce(p_identity::text, '{}'));

  SELECT id INTO v_id FROM public.improvement_signals
   WHERE cid = v_cid AND signal_key = v_key
   ORDER BY last_seen DESC NULLS LAST LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.improvement_signals(
      cid, curn, signal_key, pattern, recurrence, detail_md, audience, silent,
      status, first_seen, last_seen, provenance, authoritative,
      verification_state, sightings, source_subject, source_surface, tenancy)
    VALUES (
      v_cid, public.next_curn(v_cid, 'S'), v_key, 'fleet-write-denied', 1, v_detail,
      'operator', false, 'open', now(), now(), 'OPERATOR', true, 'verified', 1,
      coalesce(p_principal,'unknown') || ' · public.' || coalesce(p_table,'unknown'),
      'trigger', 'FLEET')
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.improvement_signals
       SET recurrence = coalesce(recurrence,0) + 1,
           sightings  = coalesce(sightings,0) + 1,
           last_seen  = now(),
           detail_md  = v_detail,
           status     = CASE WHEN status = 'closed' THEN 'open' ELSE coalesce(status,'open') END
     WHERE id = v_id;
  END IF;

  INSERT INTO public.signal_sighting(
    signal_id, cid, signal_key, tool, surface, subject, detail_md, link, raised_by)
  VALUES (
    v_id, v_cid, v_key, 'enforce_fleet_write_authority', 'trigger',
    coalesce(p_table,'unknown'), v_detail, p_identity, coalesce(p_principal,'unknown'));

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_fleet_write_denial(text,text,jsonb,text) TO cob_intel_writer;
