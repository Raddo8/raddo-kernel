/** v0.1 static acceptance, ported to Vitest. Rendering uses react-dom/server. */
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readEnvelope } from '../useHqRead';
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

  const e2 = readEnvelope({ module: 'arsenal', view: 'skills' }, { isOperator: true, cid: 'X', tenant: 'Y' });

  // T2 — fixture provenance carries capture time, not now(): snapshot must be STALE
  it('T2 snapshot ages honestly (STALE, not LIVE)', () => {
    expect(e2.state).toBe('STALE');
  });

  // T3 — projection split: client never receives fleet fields
  it('T3 tenant projection lacks sha/bytes/distribution', () => {
    const e3 = readEnvelope<Record<string, unknown>>({ module: 'arsenal', view: 'skills' }, { isOperator: false, cid: 'C', tenant: 'T' });
    expect(e3.projection).toBe('tenant');
    expect(e3.rows.every(r => !('sha256_prefix' in r) && !('distribution_status' in r) && !('bytes' in r))).toBe(true);
  });

  // T4 — receipts tenant-safe: no tenant column, only own rows
  it('T4 tenant receipts carry no tenant field', () => {
    const e4 = readEnvelope<Record<string, unknown>>({ module: 'receipts' }, { isOperator: false, cid: 'C', tenant: 'COB-HQ' });
    expect(e4.rows.length).toBeGreaterThan(0);
    expect(e4.rows.every(r => !('tenant' in r) && !('layers_failed' in r))).toBe(true);
  });

  it('T4b other tenant sees zero receipts (honest, not LIVE)', () => {
    const e4b = readEnvelope<Record<string, unknown>>({ module: 'receipts' }, { isOperator: false, cid: 'C', tenant: 'OTHER' });
    expect(e4b.rows.length).toBe(0);
    expect(e4b.state).not.toBe('LIVE');
  });

  // T5 — telemetry vs receipt: routine read carries telemetry_id, no receipt_id
  it('T5 routine read telemetry-only', () => {
    expect(e2.provenance?.receipt_id).toBeNull();
    expect(e2.provenance?.telemetry_id).toBeTruthy();
  });

  // T6 — watermark distinct from as_of exists in contract
  it('T6 source_watermark present', () => {
    expect('source_watermark' in (e2.provenance ?? {})).toBe(true);
  });

  // T7 — production render contains no preview instrumentation
  const html = renderToString(<HqNext viewer={{ isOperator: true, cid: 'PROBE-CID', tenant: 'PROBE-T' }} />);
  it('T7 no preview strings in production render', () => {
    expect(html.includes('PREVIEW HARNESS')).toBe(false);
    expect(html.includes('as captured')).toBe(false);
  });
  it('T7b FIXTURE SNAPSHOT label present', () => {
    expect(html.includes('FIXTURE SNAPSHOT')).toBe(true);
  });

  // T8 — operator-only pages refused to client render
  it('T8 client rail hides operator ledgers', () => {
    const chtml = renderToString(<HqNext viewer={{ isOperator: false, cid: 'C1', tenant: 'T1' }} />);
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
