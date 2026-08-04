CREATE TABLE IF NOT EXISTS public.taylor_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL,
  status text NOT NULL DEFAULT 'live',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS taylor_threads_one_live_per_cid
  ON public.taylor_threads (cid) WHERE status = 'live';

CREATE TABLE IF NOT EXISTS public.taylor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.taylor_threads(id) ON DELETE CASCADE,
  cid text NOT NULL,
  role text NOT NULL CHECK (role IN ('client','taylor')),
  surface text NOT NULL CHECK (surface IN ('start_panel','connector')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS taylor_messages_thread_created_idx
  ON public.taylor_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS taylor_messages_cid_idx ON public.taylor_messages (cid);

REVOKE ALL ON TABLE public.taylor_threads FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.taylor_messages FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.taylor_threads TO authenticated;
GRANT SELECT, INSERT ON public.taylor_messages TO authenticated;
GRANT ALL ON public.taylor_threads TO service_role;
GRANT ALL ON public.taylor_messages TO service_role;

ALTER TABLE public.taylor_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taylor_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taylor_threads_select_own_cid" ON public.taylor_threads
  FOR SELECT TO authenticated
  USING (cid IS NOT NULL AND cid = public.current_cid());

CREATE POLICY "taylor_threads_insert_own_cid" ON public.taylor_threads
  FOR INSERT TO authenticated
  WITH CHECK (cid IS NOT NULL AND cid = public.current_cid());

CREATE POLICY "taylor_messages_select_own_cid" ON public.taylor_messages
  FOR SELECT TO authenticated
  USING (cid IS NOT NULL AND cid = public.current_cid());

CREATE POLICY "taylor_messages_insert_own_cid" ON public.taylor_messages
  FOR INSERT TO authenticated
  WITH CHECK (cid IS NOT NULL AND cid = public.current_cid());

CREATE OR REPLACE FUNCTION public.taylor_messages_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'taylor_messages is append-only';
END;
$$;

DROP TRIGGER IF EXISTS taylor_messages_no_mutation ON public.taylor_messages;
CREATE TRIGGER taylor_messages_no_mutation
  BEFORE UPDATE OR DELETE ON public.taylor_messages
  FOR EACH ROW EXECUTE FUNCTION public.taylor_messages_append_only();