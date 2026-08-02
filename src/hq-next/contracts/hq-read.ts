/** HQ-NEXT v0.1 · the read contract. Backend-neutral seam.
 * BINDING (v0.1 corrections applied):
 * 1. No tenant/CID/principal field exists in the request. BUT absence of a caller
 *    field does NOT produce isolation (bridge_claim_next takes no args and leaked):
 *    the SERVER must derive principal→cid→tenant from the verified JWT and apply
 *    that scope in every query. Negative cross-tenant probes are required evidence.
 * 2. Receipt policy: routine summary reads → aggregated TELEMETRY. Privileged
 *    detail reads and EVERY mutation → full receipt. Not "every read writes a receipt".
 * 3. Provenance carries as_of (server clock) AND source_watermark (the source's own
 *    max(updated_at)) — a panel can be fresh and stale at once; two fields express it. */
import type { EpistemicState } from './status';
export const HQ_MODULES = ['pulse','arsenal','memory','continuity','receipts','authority','office'] as const;
export type HqModule = typeof HQ_MODULES[number];
/** Authority planes. 'both' = tenant-safe projection exists; fleet projection stays operator-only. */
export const MODULE_PLANE: Record<HqModule,'operator'|'both'> = {
  pulse:'both', arsenal:'both', memory:'both', continuity:'both', receipts:'both', authority:'operator', office:'both',
};
/** Which projection a caller gets. Server-decided from derived authority; mirrored here for rendering. */
export type Projection = 'fleet' | 'tenant';
export const FRESHNESS_WINDOW_SEC: Record<HqModule, number> = { pulse:60, arsenal:900, memory:300, continuity:300, receipts:300, authority:900, office:900 };
export interface HqReadRequest { module: HqModule; view?: string; filters?: Record<string,string|number|boolean>; cursor?: string|null; limit?: number }
export interface HqReadProvenance {
  as_of: string;                       // server clock at read — never browser time
  source_watermark: string | null;     // the source's own last-write time
  source: string;
  backend: 'fixture'|'vacj'|'rnj';
  receipt_id: string | null;           // privileged detail reads + mutations only
  telemetry_id: string | null;         // aggregated counter for routine reads
  last_successful_read: string | null;
  last_attempted_read: string | null;
  connection: 'ONLINE'|'DEGRADED'|'OFFLINE';
}
export interface HqReadEnvelope<T> {
  module: HqModule; view: string|null; projection: Projection;
  ok: boolean; authorized: boolean; partial: boolean; reasons: string[];
  zero_is_expected: boolean; row_count: number; rows: T[]; next_cursor: string|null;
  provenance: HqReadProvenance | null; state: EpistemicState;
}
export type HqReadFn = <T = unknown>(req: HqReadRequest) => Promise<HqReadEnvelope<T>>;
