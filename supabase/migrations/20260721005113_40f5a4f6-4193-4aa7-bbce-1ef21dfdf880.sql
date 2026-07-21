ALTER TABLE public.taylor_questions ADD COLUMN IF NOT EXISTS answer text;
ALTER TABLE public.taylor_questions ADD COLUMN IF NOT EXISTS answered_at timestamptz;
ALTER PUBLICATION supabase_realtime ADD TABLE public.intake_facts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.taylor_questions;
ALTER TABLE public.intake_facts REPLICA IDENTITY FULL;
ALTER TABLE public.taylor_questions REPLICA IDENTITY FULL;