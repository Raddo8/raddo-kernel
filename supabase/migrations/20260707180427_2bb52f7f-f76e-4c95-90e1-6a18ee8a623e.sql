ALTER TABLE public.revenue_schedules
  ADD COLUMN IF NOT EXISTS counted BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.revenue_schedules.counted IS
  'When false, this schedule is excluded from ALL revenue math (ledgers, MRR, ribbon chart, month strip, forecast, pipeline rollup) while remaining visible in grouped ledger views. Pursuit-level state is untouched by this flag.';

CREATE INDEX IF NOT EXISTS revenue_schedules_counted_idx
  ON public.revenue_schedules (workspace_id, counted);