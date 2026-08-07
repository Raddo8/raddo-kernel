/** HQ-NEXT SHELL · HQ React Foundation v0.1
 * PRODUCTION component. Contains NO preview instrumentation, NO view-as toggle,
 * NO forced states, NO hardcoded identity. `viewer` is REQUIRED and server-derived
 * by the host composition (routes.tsx). The preview harness lives in preview/ and
 * is excluded from the production bundle. */
import React from 'react';
import './styles/hq-next.css';
import { SystemPulse } from './surfaces/SystemPulse';
import { Arsenal } from './surfaces/Arsenal';
import { Receipts } from './surfaces/Receipts';
import { Entities } from './surfaces/Entities';
import { INTERFACES, COUNTS } from './registry/interface-coverage';
import { REGISTERS } from './registry/register-migration';
import { Section, StateBlock, Badge, RegisterTable, type Column } from './components/primitives';
import { AggregationPanel } from './components/AggregationPanel';
import { RollUp } from './components/RollUp';
import type { Viewer } from './useHqRead';
import type { InterfaceEntry } from './registry/interface-coverage';
import type { RegisterEntry } from './registry/register-migration';

const NAV: { id: string; label: string; group: string; operatorOnly?: boolean }[] = [
  { id: 'kernel', label: 'HQ \u00b7 roll up', group: 'System Pulse' },
  { id: 'arsenal', label: 'Intelligence Registry', group: 'Intelligence Registry' },
  { id: 'receipts', label: 'Receipts & Audit', group: 'Receipts & Audit' },
  { id: 'business', label: 'Businesses', group: 'Entities' },
  { id: 'lane', label: 'Lanes', group: 'Entities' },
  { id: 'workstream', label: 'Workstreams', group: 'Entities' },
  { id: 'coverage', label: 'Coverage Registry', group: 'INTERFACE & INTEGRATE', operatorOnly: true },
  { id: 'migration', label: 'Migration Ledger', group: 'INTERFACE & INTEGRATE', operatorOnly: true },
];

function Coverage() {
  const cols: Column<InterfaceEntry>[] = [
    { key: 'id', label: 'Interface', render: r => <span className="rt">{r.label}</span> },
    { key: 'p', label: 'Plane', render: r => <Badge kind="private">{r.plane}</Badge> },
    { key: 's', label: 'Source of truth', render: r => <span className="rd">{r.sourceOfTruth}</span> },
    { key: 'r', label: 'Reuses', render: r => <span className="rk">{r.reuses ?? '\u2014'}</span> },
    { key: 'l', label: 'Lifecycle', render: r => <Badge kind={r.life === 'FIXTURE_VALIDATED' ? 'pend' : r.life === 'MISSING' ? 'hi' : 'dorm'}>{r.life}</Badge> },
  ];
  return (<>
    <div className="hqx-ph"><h1>Interface Coverage Registry</h1></div>
    <p className="hqx-sub">Ledger One \u2014 typed source. {Object.entries(COUNTS).map(([k, v]) => `${k} ${v}`).join(' · ')}. Zero LIVE_CONNECTED; the rail does not lie.</p>
    <Section title={`All interface definitions · ${INTERFACES.length}`} source="src/hq-next/registry/interface-coverage.ts">
      <RegisterTable columns={cols} rows={INTERFACES} rowKey={r => r.id} />
    </Section>
  </>);
}
function Migration() {
  const cols: Column<RegisterEntry>[] = [
    { key: 'r', label: 'Register', render: r => <span className="rt">{r.register}</span> },
    { key: 'h', label: 'Home today', render: r => <Badge kind={r.currentHome === 'hq' ? 'act' : 'notion'}>{r.currentHome}</Badge> },
    { key: 'g', label: 'Registration', render: r => <Badge kind={r.registration === 'UNREGISTERED' ? 'hi' : 'sealed'}>{r.registration}</Badge> },
    { key: 's', label: 'Substrate', render: r => <Badge kind={r.substrate === 'ABSENT' ? 'hi' : r.substrate === 'PARTIAL' ? 'pend' : 'act'}>{r.substrate}</Badge> },
    { key: 'b', label: 'Backfill', render: r => <span className="rk">{r.backfill}</span> },
    { key: 'c', label: 'Cutover', render: r => <span className="rk">{r.cutover}</span> },
    { key: 'k', label: 'Rollback', render: r => <span className="rk">{r.rollback}</span> },
  ];
  return (<>
    <div className="hqx-ph"><h1>Register Migration Ledger</h1></div>
    <p className="hqx-sub">Ledger Two \u2014 system-of-record only. No register flips because data was copied.</p>
    <Section title={`All registers · ${REGISTERS.length}`} source="src/hq-next/registry/register-migration.ts">
      <RegisterTable columns={cols} rows={REGISTERS} rowKey={r => r.register} />
    </Section>
  </>);
}

export interface HqNextProps { viewer: Viewer }
export function HqNext({ viewer }: HqNextProps) {
  const [page, setPage] = React.useState('kernel');
  React.useEffect(() => {
    const apply = () => { const h = (location.hash || '').replace(/^#/, ''); if (h && NAV.some(n => n.id === h)) setPage(h); };
    apply(); window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);
  const visible = NAV.filter(n => viewer.isOperator || !n.operatorOnly);
  const body = (() => {
    if (!viewer.isOperator && NAV.find(n => n.id === page)?.operatorOnly) return <Section title="Access"><StateBlock state="UNAUTHORIZED" /></Section>;
    switch (page) {
      case 'kernel': return <SystemPulse viewer={viewer} />;
      case 'arsenal': return <Arsenal viewer={viewer} />;
      case 'receipts': return <Receipts viewer={viewer} />;
      case 'business': case 'lane': case 'workstream': return <Entities kind={page as 'business'|'lane'|'workstream'} />;
      case 'coverage': return <Coverage />;
      case 'migration': return <Migration />;
      default: return <Section title="Not ported"><StateBlock state="UNVERIFIED" /></Section>;
    }
  })();
  // The roll up is the default view of HQ: the aggregation, the other pages,
  // then the pulse, then the receipts. Every other section stays one tab away.
  const isHome = page === 'kernel';
  return (<div className="hqx">
    <main className="hqx-main">
      <div className="hqx-tabs" role="tablist" aria-label="HQ sections">
        {visible.map(n => (
          <button key={n.id} type="button" role="tab" aria-selected={page === n.id}
            className={page === n.id ? 'on' : ''}
            onClick={() => { setPage(n.id); try { location.hash = n.id; } catch { /* hash is a convenience, not a requirement */ } }}>
            {n.label}
          </button>
        ))}
      </div>
      {isHome ? <><AggregationPanel /><RollUp />{body}<Receipts viewer={viewer} /></> : body}
    </main>
  </div>);
}
export default HqNext;

