-- HARDEN-05 · D7 · lpad truncates from the left past its width.
-- lpad('100000',5,'0') = '10000'. It neither widens nor raises, so the
-- hundred-thousandth identifier on a tenant reissues an existing one and dies
-- on the unique index. greatest(5, length(...)) is byte-identical for every
-- value at or below 99999 and correct above it. Zero backfill.

CREATE OR REPLACE FUNCTION public.next_curn(p_cid text, p_kind text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if p_cid is null or btrim(p_cid) = '' then
    raise exception 'CURN_CID_REQUIRED' using errcode = '22023';
  end if;
  if p_kind not in ('S','D') then
    raise exception 'CURN_KIND_UNKNOWN: % (S|D)', p_kind using errcode = '22023';
  end if;

  insert into curn_sequence (cid, kind, last_value)
  values (p_cid, p_kind, 1)
  on conflict (cid, kind) do update
    set last_value = curn_sequence.last_value + 1,
        updated_at = now()
  returning last_value into v_n;

  -- D7 · never truncate. Pad short values, widen long ones.
  return p_cid || '-' || p_kind || '-' || lpad(v_n::text, greatest(5, length(v_n::text)), '0');
end $function$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_workspace_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year int := extract(year from now())::int;
  v_start int;
  v_max_seq int;
  v_max_inv int;
  v_next int;
  v_settings jsonb;
BEGIN
  IF NOT public.is_workspace_member(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  SELECT settings INTO v_settings FROM public.workspaces WHERE id = p_workspace_id;
  v_start := COALESCE(
    NULLIF(v_settings->'invoicing'->>'starting_number','')::int,
    1110
  );

  SELECT COALESCE(last_number, 0) INTO v_max_seq
  FROM public.invoice_number_sequences
  WHERE workspace_id = p_workspace_id AND year = v_year;
  v_max_seq := COALESCE(v_max_seq, 0);

  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '^COB-\d{4}-', ''), '')::int), 0)
  INTO v_max_inv
  FROM public.invoices
  WHERE workspace_id = p_workspace_id
    AND invoice_number ~ ('^COB-' || v_year::text || '-\d+$');

  v_next := GREATEST(v_max_seq, v_max_inv, v_start - 1) + 1;

  INSERT INTO public.invoice_number_sequences (workspace_id, year, last_number)
  VALUES (p_workspace_id, v_year, v_next)
  ON CONFLICT (workspace_id, year) DO UPDATE
    SET last_number = v_next;

  -- D7 · same truncation defect, same fix.
  RETURN 'COB-' || v_year::text || '-' || lpad(v_next::text, greatest(5, length(v_next::text)), '0');
END;
$function$;