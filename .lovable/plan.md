## RADDO Policy Rules V1 -- COMPLETED

All steps implemented:

1. ✅ **SQL Migration** — Renamed `policy_rules` → `policy_rate_rules`, created new RADDO `policy_rules` table with RLS, index, `update_updated_at` trigger
2. ✅ **Code references updated** — `PolicyDetail.tsx`, `PoliciesList.tsx`, `queue-actions.ts`, `seed-casey.ts` all point to `policy_rate_rules`
3. ✅ **Edge Function** — `supabase/functions/process-policy-rules/index.ts` deployed with canonical predicate hashing, safe dot-path resolver, V1 operator set, deterministic idempotency keys
4. ✅ **config.toml** — `verify_jwt = false` for `process-policy-rules`
5. ✅ **pg_cron** — Registered schedule ID 2, fires `*/3 * * * *`
