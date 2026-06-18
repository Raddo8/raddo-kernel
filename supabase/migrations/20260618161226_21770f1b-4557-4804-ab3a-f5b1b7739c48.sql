
-- helper: is the caller an operator (owner/admin in any workspace)?
CREATE OR REPLACE FUNCTION public.is_operator(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND role IN ('owner','admin')
  )
$$;

CREATE TABLE public.builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  client_id text NOT NULL,
  recipient text,
  title text NOT NULL,
  sub_type text NOT NULL DEFAULT 'App',
  storage_path text NOT NULL,
  preview_path text,
  version integer NOT NULL DEFAULT 1,
  access_mode text NOT NULL DEFAULT 'open-link',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.builds TO authenticated;
GRANT ALL ON public.builds TO service_role;

ALTER TABLE public.builds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can view builds"
  ON public.builds FOR SELECT TO authenticated
  USING (public.is_operator(auth.uid()));

CREATE POLICY "Operators can insert builds"
  ON public.builds FOR INSERT TO authenticated
  WITH CHECK (public.is_operator(auth.uid()));

CREATE POLICY "Operators can update builds"
  ON public.builds FOR UPDATE TO authenticated
  USING (public.is_operator(auth.uid()))
  WITH CHECK (public.is_operator(auth.uid()));

CREATE TRIGGER builds_set_updated_at
  BEFORE UPDATE ON public.builds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX builds_token_idx ON public.builds (token);
CREATE INDEX builds_client_idx ON public.builds (client_id);

CREATE TABLE public.build_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id uuid NOT NULL REFERENCES public.builds(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  ua text,
  ip text,
  viewer_email text
);

GRANT SELECT ON public.build_views TO authenticated;
GRANT ALL ON public.build_views TO service_role;

ALTER TABLE public.build_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can view build_views"
  ON public.build_views FOR SELECT TO authenticated
  USING (public.is_operator(auth.uid()));

CREATE INDEX build_views_build_idx ON public.build_views (build_id, opened_at DESC);

-- Storage policies on builds bucket
CREATE POLICY "Operators can upload builds"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'builds' AND public.is_operator(auth.uid()));

CREATE POLICY "Operators can update builds storage"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'builds' AND public.is_operator(auth.uid()));

CREATE POLICY "Operators can read builds storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'builds' AND public.is_operator(auth.uid()));

CREATE POLICY "Operators can delete builds storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'builds' AND public.is_operator(auth.uid()));
