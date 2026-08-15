
REVOKE EXECUTE ON FUNCTION public.admin_fleet_live(timestamp with time zone) FROM anon, authenticated;

UPDATE public.authority_secdef_register
   SET bucket='GENUINE_GAP', remediated=true, classified_at=now(),
       reason='Fleet-wide live activity across every client, and it was directly executable by any signed-in principal.',
       remediation='EXECUTE revoked from anon and authenticated. Reached through the operator surfaces and cron only.'
 WHERE fn_name='admin_fleet_live';

SELECT public.authority_secdef_sync();
