-- HARDEN-15 CORRECTION · R1/R2 substrate · withdraw Q1 (p_cid on client writers)

CREATE TABLE IF NOT EXISTS public.write_refusal (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  cid text,
  tool text not null,
  refusal text not null,
  caller_cid text,
  detail text
);
GRANT SELECT ON public.write_refusal TO authenticated;
GRANT ALL ON public.write_refusal TO service_role;
ALTER TABLE public.write_refusal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS write_refusal_own_read ON public.write_refusal;
CREATE POLICY write_refusal_own_read ON public.write_refusal
  FOR SELECT TO authenticated USING (cid = public.current_cid() OR public.is_fleet_operator());

CREATE OR REPLACE FUNCTION public.record_write_refusal(p_cid text, p_tool text, p_refusal text, p_caller_cid text DEFAULT NULL, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  insert into write_refusal (cid, tool, refusal, caller_cid, detail)
  values (p_cid, p_tool, p_refusal, p_caller_cid, p_detail);
exception when others then null;
end $$;

-- The one boot authority: a live tenant_session_context row, written by
-- begin_session and revoked by end_session.
CREATE OR REPLACE FUNCTION public.session_boot_state(p_cid text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select case when exists (
    select 1 from tenant_session_context c
     where c.cid = p_cid and c.revoked_at is null
       and (c.expires_at is null or c.expires_at > now())
  ) then 'BOOTED' else 'NOT_BOOTED' end
$$;

-- R1 · an un-booted session must say so, and must never be told a
-- cross-tenant story. Two states, two remedies, never conflated.
CREATE OR REPLACE FUNCTION public.resolve_write_cid(p_row_cid text, p_tool text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v text;
begin
  v := public.current_cid();

  if v is null then
    if public.caller_is_service_role() and public.session_boot_state(p_row_cid) = 'BOOTED' then
      return p_row_cid;
    end if;
    perform public.record_write_refusal(p_row_cid, p_tool, 'NOT_BOOTED', null,
      'no session context resolved for this caller');
    raise exception 'NOT_BOOTED: this session has not loaded an identity, so it cannot write into a client world. Run begin_session and retry. This is not a permissions problem and it is not a cross-tenant refusal.'
      using errcode='55000';
  end if;

  if v is distinct from p_row_cid then
    if public.operator_read_guard(p_row_cid, p_tool) then
      return v;
    end if;
    perform public.record_write_refusal(p_row_cid, p_tool, 'CROSS_TENANT_REFUSED', v,
      'caller resolved to '||v||' and the row belongs to '||coalesce(p_row_cid,'null'));
    raise exception 'CROSS_TENANT_REFUSED: that record belongs to another client and you are not on the operator ledger.'
      using errcode='42501';
  end if;

  return v;
end $$;

-- R3b · a tenant's real lane set, taken from its own world.
CREATE OR REPLACE FUNCTION public.tenant_lanes(p_cid text)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select coalesce(array_agg(distinct l order by l), '{}'::text[]) from (
    select nullif(btrim(lane),'') l from work_item where cid = p_cid
    union select nullif(btrim(lane),'') from memory_entries where cid = p_cid
    union select nullif(btrim(lane),'') from storyline where cid = p_cid
  ) s where l is not null
$$;

GRANT EXECUTE ON FUNCTION public.session_boot_state(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_lanes(text) TO authenticated, service_role;