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
import { Section, StateBlock } from './components/primitives';
import { AggregationPanel } from './components/AggregationPanel';
import { RequestsStrip } from './components/RequestsStrip';
import { RollUp } from './components/RollUp';
import type { Viewer } from './useHqRead';

const NAV: { id: string; label: string; group: string; operatorOnly?: boolean }[] = [
  { id: 'kernel', label: 'Overview \u00b7 roll up', group: 'System Pulse' },
  { id: 'arsenal', label: 'Intelligence Registry', group: 'Intelligence Registry' },
  { id: 'receipts', label: 'Receipts & Audit', group: 'Receipts & Audit' },
  { id: 'entities', label: 'Entities', group: 'Entities' },
];

export interface HqNextProps { viewer: Viewer }
export function HqNext({ viewer }: HqNextProps) {
  const [page, setPage] = React.useState('kernel');
  const [reqNonce, setReqNonce] = React.useState(0);
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
      case 'entities': return <Entities />;
      default: return <Section title="Not ported"><StateBlock state="UNVERIFIED" /></Section>;
    }
  })();
  // The roll up is the default view of HQ: the aggregation, what has been asked
  // for, the other pages, then the pulse, then the receipts.
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
      {isHome ? (
        <>
          <AggregationPanel onRequested={() => setReqNonce(n => n + 1)} />
          <RequestsStrip nonce={reqNonce} />
          <RollUp />
          {body}
          <Receipts viewer={viewer} />
        </>
      ) : body}
    </main>
  </div>);
}
export default HqNext;
