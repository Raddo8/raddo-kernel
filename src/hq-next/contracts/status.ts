/** HQ-NEXT v0.1 · epistemic status vocabulary.
 * CONTENT state = what the row says. EPISTEMIC state = what we know about the reading.
 * A zero count NEVER renders as healthy: it is EMPTY_EXPECTED or EMPTY_UNEXPECTED. */
export const EPISTEMIC_STATES = ['LIVE','STALE','DEGRADED','EMPTY_EXPECTED','EMPTY_UNEXPECTED','UNAUTHORIZED','UNVERIFIED','ASSERTED_STATE_WITHOUT_SUBSTRATE','LOADING'] as const;
export type EpistemicState = typeof EPISTEMIC_STATES[number];
export const CONTENT_STATES = ['act','closed','dorm','durable','fixed','hi','live','notion','open','owed','pend','private','sealed','store'] as const;
export type ContentState = typeof CONTENT_STATES[number];
export interface EpistemicDescriptor { label: string; meaning: string; tone: 'good'|'warn'|'bad'|'unknown'|'neutral'; isProblem: boolean }
export const EPISTEMIC: Record<EpistemicState, EpistemicDescriptor> = {
  LIVE: { label:'LIVE', meaning:'Read from source within the freshness window; the read succeeded.', tone:'good', isProblem:false },
  STALE: { label:'STALE', meaning:'Last successful read is older than this panel\'s freshness window.', tone:'warn', isProblem:true },
  DEGRADED: { label:'DEGRADED', meaning:'The read partially failed; the missing part is named.', tone:'bad', isProblem:true },
  EMPTY_EXPECTED: { label:'EMPTY · EXPECTED', meaning:'Zero rows, and zero is correct here.', tone:'neutral', isProblem:false },
  EMPTY_UNEXPECTED: { label:'EMPTY · UNEXPECTED', meaning:'Zero rows and zero is NOT correct. Something that should write here is not.', tone:'bad', isProblem:true },
  UNAUTHORIZED: { label:'UNAUTHORIZED', meaning:'A refusal, not an absence.', tone:'bad', isProblem:true },
  UNVERIFIED: { label:'UNVERIFIED', meaning:'Shown without provable source or read-time. A claim, not a fact.', tone:'unknown', isProblem:true },
  ASSERTED_STATE_WITHOUT_SUBSTRATE: { label:'NO SUBSTRATE', meaning:'A status is asserted; no table, row, or receipt backs it.', tone:'bad', isProblem:true },
  LOADING: { label:'READING\u2026', meaning:'The read is in flight.', tone:'unknown', isProblem:false },
};
export function deriveState(a: { ok: boolean; authorized: boolean; rowCount: number; zeroIsExpected: boolean; asOf: string|null; freshnessWindowSec: number; partial?: boolean; now?: Date }): EpistemicState {
  if (!a.authorized) return 'UNAUTHORIZED';
  if (!a.ok) return 'DEGRADED';
  if (a.partial) return 'DEGRADED';
  if (!a.asOf) return 'UNVERIFIED';
  // Emptiness is a finding in its own right and outranks age: an old empty read
  // is still EMPTY_*, never STALE.
  if (a.rowCount === 0) return a.zeroIsExpected ? 'EMPTY_EXPECTED' : 'EMPTY_UNEXPECTED';
  const age = ((a.now ?? new Date()).getTime() - new Date(a.asOf).getTime()) / 1000;
  if (age > a.freshnessWindowSec) return 'STALE';
  return 'LIVE';
}
