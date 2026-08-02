/** PREVIEW ONLY — synthetic state mutation. Never imported outside src/hq-next/preview/.
 * The read seam produces honest envelopes; this file post-mutates one for inspection. */
import type { HqReadEnvelope } from '../contracts/hq-read';
import { deriveState } from '../contracts/status';
import { FRESHNESS_WINDOW_SEC } from '../contracts/hq-read';

export type ForceState = undefined | 'stale' | 'degraded' | 'unauthorized' | 'empty';

export function forceEnvelope<T>(env: HqReadEnvelope<T>, force: ForceState): HqReadEnvelope<T> {
  if (!force) return env;
  const window = FRESHNESS_WINDOW_SEC[env.module] ?? 300;
  switch (force) {
    case 'unauthorized':
      return { ...env, ok: false, authorized: false, rows: [], row_count: 0, provenance: null,
        reasons: [...env.reasons, 'forced: unauthorized (preview)'], state: 'UNAUTHORIZED' };
    case 'empty':
      return { ...env, rows: [], row_count: 0,
        reasons: [...env.reasons, 'forced: empty (preview)'],
        state: deriveState({ ok: env.ok, authorized: env.authorized, rowCount: 0, zeroIsExpected: env.zero_is_expected, asOf: env.provenance?.captured_at ?? null, freshnessWindowSec: window, partial: env.partial }) };
    case 'degraded':
      return { ...env, ok: false, partial: true,
        reasons: [...env.reasons, 'forced: one source leg failed (preview)'], state: 'DEGRADED' };
    case 'stale': {
      const p = env.provenance;
      if (!p) return { ...env, state: 'STALE' };
      const anchor = p.captured_at ?? p.as_of;
      const backdated = new Date(new Date(anchor).getTime() - 6 * 3600 * 1000).toISOString();
      return { ...env, provenance: { ...p, captured_at: backdated }, state: 'STALE' };
    }
  }
}
