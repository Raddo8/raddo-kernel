// supabase/functions/mcp-council/retry.ts
//
// harden-v1 · bounded retry with exponential jitter for transient upstream
// failures. Wraps callAnthropic (or any async call) with at most 2 retries.
// Total worst-case added latency ~1.5s. Non-retryable errors (4xx semantics)
// fail fast.

const RETRYABLE_CODES = new Set([
  "upstream_failed",
  "upstream_unavailable",
  "upstream_empty",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
]);

export function isRetryable(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  // Explicit deny: hard client errors must not be retried.
  if (/\b(400|401|403|404|invalid_params|boundary_violation|injection_refusal|office_not_configured)\b/i.test(msg)) {
    return false;
  }
  for (const code of RETRYABLE_CODES) {
    if (msg.includes(code)) return true;
  }
  return false;
}

export interface RetryOpts {
  retries?: number;       // default 2
  baseMs?: number;        // default 250
  capMs?: number;         // default 750
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const base = opts.baseMs ?? 250;
  const cap = opts.capMs ?? 750;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === retries || !isRetryable(e)) throw e;
      const exp = Math.min(cap, base * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * exp);
      await new Promise((r) => setTimeout(r, jitter));
    }
  }
  throw lastErr;
}
