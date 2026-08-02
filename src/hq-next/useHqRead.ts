/** HQ-NEXT v0.1 · the only seam. No component imports a DB client or names a table.
 * BINDING:
 * 1. viewer is MANDATORY. A missing viewer yields an UNAUTHORIZED envelope with zero
 *    rows for EVERY module, including modules whose plane is 'both'.
 * 2. CID is the ONLY scoping key. displayName is a label and is never used to filter.
 * 3. Fixture provenance is honest: connection FIXTURE, no telemetry id, no receipt id,
 *    captured_at carries the snapshot's true capture time while as_of is the read time.
 *    A fixture envelope can never report LIVE.
 * 4. There is NO synthetic-state machinery here. Forced states exist only in
 *    src/hq-next/preview/forceEnvelope.ts, which production never imports. */
import React from 'react';
import { type HqReadEnvelope, type HqReadRequest, type HqModule, type Projection, FRESHNESS_WINDOW_SEC, MODULE_PLANE } from './contracts/hq-read';
import { deriveState } from './contracts/status';
import { CAPTURED, SKILLS, ADVISORS, TOOLS, PULSE, KERNEL_PARTS, MEMORY, OFFICE_SURFACES, RECEIPTS } from './fixtures/data';
import type { SkillRowTenant, ToolRowTenant, ReceiptRowTenant } from './contracts/registers';

export interface Viewer { isOperator: boolean; cid: string; displayName?: string | null }

interface Spec { rows: unknown[]; source: string; zeroIsExpected: boolean; capturedAt: string; watermark: string | null }

/** Tenant-safe projections — a client sees permitted capability, never fleet internals. */
const skillsTenant = (): SkillRowTenant[] => SKILLS.filter(s => s.distribution_status === 'SERVABLE').map(s => ({ name: s.name, version: s.version, category: s.category, enabled: true }));
const toolsTenant = (): ToolRowTenant[] => TOOLS.map(t => ({ tool_key: t.tool_key, family: t.family, available: t.status === 'live' }));
/** Scoped by CID only. Never by a display name. */
const receiptsTenant = (viewerCid: string): ReceiptRowTenant[] => RECEIPTS.filter(r => r.cid === viewerCid).map(r => ({ id: r.id, kind: r.kind, status: r.status, created_at: r.created_at }));

function fixtureFor(req: HqReadRequest, projection: Projection, viewer: Viewer): Spec {
  const v = req.view ?? '';
  switch (req.module) {
    case 'arsenal':
      if (v === 'advisors') return { rows: ADVISORS, source: 'connector · show_council', zeroIsExpected: false, capturedAt: CAPTURED.advisors, watermark: CAPTURED.advisors };
      if (v === 'tools') return { rows: projection === 'fleet' ? TOOLS : toolsTenant(), source: 'vac · tool_catalog', zeroIsExpected: false, capturedAt: CAPTURED.tools, watermark: CAPTURED.tools };
      return { rows: projection === 'fleet' ? SKILLS : skillsTenant(), source: 'vac · study_skills', zeroIsExpected: false, capturedAt: CAPTURED.skills, watermark: CAPTURED.skills };
    case 'pulse':
      if (v === 'kernel') return { rows: KERNEL_PARTS, source: 'connector · boot_kernel manifest', zeroIsExpected: false, capturedAt: CAPTURED.kernel, watermark: CAPTURED.kernel };
      return { rows: [PULSE], source: 'connector · begin_session', zeroIsExpected: false, capturedAt: CAPTURED.pulse, watermark: CAPTURED.pulse };
    case 'memory':
      return { rows: MEMORY, source: 'vac · memory_entries', zeroIsExpected: false, capturedAt: CAPTURED.memory, watermark: CAPTURED.memory };
    case 'office':
      return { rows: OFFICE_SURFACES, source: 'vac · tenant_surfaces + OFFICE (Notion)', zeroIsExpected: false, capturedAt: CAPTURED.office, watermark: '2026-06-25T00:00:00Z' };
    case 'receipts':
      return { rows: projection === 'fleet' ? RECEIPTS : receiptsTenant(viewer.cid), source: 'vac · save_receipts + ritual_runs', zeroIsExpected: false, capturedAt: CAPTURED.receipts, watermark: CAPTURED.receipts };
    default:
      return { rows: [], source: 'not wired', zeroIsExpected: true, capturedAt: CAPTURED.pulse, watermark: null };
  }
}

export function readEnvelope<T = unknown>(req: HqReadRequest, viewer: Viewer | null | undefined): HqReadEnvelope<T> {
  // MANDATORY VIEWER — no fallback, no fixture rows, for ANY module.
  if (!viewer) {
    return { module: req.module, view: req.view ?? null, projection: 'tenant', ok: false, authorized: false, partial: false,
      reasons: ['no server-derived viewer supplied — identity cannot be self-asserted'], zero_is_expected: false,
      row_count: 0, rows: [], next_cursor: null, provenance: null, state: 'UNAUTHORIZED' };
  }
  const plane = MODULE_PLANE[req.module as HqModule];
  const projection: Projection = viewer.isOperator ? 'fleet' : 'tenant';
  const authorized = plane === 'both' || viewer.isOperator;
  const spec = fixtureFor(req, projection, viewer);
  const rows = spec.rows;
  const asOf = new Date().toISOString();
  const reasons: string[] = [];
  if (!authorized) reasons.push(`module "${req.module}" fleet projection is operator-plane; caller resolved to ${viewer.cid}`);
  // Freshness is anchored on the SNAPSHOT capture time, not the read time.
  const derived = deriveState({ ok: true, authorized, rowCount: rows.length, zeroIsExpected: spec.zeroIsExpected, asOf: authorized ? spec.capturedAt : null, freshnessWindowSec: FRESHNESS_WINDOW_SEC[req.module as HqModule] ?? 300, partial: false });
  // A fixture read is never LIVE, whatever the arithmetic says.
  const state = derived === 'LIVE' ? 'STALE' : derived;
  return {
    module: req.module, view: req.view ?? null, projection, ok: true, authorized, partial: false, reasons,
    zero_is_expected: spec.zeroIsExpected, row_count: authorized ? rows.length : 0, rows: (authorized ? rows : []) as T[],
    next_cursor: null,
    provenance: authorized ? { as_of: asOf, captured_at: spec.capturedAt, source_watermark: spec.watermark, source: spec.source, backend: 'fixture', receipt_id: null, telemetry_id: null, last_successful_read: asOf, last_attempted_read: asOf, connection: 'FIXTURE' } : null,
    state,
  };
}

export function useHqRead<T = unknown>(req: HqReadRequest, viewer: Viewer | null | undefined): HqReadEnvelope<T> {
  const key = `${req.module}::${req.view ?? ''}::${viewer ? viewer.cid + viewer.isOperator : 'none'}`;
  return React.useMemo(() => readEnvelope<T>(req, viewer), [key]);
}
export { MEMORY_STATS } from './fixtures/data';
