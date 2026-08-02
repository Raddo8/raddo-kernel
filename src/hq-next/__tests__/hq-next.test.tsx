/** v0.1 static acceptance + correction-dispatch regression, in Vitest. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import { readEnvelope } from '../useHqRead';
import { deriveState } from '../contracts/status';
import HqNext from '../HqNext';
import { INTERFACES } from '../registry/interface-coverage';
import { REGISTERS } from '../registry/register-migration';

describe('hq-next v0.1 acceptance', () => {
  // T1 — NO VIEWER → UNAUTHORIZED, zero rows, for a 'both'-plane module
  it('T1 no-viewer yields UNAUTHORIZED + 0 rows', () => {
    const e1 = readEnvelope({ module: 'arsenal', view: 'skills' }, null);
    expect(e1.state).toBe('UNAUTHORIZED');
    expect(e1.row_count).toBe(0);
    expect(e1.rows.length).toBe(0);
  });

  const e2 = readEnvelope({ module: 'arsenal', view: 'skills' }, { isOperator: true, cid: 'X', displayName: 'Y' });

  // T2 — fixture provenance carries capture time, not now(): snapshot must be STALE
  it('T2 snapshot ages honestly (STALE, not LIVE)', () => {
    expect(e2.state).toBe('STALE');
  });

  // T3 — projection split: client never receives fleet fields
  it('T3 tenant projection lacks sha/bytes/distribution', () => {
    const e3 = readEnvelope<Record<string, unknown>>({ module: 'arsenal', view: 'skills' }, { isOperator: false, cid: 'C', displayName: 'T' });
    expect(e3.projection).toBe('tenant');
    expect(e3.rows.every(r => !('sha256_prefix' in r) && !('distribution_status' in r) && !('bytes' in r))).toBe(true);
  });

  // T4 — receipts tenant-safe: no tenant column, only own rows
  it('T4 tenant receipts carry no tenant field', () => {
    const e4 = readEnvelope<Record<string, unknown>>({ module: 'receipts' }, { isOperator: false, cid: 'CID-100001', displayName: 'COB-HQ' });
    expect(e4.rows.length).toBeGreaterThan(0);
    expect(e4.rows.every(r => !('tenant' in r) && !('cid' in r) && !('layers_failed' in r))).toBe(true);
  });

  it('T4b other tenant sees zero receipts (honest, not LIVE)', () => {
    const e4b = readEnvelope<Record<string, unknown>>({ module: 'receipts' }, { isOperator: false, cid: 'CID-100002', displayName: 'COB-HQ' });
    expect(e4b.rows.length).toBe(0);
    expect(e4b.state).not.toBe('LIVE');
  });

  // T5 — fixture reads carry no telemetry or receipt id
  it('T5 fixture read is unreceipted and untelemetered', () => {
    expect(e2.provenance?.receipt_id).toBeNull();
    expect(e2.provenance?.telemetry_id).toBeNull();
  });

  // T6 — watermark distinct from as_of exists in contract
  it('T6 source_watermark present', () => {
    expect('source_watermark' in (e2.provenance ?? {})).toBe(true);
  });

  // T7 — production render contains no preview instrumentation
  const html = renderToString(<HqNext viewer={{ isOperator: true, cid: 'PROBE-CID', displayName: 'PROBE-T' }} />);
  it('T7 no preview strings in production render', () => {
    expect(html.includes('PREVIEW HARNESS')).toBe(false);
    expect(html.includes('as captured')).toBe(false);
  });
  it('T7b FIXTURE SNAPSHOT label present', () => {
    expect(html.includes('FIXTURE SNAPSHOT')).toBe(true);
  });

  // T8 — operator-only pages refused to client render
  it('T8 client rail hides operator ledgers', () => {
    const chtml = renderToString(<HqNext viewer={{ isOperator: false, cid: 'C1', displayName: 'T1' }} />);
    expect(chtml.includes('Coverage Registry')).toBe(false);
  });

  // T9 — registries populated as source
  it('T9 coverage registry >= 40 entries', () => {
    expect(INTERFACES.length).toBeGreaterThanOrEqual(40);
  });
  it('T9b migration ledger >= 14 registers, none cutover', () => {
    expect(REGISTERS.length).toBeGreaterThanOrEqual(14);
    expect(REGISTERS.every(r => r.cutover === 'NOT_SCHEDULED')).toBe(true);
  });
});

describe('correction dispatch regressions', () => {
  // R1 — the read seam holds no synthetic-state machinery
  it('R1 useHqRead.ts has no force token and no preview import', () => {
    const src = readFileSync(join(process.cwd(), 'src/hq-next/useHqRead.ts'), 'utf8');
    expect(/force/i.test(src)).toBe(false);
    expect(src.includes('preview/')).toBe(false);
    expect(readEnvelope.length).toBe(2);
  });

  // R2 — CID, not display name, is the scoping key
  it('R2 identical displayName, different cid → disjoint receipts', () => {
    const a = readEnvelope<{ id: string }>({ module: 'receipts' }, { isOperator: false, cid: 'CID-100001', displayName: 'COB-HQ' });
    const b = readEnvelope<{ id: string }>({ module: 'receipts' }, { isOperator: false, cid: 'CID-100002', displayName: 'COB-HQ' });
    expect(a.rows.length).toBeGreaterThan(0);
    expect(b.rows.length).toBe(0);
    const aIds = new Set(a.rows.map(r => r.id));
    expect(b.rows.some(r => aIds.has(r.id))).toBe(false);
  });

  // R3 — no required tenant field; scoping ignores the label entirely
  it('R3 viewer needs no tenant record field; label does not scope', () => {
    const noLabel = readEnvelope<{ id: string }>({ module: 'receipts' }, { isOperator: false, cid: 'CID-100001' });
    const wrongLabel = readEnvelope<{ id: string }>({ module: 'receipts' }, { isOperator: false, cid: 'CID-100001', displayName: 'SOMETHING-ELSE' });
    expect(noLabel.rows.map(r => r.id)).toEqual(wrongLabel.rows.map(r => r.id));
    expect(noLabel.rows.length).toBeGreaterThan(0);
  });

  // R4 — fixture provenance tells the truth
  it('R4 fixture envelope reports FIXTURE, never LIVE', () => {
    const p = e4FixtureEnv.provenance!;
    expect(p.connection).toBe('FIXTURE');
    expect(p.telemetry_id).toBeNull();
    expect(p.receipt_id).toBeNull();
    expect(e4FixtureEnv.state).not.toBe('LIVE');
    expect(p.captured_at).not.toBeNull();
    expect(p.captured_at).not.toBe(p.as_of);
  });

  // R5 — an empty scoped read is a finding, not staleness
  it('R5 zero-row cid → EMPTY_UNEXPECTED', () => {
    const e = readEnvelope({ module: 'receipts' }, { isOperator: false, cid: 'CID-999999' });
    expect(e.state).toBe('EMPTY_UNEXPECTED');
  });

  // R6 — deriveState orders emptiness before age
  it('R6 old empty result is EMPTY_UNEXPECTED, not STALE', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86400 * 1000).toISOString();
    expect(deriveState({ authorized: true, ok: true, rowCount: 0, zeroIsExpected: false, asOf: eightDaysAgo, freshnessWindowSec: 300 })).toBe('EMPTY_UNEXPECTED');
  });
});

const e4FixtureEnv = readEnvelope({ module: 'arsenal', view: 'skills' }, { isOperator: true, cid: 'CID-100001' });
