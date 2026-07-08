ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS stripe_invoice_pdf text;