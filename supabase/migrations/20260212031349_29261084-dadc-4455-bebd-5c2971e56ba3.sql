
CREATE TABLE public.action_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  token_hash text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_option text,
  submitted_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  item_ref text NOT NULL
);

CREATE UNIQUE INDEX idx_action_responses_token_hash ON public.action_responses(token_hash);
CREATE UNIQUE INDEX idx_action_responses_action ON public.action_responses(action_id);
CREATE INDEX idx_action_responses_pending_expires_at
  ON public.action_responses(expires_at) WHERE submitted_at IS NULL;

ALTER TABLE public.action_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view action_responses"
  ON public.action_responses FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

-- Options immutability trigger
CREATE OR REPLACE FUNCTION public.block_options_update()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.options IS DISTINCT FROM NEW.options THEN
    RAISE EXCEPTION 'options column is immutable after insert';
  END IF;
  IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'created_at is immutable';
  END IF;
  IF OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    RAISE EXCEPTION 'expires_at is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_action_responses_immutable_options
  BEFORE UPDATE ON public.action_responses
  FOR EACH ROW EXECUTE FUNCTION public.block_options_update();

-- Validation trigger
CREATE OR REPLACE FUNCTION public.validate_action_response()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.expires_at <= NEW.created_at THEN
      RAISE EXCEPTION 'expires_at must be after created_at';
    END IF;
    IF jsonb_typeof(NEW.options) != 'array' THEN
      RAISE EXCEPTION 'options must be a JSON array';
    END IF;
    IF length(NEW.item_ref) != 6 THEN
      RAISE EXCEPTION 'item_ref must be exactly 6 characters';
    END IF;
  END IF;
  IF NEW.selected_option IS NOT NULL AND length(NEW.selected_option) > 64 THEN
    RAISE EXCEPTION 'selected_option exceeds 64 characters';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_action_responses_validate
  BEFORE INSERT OR UPDATE ON public.action_responses
  FOR EACH ROW EXECUTE FUNCTION public.validate_action_response();
