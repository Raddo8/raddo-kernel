/** HQ-NEXT v0.1 · the only seam. No component imports a DB client or names a table.
 * v0.1 CORRECTIONS APPLIED:
 * 1. viewer is MANDATORY. There is no UNRESOLVED fallback that returns rows —
 *    a missing viewer yields an UNAUTHORIZED envelope with zero rows for EVERY
 *    module, including modules whose plane is 'both'. (Old A3 failure closed.)
 * 2. Fixture provenance carries the snapshot's TRUE capture time, never now().
 * 3. Projection is decided per-viewer: operator → fleet; client → tenant-safe.
 *    In production this decision is SERVER-side from derived authority; this
 *    mirror exists so rendering matches what the server would send. */
import React from 'react';
import { type HqReadEnvelope, type HqReadRequest, type HqModule, type Projection, FRESHNESS_WINDOW_SEC, MODULE_PLANE } from './contracts/hq-read';
import { deriveState } from './contracts/status';
import { CAPTURED, SKILLS, ADVISORS, TOOLS, PULSE, KERNEL_PARTS, MEMORY, OFFICE_SURFACES, RECEIPTS } from './fixtures/data';
import type { SkillRowTenant, ToolRowTenant, ReceiptRowTenant } from './contracts/registers';

export interface Viewer { isOperator: boolean; cid: string; tenant: string }
export type ForceState = undefined | 'stale' | 'degraded' | 'unauthorized' | 'empty';

interface Spec { rows: unknown[]; source: string; zeroIsExpected: boolean; capturedAt: string; watermark: string | null }

/** Tenant-safe projections — a client sees permitted capability, never fleet internals. */
const skillsTenant = (): SkillRowTenant[] => SKILLS.filter(s => s.distribution_status === 'SERVABLE').map(s => ({ name: s.name, version: s.version, category: s.category, enabled: true }));
const toolsTenant = (): ToolRowTenant[] => TOOLS.map(t => ({ tool_key: t.tool_key, family: t.family, available: t.status === 'live' }));
const receiptsTenant = (viewerTenant: string): ReceiptRowTenant[] => RECEIPTS.filter(r => r.tenant === viewerTenant).map(r => ({ id: r.id, kind: r.kind, status: r.status, created_at: r.created_at }));

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
      return { rows: projection === 'fleet' ? RECEIPTS : receiptsTenant(viewer.tenant), source: 'vac · save_receipts + ritual_runs', zeroIsExpected: false, capturedAt: CAPTURED.receipts, watermark: CAPTURED.receipts };
    default:
      return { rows: [], source: 'not wired', zeroIsExpected: true, capturedAt: CAPTURED.pulse, watermark: null };
  }
}

export function readEnvelope<T = unknown>(req: HqReadRequest, viewer: Viewer | null | undefined, force?: ForceState): HqReadEnvelope<T> {
  // MANDATORY VIEWER — no fallback, no fixture rows, for ANY module.
  if (!viewer) {
    return { module: req.module, view: req.view ?? null, projection: 'tenant', ok: false, authorized: false, partial: false,
      reasons: ['no server-derived viewer supplied — identity cannot be self-asserted'], zero_is_expected: false,
      row_count: 0, rows: [], next_cursor: null, provenance: null, state: 'UNAUTHORIZED' };
  }
  const plane = MODULE_PLANE[req.module as HqModule];
  const projection: Projection = viewer.isOperator ? 'fleet' : 'tenant';
  const authorized = force === 'unauthorized' ? false : (plane === 'both' || viewer.isOperator);
  const spec = fixtureFor(req, projection, viewer);
  const rows = force === 'empty' ? [] : spec.rows;
  const ok = force !== 'degraded';
  const partial = force === 'degraded';
  const asOf = force === 'stale' ? new Date(new Date(spec.capturedAt).getTime() - 6 * 3600 * 1000).toISOString() : spec.capturedAt;
  const reasons: string[] = [];
  if (partial) reasons.push('one source leg failed; remainder shown');
  if (!authorized) reasons.push(`module "${req.module}" fleet projection is operator-plane; caller resolved to ${viewer.cid}`);
  const state = deriveState({ ok, authorized, rowCount: rows.length, zeroIsExpected: spec.zeroIsExpected, asOf: authorized ? asOf : null, freshnessWindowSec: FRESHNESS_WINDOW_SEC[req.module as HqModule] ?? 300, partial });
  return {
    module: req.module, view: req.view ?? null, projection, ok, authorized, partial, reasons,
    zero_is_expected: spec.zeroIsExpected, row_count: authorized ? rows.length : 0, rows: (authorized ? rows : []) as T[],
    next_cursor: null,
    provenance: authorized ? { as_of: asOf, source_watermark: spec.watermark, source: spec.source, backend: 'fixture', receipt_id: null, telemetry_id: 'fixture-telemetry', last_successful_read: asOf, last_attempted_read: asOf, connection: 'ONLINE' } : null,
    state,
  };
}

export function useHqRead<T = unknown>(req: HqReadRequest, viewer: Viewer | null | undefined, force?: ForceState): HqReadEnvelope<T> {
  const key = `${req.module}::${req.view ?? ''}::${force ?? ''}::${viewer ? viewer.cid + viewer.isOperator : 'none'}`;
  return React.useMemo(() => readEnvelope<T>(req, viewer, force), [key]);
}
export { MEMORY_STATS } from './fixtures/data';
