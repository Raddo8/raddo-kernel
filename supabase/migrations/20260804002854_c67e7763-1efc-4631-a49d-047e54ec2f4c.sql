REVOKE ALL ON TABLE public.taylor_threads FROM PUBLIC, anon, authenticated, sandbox_exec;
REVOKE ALL ON TABLE public.taylor_messages FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT SELECT, INSERT ON public.taylor_threads TO authenticated;
GRANT SELECT, INSERT ON public.taylor_messages TO authenticated;
GRANT ALL ON public.taylor_threads TO service_role;
GRANT ALL ON public.taylor_messages TO service_role;