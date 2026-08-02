# A3.1 · Register Conflict Matrix

Generated 2026-08-02 · report only · zero data change.
`public.register_migration_contract` (110 rows · 11 distinct CIDs) was **not** modified.
No second contract register was created.

Sources of truth used:
- Contract: `public.register_migration_contract` (live read)
- HQ-NEXT claim: `src/hq-next/registry/register-migration.ts`
- Runtime writer: repository search of `supabase/functions/**`

All ten contract mappings carry identical policy values today:
`canonical_reader = NOTION` · `canonical_writer = NOTION` ·
`direct_source_edits_allowed = true` · `cutover_state = NOT_STARTED`.

---

## SECTION 1 — Contract mappings (all ten, directives and rules kept separate)

| register_key | destination_register | contract rows | distinct CIDs | contract policy (reader/writer/edits/cutover) | HQ-NEXT registry claim | actual runtime writer | conflict |
|---|---|---|---|---|---|---|---|
| checkpoints | session_checkpoints | 11 | 11 | NOTION / NOTION / true / NOT_STARTED | no `checkpoints` entry; nearest `session_log` — REGISTERED · substrate PARTIAL | `supabase/functions/mcp-council/index.ts:4183` (insert) | **YES** — contract names Notion as canonical writer while Postgres is written directly at runtime |
| decisions | decisions | 11 | 11 | NOTION / NOTION / true / NOT_STARTED | `decisions` — REGISTERED · substrate PRESENT | `supabase/functions/mcp-council/index.ts:4328` (`rpc record_decision`) | **YES** — Postgres is the de facto writer of record; contract still says Notion |
| directives | directives | 11 | 11 | NOTION / NOTION / true / NOT_STARTED | no `directives` entry; nearest `rules` — UNREGISTERED · substrate PRESENT | `supabase/functions/mcp-council/index.ts:4290` (insert) | **YES** — live Postgres writer against a Notion-canonical contract row |
| documents | document_registry | 11 | 11 | NOTION / NOTION / true / NOT_STARTED | `document_registry` — UNREGISTERED · substrate ABSENT | NOT_FOUND | NO — no runtime writer exists; contract and registry agree the register is not yet live |
| memory | memory_entries | 11 | 11 | NOTION / NOTION / true / NOT_STARTED | `memory` — REGISTERED · substrate PARTIAL | `supabase/functions/mcp-council/index.ts:4262` (insert) | **YES** — writes land in Postgres while the contract designates Notion |
| onboarding | onboarding_progress | 11 | 11 | NOTION / NOTION / true / NOT_STARTED | no `onboarding` entry in the HQ-NEXT registry | `supabase/functions/mcp-council/index.ts:2582` (upsert) | **YES** — active Postgres writer, no registry entry, Notion-canonical contract |
| open_loops | open_loops | 11 | 11 | NOTION / NOTION / true / NOT_STARTED | `tasks` — REGISTERED · substrate PRESENT · vocabulary reconciliation pending | `supabase/functions/mcp-council/index.ts:4232` (insert) | **YES** — writer conflict plus a key-name mismatch (`open_loops` vs registry `tasks`) |
| rules | directives | 11 | 11 | NOTION / NOTION / true / NOT_STARTED | `rules` — UNREGISTERED · substrate PRESENT | `supabase/functions/mcp-council/index.ts:4290` (insert into `directives`) | **YES** — two contract register keys (`rules`, `directives`) collapse onto one destination table with one undifferentiated writer |
| sessions | sessions | 11 | 11 | NOTION / NOTION / true / NOT_STARTED | `session_log` — REGISTERED · substrate PARTIAL (transcripts have no substrate) | `supabase/functions/mcp-council/index.ts:3653` (insert) | **YES** — Postgres session spine is authoritative in practice; contract says Notion |
| signals | improvement_signals | 11 | 11 | NOTION / NOTION / true / NOT_STARTED | `signals` — REGISTERED · substrate PRESENT | `supabase/functions/mcp-council/index.ts:4360` (`rpc record_signal`) | **YES** — Postgres writer against a Notion-canonical contract row |

**Ruling summary:** 9 of 10 mappings conflict. The single non-conflict (`documents`) is
non-conflicting only because nothing writes it yet. No register was flipped by this dispatch.

---

## SECTION 2 — Extended-estate registers with CONTRACT ROW: ABSENT

These tables exist in the live estate and carry data, but have **no row** in
`register_migration_contract`. Listed explicitly; none omitted.

| table | live row count | contract row | note |
|---|---|---|---|
| ritual_runs | 63 | ABSENT | ritual execution evidence, unregistered |
| boot_log | 36 | ABSENT | boot telemetry, unregistered |
| tenant_surfaces | 21 | ABSENT | surface registration substrate itself is unregistered |
| tenant_offices | 3 | ABSENT | Notion office wiring, unregistered |
| protected_artifacts | 5 | ABSENT | sealed artifacts, unregistered |
| blueprints | 20 | ABSENT | unregistered |
| scheduled_actions | 98 | ABSENT | CRM autonomy substrate, unregistered |
| change_log | 242 | ABSENT | largest unregistered register in the estate |
| goals | 0 | ABSENT | empty, unregistered |
| knowledge_files | 0 | ABSENT | empty, unregistered |
| kernels | 5 | ABSENT | identity kernel spine, unregistered |
| council_minutes | 0 | ABSENT | HQ-NEXT registry claims substrate PRESENT for `boardroom_minutes`; live count is 0 |
| storyline | 0 | ABSENT | empty, unregistered |

---

## Companion changes in A3.1 (context, not part of this report)

- `public.resolve_hq_authority_v1(uuid, text)` — additive shadow resolver, service_role only, enforces nothing.
- `public.resolve_identity_v2(text, text)` — quarantined (comment + EXECUTE revoked from service_role); body untouched; zero callers proven.
- `public.connector_identity_shadow_report_v1` — read-only aggregate over existing `identity_resolution_log`; **connector** evidence only, never HQ web parity.
