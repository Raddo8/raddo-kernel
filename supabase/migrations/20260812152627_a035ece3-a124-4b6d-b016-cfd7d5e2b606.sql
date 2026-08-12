-- HARDEN-10 · probe observability. supabase_read_only_user is an internal,
-- non-API, read-only role. It is NOT public, anon, or authenticated.
GRANT EXECUTE ON FUNCTION public.resolve_cid_strict(text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.bringup_state(text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.hq_records_keys_v1(text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.hq_blueprints_read(text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.hq_scheduled_read(text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.my_cob() TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.my_tenant() TO supabase_read_only_user;