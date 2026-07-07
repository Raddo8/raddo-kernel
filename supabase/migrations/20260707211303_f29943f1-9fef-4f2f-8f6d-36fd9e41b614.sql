-- Invoicing: configurable starting number, 5-digit padding, gapless per year.
-- New numbers begin at greatest(existing max, starting_number - 1) + 1.
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

  -- Also scan any invoices whose parsed sequence is higher (defense in depth).
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

  RETURN 'COB-' || v_year::text || '-' || lpad(v_next::text, 5, '0');
END;
$function$;