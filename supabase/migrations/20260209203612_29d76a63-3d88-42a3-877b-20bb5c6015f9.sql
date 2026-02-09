
-- Enums
CREATE TYPE public.item_direction AS ENUM ('inbound', 'outbound', 'system');
CREATE TYPE public.action_status AS ENUM ('pending_approval', 'scheduled', 'running', 'completed', 'failed');
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'member', 'viewer');

-- Workspaces
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles (public user info)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workspace members
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- Accounts
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'customer',
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contacts
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Item states
CREATE TABLE public.item_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT DEFAULT '#888888',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Policies
CREATE TABLE public.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Policy rules
CREATE TABLE public.policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  rule_json JSONB NOT NULL DEFAULT '{}',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Templates
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  tone TEXT DEFAULT 'professional',
  subject TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Playbooks
CREATE TABLE public.playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Playbook steps
CREATE TABLE public.playbook_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  step_order INT NOT NULL DEFAULT 0,
  trigger_state TEXT NOT NULL,
  action_type TEXT NOT NULL,
  channel TEXT DEFAULT 'email',
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  delay_minutes INT DEFAULT 0,
  requires_approval BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Items
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'invoice',
  title TEXT NOT NULL,
  amount NUMERIC(12,2),
  due_date DATE,
  state_id UUID REFERENCES public.item_states(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Actions
CREATE TABLE public.actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  channel TEXT DEFAULT 'email',
  payload_json JSONB DEFAULT '{}',
  status action_status NOT NULL DEFAULT 'scheduled',
  scheduled_for TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Timeline events
CREATE TABLE public.timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  direction item_direction NOT NULL DEFAULT 'system',
  channel TEXT NOT NULL DEFAULT 'system',
  summary TEXT NOT NULL,
  body TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_json JSONB
);

-- Scores
CREATE TABLE public.scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.items(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  score_type TEXT NOT NULL,
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vertical packs
CREATE TABLE public.vertical_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Connectors
CREATE TABLE public.connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Connector accounts
CREATE TABLE public.connector_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  external_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vertical_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_accounts ENABLE ROW LEVEL SECURITY;

-- Helper: check workspace membership
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Workspace policies
CREATE POLICY "Members can view workspaces" ON public.workspaces FOR SELECT USING (public.is_workspace_member(auth.uid(), id));
CREATE POLICY "Authenticated users can create workspaces" ON public.workspaces FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Members can update workspaces" ON public.workspaces FOR UPDATE USING (public.is_workspace_member(auth.uid(), id));

-- Workspace members policies
CREATE POLICY "Members can view workspace members" ON public.workspace_members FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Can insert self as member" ON public.workspace_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Workspace-scoped table policies (accounts, contacts, items, etc.)
CREATE POLICY "Members can view accounts" ON public.accounts FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can insert accounts" ON public.accounts FOR INSERT WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can update accounts" ON public.accounts FOR UPDATE USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can delete accounts" ON public.accounts FOR DELETE USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can view contacts" ON public.contacts FOR SELECT USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND public.is_workspace_member(auth.uid(), a.workspace_id)));
CREATE POLICY "Members can insert contacts" ON public.contacts FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND public.is_workspace_member(auth.uid(), a.workspace_id)));
CREATE POLICY "Members can update contacts" ON public.contacts FOR UPDATE USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND public.is_workspace_member(auth.uid(), a.workspace_id)));
CREATE POLICY "Members can delete contacts" ON public.contacts FOR DELETE USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND public.is_workspace_member(auth.uid(), a.workspace_id)));

CREATE POLICY "Members can view item_states" ON public.item_states FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can manage item_states" ON public.item_states FOR ALL USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can view policies" ON public.policies FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can manage policies" ON public.policies FOR ALL USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can view policy_rules" ON public.policy_rules FOR SELECT USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.is_workspace_member(auth.uid(), p.workspace_id)));
CREATE POLICY "Members can manage policy_rules" ON public.policy_rules FOR ALL USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.is_workspace_member(auth.uid(), p.workspace_id)));

CREATE POLICY "Members can view templates" ON public.templates FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can manage templates" ON public.templates FOR ALL USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can view playbooks" ON public.playbooks FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can manage playbooks" ON public.playbooks FOR ALL USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can view playbook_steps" ON public.playbook_steps FOR SELECT USING (EXISTS (SELECT 1 FROM public.playbooks p WHERE p.id = playbook_id AND public.is_workspace_member(auth.uid(), p.workspace_id)));
CREATE POLICY "Members can manage playbook_steps" ON public.playbook_steps FOR ALL USING (EXISTS (SELECT 1 FROM public.playbooks p WHERE p.id = playbook_id AND public.is_workspace_member(auth.uid(), p.workspace_id)));

CREATE POLICY "Members can view items" ON public.items FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can insert items" ON public.items FOR INSERT WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can update items" ON public.items FOR UPDATE USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can delete items" ON public.items FOR DELETE USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can view actions" ON public.actions FOR SELECT USING (EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND public.is_workspace_member(auth.uid(), i.workspace_id)));
CREATE POLICY "Members can manage actions" ON public.actions FOR ALL USING (EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND public.is_workspace_member(auth.uid(), i.workspace_id)));

CREATE POLICY "Members can view timeline_events" ON public.timeline_events FOR SELECT USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND public.is_workspace_member(auth.uid(), a.workspace_id)));
CREATE POLICY "Members can insert timeline_events" ON public.timeline_events FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND public.is_workspace_member(auth.uid(), a.workspace_id)));

CREATE POLICY "Members can view scores" ON public.scores FOR SELECT USING (
  (item_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND public.is_workspace_member(auth.uid(), i.workspace_id)))
  OR
  (account_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND public.is_workspace_member(auth.uid(), a.workspace_id)))
);

CREATE POLICY "Members can view vertical_packs" ON public.vertical_packs FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can manage vertical_packs" ON public.vertical_packs FOR ALL USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can view connectors" ON public.connectors FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can manage connectors" ON public.connectors FOR ALL USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can view connector_accounts" ON public.connector_accounts FOR SELECT USING (EXISTS (SELECT 1 FROM public.connectors c WHERE c.id = connector_id AND public.is_workspace_member(auth.uid(), c.workspace_id)));
CREATE POLICY "Members can manage connector_accounts" ON public.connector_accounts FOR ALL USING (EXISTS (SELECT 1 FROM public.connectors c WHERE c.id = connector_id AND public.is_workspace_member(auth.uid(), c.workspace_id)));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Auto-create workspace on profile creation
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id UUID;
BEGIN
  INSERT INTO public.workspaces (name, slug)
  VALUES (COALESCE(NEW.full_name, 'My Workspace') || '''s Workspace', gen_random_uuid()::text)
  RETURNING id INTO ws_id;
  
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (ws_id, NEW.user_id, 'owner');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile();

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON public.policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_playbooks_updated_at BEFORE UPDATE ON public.playbooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
