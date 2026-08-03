-- A3.1R · privilege + security-definer closure
ALTER FUNCTION public.resolve_hq_authority_v1(uuid, text) SET search_path = pg_catalog, pg_temp;
REVOKE EXECUTE ON FUNCTION public.resolve_hq_authority_v1(uuid, text) FROM sandbox_exec;
REVOKE ALL ON FUNCTION public.resolve_hq_authority_v1(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_hq_authority_v1(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_hq_authority_v1(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_hq_authority_v1(uuid, text) TO service_role;
REVOKE ALL ON public.connector_identity_shadow_report_v1 FROM sandbox_exec;
REVOKE ALL ON public.connector_identity_shadow_report_v1 FROM service_role;
GRANT SELECT ON public.connector_identity_shadow_report_v1 TO service_role;