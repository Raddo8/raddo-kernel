/** v0.1 static acceptance — run with react-dom/server, no browser needed. */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { readEnvelope } from './src/hq-next/useHqRead';
import HqNext from './src/hq-next/HqNext';
import { INTERFACES } from './src/hq-next/registry/interface-coverage';
import { REGISTERS } from './src/hq-next/registry/register-migration';
let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`); };
// T1 — NO VIEWER → UNAUTHORIZED, zero rows, for a 'both'-plane module (old A3 failure)
const e1 = readEnvelope({ module: 'arsenal', view: 'skills' }, null);
t('T1 no-viewer yields UNAUTHORIZED + 0 rows', e1.state === 'UNAUTHORIZED' && e1.row_count === 0 && e1.rows.length === 0);
// T2 — fixture provenance carries capture time, not now(): snapshot must be STALE
const e2 = readEnvelope({ module: 'arsenal', view: 'skills' }, { isOperator: true, cid: 'X', tenant: 'Y' });
t('T2 snapshot ages honestly (STALE, not LIVE)', e2.state === 'STALE', `state=${e2.state} as_of=${e2.provenance?.as_of}`);
// T3 — projection split: client never receives fleet fields
const e3 = readEnvelope<any>({ module: 'arsenal', view: 'skills' }, { isOperator: false, cid: 'C', tenant: 'T' });
t('T3 tenant projection lacks sha/bytes/distribution', e3.projection === 'tenant' && e3.rows.every((r: any) => !('sha256_prefix' in r) && !('distribution_status' in r) && !('bytes' in r)));
// T4 — receipts tenant-safe: no tenant column, only own rows
const e4 = readEnvelope<any>({ module: 'receipts' }, { isOperator: false, cid: 'C', tenant: 'COB-HQ' });
t('T4 tenant receipts carry no tenant field', e4.rows.length > 0 && e4.rows.every((r: any) => !('tenant' in r) && !('layers_failed' in r)));
const e4b = readEnvelope<any>({ module: 'receipts' }, { isOperator: false, cid: 'C', tenant: 'OTHER' });
t('T4b other tenant sees zero receipts (EMPTY_UNEXPECTED, honest)', e4b.rows.length === 0 && e4b.state !== 'LIVE');
// T5 — telemetry vs receipt: routine read carries telemetry_id, no receipt_id
t('T5 routine read telemetry-only', e2.provenance?.receipt_id === null && !!e2.provenance?.telemetry_id);
// T6 — watermark distinct from as_of exists in contract
t('T6 source_watermark present', 'source_watermark' in (e2.provenance ?? {}));
// T7 — production render contains no preview instrumentation and no production identity
const html = renderToString(<HqNext viewer={{ isOperator: true, cid: 'PROBE-CID', tenant: 'PROBE-T' }} />);
t('T7 no preview strings in production render', !html.includes('PREVIEW HARNESS') && !html.includes('as captured'));
t('T7b FIXTURE SNAPSHOT label present', html.includes('FIXTURE SNAPSHOT'));
// T8 — operator-only pages refused to client render
const chtml = renderToString(<HqNext viewer={{ isOperator: false, cid: 'C1', tenant: 'T1' }} />);
t('T8 client rail hides operator ledgers', !chtml.includes('Coverage Registry'));
// T9 — registries populated as source
t('T9 coverage registry >= 40 entries', INTERFACES.length >= 40, `${INTERFACES.length}`);
t('T9b migration ledger >= 14 registers, none cutover', REGISTERS.length >= 14 && REGISTERS.every(r => r.cutover === 'NOT_SCHEDULED'));
console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
