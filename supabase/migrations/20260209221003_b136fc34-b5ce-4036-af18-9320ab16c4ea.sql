-- Add contact_id to actions for explicit recipient selection
ALTER TABLE public.actions ADD COLUMN contact_id uuid REFERENCES public.contacts(id);

-- Add primary_contact_id to accounts for default recipient
ALTER TABLE public.accounts ADD COLUMN primary_contact_id uuid REFERENCES public.contacts(id);

-- Index for recipient lookup
CREATE INDEX idx_actions_contact_id ON public.actions(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_contacts_account_id_created ON public.contacts(account_id, created_at DESC);