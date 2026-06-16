// supabase/functions/mcp-council/breaker.ts
//
// harden-v1 · per-instance circuit breaker and per-tenant concurrency guard.
//
// CRITICAL CAVEAT (documented for operators):
//   These structures live in module-scope memory inside ONE edge-function
//   instance. Under multi-instance scale-out or cold-start they are
//   best-effort per instance, NOT a global fleet guarantee. The DB-backed
//   per-IP rate limit (check_rate_limit) remains the authoritative cap.
//
// Breaker:  rolling window of last 20 chair-call outcomes within 60s.
//           If failure ratio ≥ 0.80 → OPEN for 30s (fail-fast with
//           "circuit_open"). Half-open after cooldown · next success
//           closes; next failure re-opens.
//
// Concurrency: at most CAP concurrent convenes per tenant per instance.
//              Excess callers get "concurrency_limit". Always release in
//              a finally block.

const WINDOW_MS = 60_000;
const WINDOW_SIZE = 20;
const OPEN_RATIO = 0.80;
const COOLDOWN_MS = 30_000;
const TENANT_CONCURRENCY_CAP = 2;

type Outcome = { t: number; ok: boolean };
const history: Outcome[] = [];
let openedAt = 0;

function trim(now: number): void {
  while (history.length && now - history[0].t > WINDOW_MS) history.shift();
  while (history.length > WINDOW_SIZE) history.shift();
}

export function breakerIsOpen(): boolean {
  const now = Date.now();
  if (openedAt && now - openedAt < COOLDOWN_MS) return true;
  if (openedAt && now - openedAt >= COOLDOWN_MS) openedAt = 0; // half-open
  return false;
}

export function breakerRecord(ok: boolean): void {
  const now = Date.now();
  trim(now);
  history.push({ t: now, ok });
  // Half-open recovery: a success after cooldown closes the breaker.
  if (ok && openedAt === 0) return;
  if (history.length < 5) return; // need minimum signal
  const failures = history.filter((h) => !h.ok).length;
  const ratio = failures / history.length;
  if (ratio >= OPEN_RATIO) openedAt = now;
}

// ── Per-tenant concurrency guard (per-instance) ─────────────────────────
const inflight = new Map<string, number>();

export function acquireConcurrency(tenant: string, cap = TENANT_CONCURRENCY_CAP): boolean {
  const n = inflight.get(tenant) ?? 0;
  if (n >= cap) return false;
  inflight.set(tenant, n + 1);
  return true;
}

export function releaseConcurrency(tenant: string): void {
  const n = inflight.get(tenant) ?? 0;
  if (n <= 1) inflight.delete(tenant);
  else inflight.set(tenant, n - 1);
}
