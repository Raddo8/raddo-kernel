# RADDO — Master Institutional Handoff Document

**HANDOFF VERSION:** `2026.0214.1530`

**Phase:** Infrastructure Hardening Phase (Billing/Metering Subphase — Phase 1 Complete)

| Dimension | Maturity |
|---|---|
| Kernel Completion | ~97% |
| SaaS Capability | ~48% |
| Operational Infrastructure | ~77% |
| **Blended Company Maturity** | **~77%** |

**Verified Date:** 2026-02-14 (America/Chicago)

---

## 🚨 CONTINUATION DECLARATION (REQUIRED)

I acknowledge that I am continuing an institutional grade deterministic execution engine build.

I will:

- Preserve DB enforced idempotency as non negotiable
- Preserve audit truthfulness (no log before persistence)
- Preserve multi tenant isolation
- Preserve Memory Register items
- Preserve PROGRESS framing
- Preserve 3 Horizon Roadmap
- Preserve open validation obligations
- Refuse architectural regression
- Enforce Approval Allow protocol
- Enforce DO NOT APPROVE remediation protocol
- Operate in ABS / BRU / CHA mode until explicitly released

**Optimism bias is a protocol violation.**

---

## 🔒 OPERATING MODE (LOCKED)

For every complex decision:

1. **DECOMPOSE**
2. **SOLVE** (explicit confidence 0.0–1.0)
3. **VERIFY**
4. **SYNTHESIZE**
5. **REFLECT** if < 0.8

Always output:

- Clear answer
- Confidence level
- Key caveats

Unless explicitly exempted for binary approval decisions.

---

## 🔐 APPROVAL / ALLOW PROTOCOL (LOCKED)

When responding to:

- `ALLOW?`
- `APPROVE?`

Rules:

Response must be strictly:

- **ALLOW**
- **DO NOT ALLOW**
- **APPROVE**
- **DO NOT APPROVE**

Confidence Level must always be shown.

**APPROVE / ALLOW** requires Confidence ≥ 0.96.

No conditional approvals.

**If DO NOT APPROVE:**

- Explicitly list required updates needed to qualify for APPROVE.
- Show Confidence Level.

**If APPROVE / ALLOW:**

- Response must contain only the approval word and Confidence Level.
- No Key Caveats.
- No reminders.
- No appended concerns.
- Follow up items must be tracked and resurfaced later via structured follow up list.

---

## 🎯 KERNEL INTENT

**RADDO = Jet Engine**
**CASEY = First Vehicle**

Engine invariants:

1. Multi tenant
2. Workspace scoped
3. Deterministic
4. DB idempotent
5. Concurrency safe
6. Audit truthful
7. Failure retry safe
8. Brand neutral
9. Security first
10. Service role isolated

**No redesign permitted.**

---

## 🧠 RADDO MEMORY REGISTER (MANDATORY CARRYOVER)

- Idempotency must always be DB enforced.
- Audit logs must never imply persistence before DB success.
- Any APPROVE ≥0.95 creates mandatory post build verification.
- Webhook normalization requires live validation of: orphan handling, hard bounce, soft bounce, retry behavior.
- PROGRESS definition must be included in all handoffs.
- HANDOFF must include explicit open risk disclosure.
- Infrastructure Hardening Phase remains active until capacity and long run telemetry are proven.
- 3 Horizon Roadmap must be included in PROGRESS.
- Approval responses must include Confidence Level.
- APPROVE ALLOW must exceed 0.95 confidence.
- DO NOT APPROVE must explicitly list remediation requirements.
- APPROVE responses must not include appended caveats.
- No secrets may appear in SQL text, cron.job, migrations, or logs.
- Cron authentication must never rely on static shared secrets.
- Sensitive tables must never expose token_hash or replayable credentials via PostgREST.
- RLS must always be explicitly enabled on sensitive tables.
- Institutional document versioning must follow YEAR.MonthDay.Time format (e.g., 2026.0213.1423) for strict chronological ordering.
- `stress-test` edge function is the canonical correctness regression suite (7/7). It must not be deleted or conflated with capacity testing.
- Saturation load testing must use external tooling (k6). Edge functions must not be used to determine throughput ceilings.
- `health-probe` is constrained to micro-benchmark role only (max 5 requests, no capacity measurement).
- `IDEAS?` command must return structured ideation across all categories when invoked.

---

## 🔐 SECURITY ARCHITECTURE (HARDENED)

### Cron Authentication

Static CRON_SECRET eliminated.

Replaced with:

- `internal_keys` table (RLS enabled, zero policies)
- Server generated signing key via `gen_random_bytes(32)`
- `get_cron_headers()` — SECURITY DEFINER
- `verify_cron_token()` — SECURITY DEFINER
- 120 second replay window
- No secrets in `cron.job`
- No secrets in Vault
- No secrets in SQL
- No secrets in environment variables
- HMAC based ephemeral authentication

Cron jobs are now deterministic, self authenticating, rotatable by key regeneration only.

### Sensitive Table Hardening

**`action_responses`**

- RLS enabled
- SELECT policy removed
- `token_hash` not exposed via PostgREST
- Hardened RPC returns safe columns only
- Unique constraint on `action_id`
- Owner pinned to `postgres`
- Privilege revoke then grant deterministic sequence

**`rate_limits`**

- RLS enabled
- Service role only policy
- Cleanup cron active
- DB backed limiter verified cross isolate

**`internal_keys`**

- RLS enabled
- Zero policies intentional
- No API access
- Only SECURITY DEFINER functions can access

---

## 🔒 MUTATION SURFACE LOCK (POST HARDENING)

Three layer defense applied across:

- `suppression_list`
- `message_events`
- `timeline_events`
- `scores`
- `workspace_members`
- `workspaces`

### Layer 1: RLS Restrictive Deny Policies

- `AS RESTRICTIVE` with `USING (false)` or `WITH CHECK (false)`
- Applied to `authenticated` and `anon` for disallowed operations

### Layer 2: Privilege Revocation

- `REVOKE INSERT, UPDATE, DELETE` as applicable from `anon` and `authenticated`

### Layer 3: Service Role Preservation

- `service_role` retains full privileges and bypass behavior
- Verified via privilege matrix and runtime tests

---

## 📊 USAGE METERING ENGINE (PHASE 1 — LIVE)

### Architecture

Metering is a decoupled infrastructure layer that automatically records every completed action as a billable event. The execution core (`execute-action-core.ts`) remains unchanged — metering is a universal side effect via database trigger.

### Components

**`usage_events` table**
- Populated by `record_usage_event()` SECURITY DEFINER trigger on `actions` status → `completed`
- Columns: `workspace_id`, `action_id`, `event_type`, `channel`, `billing_period` (YYYY-MM), `unit_count`, `stripe_reported`, `metadata`
- RLS: SELECT for workspace members; INSERT/UPDATE/DELETE denied via `AS RESTRICTIVE` policies
- Privilege hardening: `REVOKE ALL` from PUBLIC/anon/authenticated; only service_role can write

**`workspace_billing` table**
- One row per workspace: `plan` (default: `free`), `monthly_action_limit` (default: 100), Stripe placeholders
- RLS: SELECT + UPDATE for workspace members (WITH CHECK on UPDATE); INSERT/DELETE denied via `AS RESTRICTIVE`
- Privilege hardening: `REVOKE ALL` then `GRANT SELECT, UPDATE` to authenticated
- Auto-seeded for all existing workspaces

**`billing-usage` edge function**
- JWT-authenticated, workspace membership enforced
- Returns: plan, limits, current period usage (total + by channel), 30-day daily breakdown
- Service-role client for aggregation queries

**Soft limit enforcement in `execute-action-server` create path**
- Queries `workspace_billing` + `usage_events` before action insertion
- Free plan workspaces at or above limit receive `{ success: false, reason: "usage_limit_reached" }`
- Paid plans pass through (future overage billing)
- Application-level check, not database constraint

### What's NOT included (Phase 2 — Stripe deferred)
- Stripe meter event reporting
- Stripe subscription management
- Plan upgrade/downgrade flows
- Overage billing for paid plans

---

## ✅ VERIFIED RUNTIME INTEGRITY (POST HARDENING)

### Service Role Write Paths — Verified ✓

| Function | Verification |
|---|---|
| `suppression-admin` | DELETE path functional under service role |
| `resend-webhook` | Signature boundary verified; inserts to `message_events` and `suppression_list` |
| `process-scheduled-actions` | Normal execution; idempotency skips correct |
| `execute-action-server` | Create and execute modes operational |

### SECURITY DEFINER Ownership — Verified ✓

All SECURITY DEFINER functions owned by `postgres`.

### Auth Boundary Tests — Verified ✓

| Scenario | Expected | Actual |
|---|---|---|
| `suppression-admin` without admin role | 403 | 403 ✓ |
| `process-scheduled-actions` without cron token | 401 | 401 ✓ |
| `resend-webhook` invalid signature | 401 | 401 ✓ |

---

## 🧪 EMPIRICAL VALIDATION EVIDENCE (STRESS SUITE)

Stress test edge function deployed and executed under HMAC cron auth with service role context.

**Aggregate result: 7/7 PASS (runtime observed ~7.3s)**

| # | Test | Verdict |
|---|---|---|
| 1 | **Double submit race condition** — Atomic claim gate ensures exactly one executor wins. | **PASS** |
| 2 | **Burst scheduler load** — 5 actions × 3 sweeps produces exactly 5 terminal results, no duplicates, no stuck running. | **PASS** |
| 3 | **Hard bounce suppression** — Hard bounce creates `message_events` row and inserts `suppression_list`. | **PASS** |
| 4 | **Soft bounce handling** — Soft bounce logs `message_events` only, no suppression. | **PASS** |
| 5 | **Orphan webhook handling** — Unknown `provider_message_id` produces zero DB writes. | **PASS** |
| 6 | **Stuck recovery / forced failure** — Running action with stale `claimed_at` recovers to terminal `failed` with timeout in `result_json` and timeline audit. | **PASS** |
| 7 | **Idempotency key dedup under concurrent insert** — Two concurrent create attempts with same `idempotency_key` yield exactly one action row, loser returns `skipped: duplicate`, and only one timeline event is created. | **PASS** |

**Correctness under concurrency is now proven.**

---

## 🏗️ SATURATION LOAD TESTING INFRASTRUCTURE (BUILT)

### Three-Tier Testing Architecture

| Tier | Tool | Role | Location |
|---|---|---|---|
| Correctness Regression | `stress-test` edge function | 7/7 deterministic behavior under contention | `supabase/functions/stress-test/` |
| Capacity Quantification | k6 external scripts | RPS ceiling, p50/p95/p99, error budgets | `load-tests/ramp.js`, `sustained.js`, `burst.js` |
| Micro Health Probe | `health-probe` edge function | Binary create-path responsiveness (max 5 requests) | `supabase/functions/health-probe/` |

### k6 Phases

- **Phase 1 (Ramp):** 1–50 VUs, finds safe RPS ceiling, 10% dedup subtest (shared idempotency keys under concurrency)
- **Phase 2 (Sustained):** 30 VUs for 15 minutes, detects latency drift and connection pool saturation
- **Phase 3 (Burst):** 5× spike (100 VUs) for 60 seconds, verifies no duplicates or stuck actions

### Safety Guardrails

- Dedicated test workspace required (`K6_TEST_WORKSPACE_ID`). Scripts refuse to run without it.
- Hard VU caps per script (ramp: 50, sustained: 40, burst: 100)
- Hard duration caps per script (ramp: 5m, sustained: 30m, burst: 2m)
- All test data uses `[LOAD-TEST]` / `[HEALTH-PROBE]` prefixes with cleanup
- health-probe requires `confirm_load: true` safety gate in request body

### Metrics Scope

- k6 measures **client-observed latency** (external HTTP round-trip including DNS, TLS, network). These are the canonical throughput and latency numbers.
- k6 does NOT measure DB CPU, memory, lock contention, connection pool usage, or edge function cold starts.
- health-probe measures **internal request latency only** (edge-function-to-edge-function). Explicitly not representative of end-user latency.
- Infrastructure metrics (DB CPU, active connections via `pg_stat_activity`, lock contention via `pg_locks`, function invocation logs) must be collected separately during any k6 run.

### Duplicate Prevention Measurement (Corrected)

- 10% of k6 ramp requests intentionally share idempotency keys in pairs
- Post-run verification confirms exactly one action row per shared key
- `duplicate_prevention_rate` must equal 1.0 for a passing run
- This measures actual dedup under concurrency, not just unique-key throughput

---

## 🔍 OPEN VALIDATION OBLIGATIONS (UPDATED)

Still **OPEN**:

- Sustained throughput saturation testing -- harness built (k6 + health-probe), first quantified run pending
- Long run provider telemetry validation (real bounce patterns over time, not simulated only)
- Observability expansion to SLO level dashboards
- Chaos style fault injection beyond forced DB failure (network timeouts, partial provider outages)

**Note:** Correctness is proven; capacity and long run behavior remain unproven.

---

## 🚧 INFRASTRUCTURE STILL REQUIRED (UPDATED)

- ~~Load testing harness for saturation~~ -- **DONE** (k6 scripts + health-probe deployed). First quantified run pending.
- SLO dashboards per function (success rate, retry rate, p95 latency, queue depth)
- ~~Billing integration~~ -- **Phase 1 DONE** (usage metering, soft limits, UI dashboard). Stripe integration deferred.
- ~~Usage metering~~ -- **Phase 1 DONE** (trigger-based recording, billing-usage edge function, /billing UI).
- Admin remediation tooling
- Cross workspace analytics
- Production telemetry and alerting for provider anomalies

---

## 📊 PROGRESS STRUCTURE (LOCKED)

When user types `PROGRESS?` output full 3 Horizon structure.

**Composite maturity (updated): ~77%**

| Dimension | Maturity |
|---|---|
| Kernel | ~97% |
| SaaS | ~48% |
| Infrastructure | ~77% |

---

## 🧭 CURRENT POSITION

**RADDO is:**

- Deterministic
- DB idempotent
- Concurrency safe (stress proven)
- Mutation locked
- HMAC authenticated
- RLS hardened
- Secret leak resistant
- Audit truthful
- Runtime integrity verified
- Institutionally documented (Security posture report exists and updated)
- Saturation load testing infrastructure deployed (k6 external + health-probe micro-benchmark)

**RADDO is NOT:**

- Capacity quantified
- Revenue optimized
- Autonomous

**Infrastructure Hardening Phase remains active until saturation and long run telemetry are proven.**

---

## 🗂️ EDGE FUNCTION INVENTORY

| Function | Role | Auth | Cron |
|---|---|---|---|
| `execute-action-server` | Action creation (create mode) and execution (execute mode) | HMAC cron (create) / JWT (execute) | Yes (via process-scheduled-actions) |
| `process-scheduled-actions` | Scheduler sweep — claims and executes due actions | HMAC cron | Yes (every minute) |
| `process-policy-rules` | Evaluates policy rules and queues resulting actions | HMAC cron | Yes (every minute) |
| `resend-webhook` | Processes inbound Resend webhook events (delivery, bounce, complaint) | Resend HMAC signature | No |
| `suppression-admin` | Admin CRUD for suppression list entries | JWT + admin role check | No |
| `get-response` | Public endpoint to retrieve action response form | Token-based (no JWT) | No |
| `submit-response` | Public endpoint to submit action response | Token-based (no JWT) | No |
| `cleanup-maintenance` | Prunes expired rate limits and stale data | HMAC cron | Yes (every 5 minutes) |
| `stress-test` | Correctness regression suite (7/7 tests) | HMAC cron | No |
| `health-probe` | Micro-benchmark health check (max 5 requests) | HMAC cron + confirm_load gate | No |
| `billing-usage` | Usage dashboard data (plan, limits, channel breakdown, daily trends) | JWT + workspace membership | No |

---

## 💡 IDEAS PROTOCOL (LOCKED)

When user types `IDEAS?`, the response must return structured ideation across all applicable categories:

| Category | Scope |
|---|---|
| System Ideas | Architecture, scaling, resilience |
| AI Ideas | Intelligent automation, ML-driven scoring, predictive analytics |
| Design Ideas | UI/UX, accessibility, white-label theming |
| Data Ideas | Analytics, data lakes, cross-workspace intelligence |
| New Market Ideas | Vertical expansion, industry-specific vehicles |
| Marketing Ideas | Growth loops, referral, content |
| Build Ideas | Developer experience, SDK, API marketplace |
| Security Ideas | Zero-trust, SOC2, compliance automation |
| Engagement Ideas | Gamification, retention, notifications |
| Communication Ideas | Omnichannel, AI voice, SMS, WhatsApp |
| Messaging Ideas | Templating, personalization, A/B testing |
| Responsiveness Ideas | Real-time, webhooks, streaming |
| Strategy Ideas | Pricing, competitive positioning, partnerships |
| Metadata Ideas | Tagging, custom fields, audit enrichment |

Each idea must include: **name**, **one-sentence description**, **Horizon alignment** (1/2/3), and **estimated impact** (low/medium/high).

---

## 🚀 STRATEGIC VISION — 11-FIGURE ROADMAP

### Core Thesis

RADDO is a deterministic, multi-tenant execution engine. CASEY is the first vehicle (collections/debt recovery). The engine is designed to be remixed into any industry requiring:

- Deterministic action sequencing
- Multi-channel communication orchestration
- Compliance-grade audit trails
- Workspace-isolated multi-tenancy
- Policy-driven automation with human-in-the-loop approval gates

### Identified Vehicle Opportunities (Horizon 3)

| Vehicle | Industry | Core Use Case |
|---|---|---|
| CASEY | Collections / Debt Recovery | Payment plan orchestration, compliance notices, escalation workflows |
| Vehicle 2 (TBD) | Healthcare | Patient engagement, appointment sequencing, insurance follow-up |
| Vehicle 3 (TBD) | Legal / Compliance | Case management workflows, regulatory notice sequencing, deadline tracking |
| Vehicle 4 (TBD) | Real Estate | Lease management, tenant communication, maintenance escalation |
| Vehicle 5 (TBD) | Insurance | Claims processing, policyholder communication, adjuster workflows |
| Vehicle 6 (TBD) | Education | Student engagement, enrollment workflows, financial aid sequencing |
| Vehicle 7 (TBD) | Government / Municipal | Citizen communication, permit processing, compliance enforcement |

### Platform Capabilities Required for Multi-Vehicle (Horizon 2–3)

- White-label theming and branding per workspace
- Custom field / metadata schema per workspace
- Industry-specific template libraries
- Marketplace for playbook templates
- API-first SDK for third-party integrations
- AI-driven action recommendation engine
- Predictive analytics (churn risk, response likelihood, optimal send time)
- Omnichannel expansion: SMS (Twilio), WhatsApp (Meta Business API), AI Voice (ElevenLabs/Bland.ai), Push Notifications
- SOC 2 Type II compliance automation
- Usage-based billing with tiered pricing
- Self-serve onboarding with workspace provisioning
- Cross-workspace analytics for platform operators

---

## 🔁 HANDOFF PROTOCOL (MANDATORY)

When user types `HANDOFF COPY` the response must include:

- Continuation declaration
- Operating mode
- Approval allow protocol
- Memory register
- Security architecture including HMAC cron
- Mutation surface lock summary
- Stress suite evidence 7/7
- PROGRESS framing
- Open risks and obligations
- Maturity numbers
- Strategic next priorities
- Confidence Level and Key Caveat
- Load testing infrastructure summary (k6 phases, health-probe, stress-test roles)
- Edge function inventory
- IDEAS protocol
- Strategic vision and vehicle roadmap

**No compression. No omission. No regression.**

---

**Confidence Level:** 0.97

**Key Caveat:** Concurrency correctness and deduplication are now empirically proven (7/7). Sustained capacity limits and long run provider behavior remain unmeasured and must be validated before declaring full Horizon 1 completion at production scale. Saturation harness is built and verified but first quantified capacity run has not yet been executed. IDEAS protocol and strategic vehicle roadmap are documented for planning purposes and do not represent committed deliverables.
