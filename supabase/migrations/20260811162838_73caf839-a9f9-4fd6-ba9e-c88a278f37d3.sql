-- ── E2 · board_respond · the snooze write path ────────────────────────────
-- Both columns already exist on open_loops. Nothing here changes schema on
-- that table; this opens the door that had no handle.
CREATE OR REPLACE FUNCTION public.board_respond(
  p_items jsonb,
  p_session_id text DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_cid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cid text;
  v_role text;
  v_today date;
  v_item jsonb;
  v_id uuid;
  v_status text;
  v_snooze date;
  v_applied jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb;
  v_row_id uuid;
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

  begin
    v_today := (now() at time zone coalesce(nullif(btrim(p_timezone),''),'UTC'))::date;
  exception when others then
    raise exception 'BOARD_TIMEZONE_UNKNOWN: % is not a timezone name.', p_timezone using errcode='22023';
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := null; v_snooze := null;
    v_status := lower(btrim(coalesce(v_item->>'brief_status','')));

    begin
      v_id := nullif(btrim(coalesce(v_item->>'id','')),'')::uuid;
    exception when others then
      v_id := null;
    end;

    if v_id is null then
      v_rejected := v_rejected || jsonb_build_object('item', v_item, 'reason', 'BOARD_ITEM_ID_REQUIRED');
      continue;
    end if;

    if v_status not in ('open','answered','snoozed','cleared') then
      v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_STATUS_UNKNOWN', 'detail', coalesce(v_status,'(none)'));
      continue;
    end if;

    if coalesce(btrim(v_item->>'snooze_until'),'') <> '' then
      begin
        v_snooze := (v_item->>'snooze_until')::date;
      exception when others then
        v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_SNOOZE_DATE_MALFORMED', 'detail', v_item->>'snooze_until');
        continue;
      end;
    end if;

    -- A snooze with no date is a wish, not an instruction. Never coerced.
    if v_status = 'snoozed' and v_snooze is null then
      v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_SNOOZE_DATE_REQUIRED',
        'detail', 'say when it should come back; a snooze without a date is not stored');
      continue;
    end if;

    if v_snooze is not null and v_snooze < v_today then
      v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_SNOOZE_DATE_PAST',
        'detail', v_snooze::text || ' is before ' || v_today::text);
      continue;
    end if;

    update open_loops o
       set brief_status = v_status,
           snooze_until = case when v_status = 'snoozed' then v_snooze else coalesce(v_snooze, o.snooze_until) end,
           updated_at = now()
     where o.id = v_id and o.cid = v_cid
    returning o.id into v_row_id;

    if v_row_id is null then
      v_rejected := v_rejected || jsonb_build_object('id', v_id, 'reason', 'BOARD_ITEM_NOT_FOUND');
    else
      v_applied := v_applied || jsonb_build_object('id', v_row_id, 'brief_status', v_status, 'snooze_until', v_snooze);
      v_row_id := null;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_rejected) = 0,
    'cid', v_cid,
    'session_id', p_session_id,
    'today', v_today,
    'applied', v_applied,
    'rejected', v_rejected
  );
end $function$;

GRANT EXECUTE ON FUNCTION public.board_respond(jsonb, text, text, text) TO authenticated, service_role;

-- ── O1 · RENAME THE CRON ──────────────────────────────────────────────────
-- The query is correct for the actions table it reads. Only the name was wrong.
SELECT cron.unschedule('process-scheduled-actions');
SELECT cron.schedule(
  'process-crm-actions',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1/process-scheduled-actions',
    headers := public.get_cron_headers(),
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $cron$
);