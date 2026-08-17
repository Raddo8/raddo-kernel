-- HARDEN-15 CORRECTION · probe harness and recorded evidence

CREATE TABLE IF NOT EXISTS public.harden15_probe (
  id bigserial primary key,
  at timestamptz not null default now(),
  probe text not null,
  observed text
);
GRANT SELECT ON public.harden15_probe TO authenticated;
GRANT ALL ON public.harden15_probe TO service_role;
ALTER TABLE public.harden15_probe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harden15_probe_operator_read ON public.harden15_probe;
CREATE POLICY harden15_probe_operator_read ON public.harden15_probe
  FOR SELECT TO authenticated USING (public.is_fleet_operator());

CREATE OR REPLACE FUNCTION public.probe_write_refusal(p_claims text, p_call text, p_work uuid DEFAULT NULL, p_cid text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  perform set_config('request.jwt.claims', p_claims, true);
  begin
    if p_call = 'work_dispose_guard' then
      -- deliberately invalid disposition: reaching it proves the tenancy
      -- guard passed, and nothing is written.
      perform public.work_dispose(p_work, 'probe-invalid');
    elsif p_call = 'work_dispose_lane' then
      perform public.work_dispose(p_work, 'probe-invalid', null, null, null, 'not-a-real-lane');
    elsif p_call = 'assert_booted' then
      perform public.assert_booted(p_cid, 'work_raise');
    elsif p_call = 'revert_guard' then
      perform public.revert_change(-1::bigint, 'probe');
    end if;
    return 'NO_REFUSAL';
  exception when others then
    return split_part(SQLERRM, ':', 1);
  end;
end $$;
REVOKE ALL ON FUNCTION public.probe_write_refusal(text,text,uuid,text) FROM PUBLIC;

INSERT INTO public.harden15_probe (probe, observed) VALUES
 ('R1a · un-booted service caller · work_dispose',
   public.probe_write_refusal('{"role":"service_role"}','work_dispose_guard',
     (select work_id from work_item where cid='CID-100001' limit 1), null)),
 ('R1b · booted CID-100002 principal · work_dispose on a CID-100001 row',
   public.probe_write_refusal('{"role":"authenticated","sub":"610d3820-e0e1-44fd-80c0-f94ab0512ed6"}','work_dispose_guard',
     (select work_id from work_item where cid='CID-100001' limit 1), null)),
 ('R1d · booted service caller · work_dispose on own row reaches the body',
   public.probe_write_refusal('{"role":"service_role"}','work_dispose_guard',
     (select work_id from work_item where cid='CID-100002' and state='open' limit 1), null)),
 ('R2a · un-booted · work_raise (assert_booted, CID-100001)',
   public.probe_write_refusal('{"role":"service_role"}','assert_booted', null, 'CID-100001')),
 ('R2a · un-booted · work_raise (assert_booted, CID-100004)',
   public.probe_write_refusal('{"role":"service_role"}','assert_booted', null, 'CID-100004')),
 ('R2b · booted · work_raise (assert_booted, CID-100002)',
   public.probe_write_refusal('{"role":"service_role"}','assert_booted', null, 'CID-100002')),
 ('R3b · unknown lane on a booted CID-100002 row',
   public.probe_write_refusal('{"role":"service_role"}','work_dispose_lane',
     (select work_id from work_item where cid='CID-100002' and state='open' limit 1), null));