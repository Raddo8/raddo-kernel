
-- record_files
CREATE TABLE public.record_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('deck','site','email_draft','agreement','other')),
  size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  superseded_by UUID REFERENCES public.record_files(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_record_files_account ON public.record_files(account_id);
CREATE INDEX idx_record_files_item ON public.record_files(item_id);
CREATE INDEX idx_record_files_workspace ON public.record_files(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.record_files TO authenticated;
GRANT ALL ON public.record_files TO service_role;

ALTER TABLE public.record_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read record_files"
  ON public.record_files FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members insert record_files"
  ON public.record_files FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "uploader or operator updates record_files"
  ON public.record_files FOR UPDATE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id)
         AND (uploaded_by = auth.uid() OR public.is_operator(auth.uid())))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "uploader or operator deletes record_files"
  ON public.record_files FOR DELETE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id)
         AND (uploaded_by = auth.uid() OR public.is_operator(auth.uid())));


-- approval_requests
CREATE TABLE public.approval_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('state_move','send_email','other')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_approvals_workspace_status ON public.approval_requests(workspace_id, status);
CREATE INDEX idx_approvals_item ON public.approval_requests(item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_requests TO authenticated;
GRANT ALL ON public.approval_requests TO service_role;

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read approvals"
  ON public.approval_requests FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members insert approvals"
  ON public.approval_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members update approvals"
  ON public.approval_requests FOR UPDATE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "requester or operator deletes approvals"
  ON public.approval_requests FOR DELETE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id)
         AND (requested_by = auth.uid() OR public.is_operator(auth.uid())));

CREATE TRIGGER approvals_touch_updated_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Storage policies for 'record-files' bucket.
-- Path convention: {workspace_id}/{account_id}/{filename}.
CREATE POLICY "record-files members read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'record-files'
    AND public.is_workspace_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "record-files members insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'record-files'
    AND public.is_workspace_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "record-files members update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'record-files'
    AND public.is_workspace_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "record-files members delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'record-files'
    AND public.is_workspace_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
