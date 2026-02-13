# RADDO — Master Institutional Handoff Document

**HANDOFF VERSION:** `2026.0213.1645`

**Phase:** Infrastructure Hardening Phase (Correctness Proven, Capacity Pending)

| Dimension | Maturity |
|---|---|
| Kernel Completion | ~97% |
| SaaS Capability | ~45% |
| Operational Infrastructure | ~74% |
| **Blended Company Maturity** | **~75%** |

**Verified Date:** 2026-02-13 (America/Chicago)

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

## 🔍 OPEN VALIDATION OBLIGATIONS (UPDATED)

Still **OPEN**:

- Sustained throughput saturation testing (capacity limits, latency, error budgets)
- Long run provider telemetry validation (real bounce patterns over time, not simulated only)
- Observability expansion to SLO level dashboards
- Chaos style fault injection beyond forced DB failure (network timeouts, partial provider outages)

**Note:** Correctness is proven; capacity and long run behavior remain unproven.

---

## 🚧 INFRASTRUCTURE STILL REQUIRED (UPDATED)

- Load testing harness for saturation (not just correctness)
- SLO dashboards per function (success rate, retry rate, p95 latency, queue depth)
- Billing integration
- Usage metering
- Admin remediation tooling
- Cross workspace analytics
- Production telemetry and alerting for provider anomalies

---

## 📊 PROGRESS STRUCTURE (LOCKED)

When user types `PROGRESS?` output full 3 Horizon structure.

**Composite maturity (updated): ~75%**

| Dimension | Maturity |
|---|---|
| Kernel | ~97% |
| SaaS | ~45% |
| Infrastructure | ~74% |

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

**RADDO is NOT:**

- Capacity quantified
- Revenue optimized
- Autonomous

**Infrastructure Hardening Phase remains active until saturation and long run telemetry are proven.**

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

**No compression. No omission. No regression.**

---

**Confidence Level:** 0.97

**Key Caveat:** Concurrency correctness and deduplication are now empirically proven (7/7). Sustained capacity limits and long run provider behavior remain unmeasured and must be validated before declaring full Horizon 1 completion at production scale.
