CREATE TABLE public.chat_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  company text NOT NULL,
  title text NOT NULL,
  challenge text NOT NULL,
  voice text,
  user_agent text,
  referer text
);

CREATE INDEX idx_chat_leads_created_at ON public.chat_leads (created_at DESC);
CREATE INDEX idx_chat_leads_session_id ON public.chat_leads (session_id);
CREATE INDEX idx_chat_leads_email ON public.chat_leads (lower(email));

ALTER TABLE public.chat_leads ENABLE ROW LEVEL SECURITY;

-- Allow public insert (gate is pre-auth), all reads/updates/deletes denied to anon+authenticated.
CREATE POLICY "anon can insert chat_leads"
  ON public.chat_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "deny select on chat_leads"
  ON public.chat_leads
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE POLICY "deny update on chat_leads"
  ON public.chat_leads
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false);

CREATE POLICY "deny delete on chat_leads"
  ON public.chat_leads
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);