/** PREVIEW HARNESS — never imported by production code, never in the production bundle.
 * The ONLY place synthetic identities and forced states exist. */
import React from 'react';
import HqNext from '../HqNext';
import type { Viewer, ForceState } from '../useHqRead';
const PREVIEW_VIEWERS: Record<'operator'|'client', Viewer> = {
  operator: { isOperator: true, cid: 'PREVIEW-OPERATOR', tenant: 'PREVIEW-HQ' },
  client: { isOperator: false, cid: 'PREVIEW-CLIENT', tenant: 'COB-HQ' },
};
export function PreviewHarness() {
  const [as, setAs] = React.useState<'operator'|'client'>('operator');
  const [force, setForce] = React.useState<ForceState>(undefined);
  return (<div className="hqx">
    <div className="flagbar"><b>PREVIEW HARNESS</b><span>· not part of the production build</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button className={`seg ${as === 'operator' ? 'on' : ''}`} onClick={() => setAs('operator')}>operator</button>
        <button className={`seg ${as === 'client' ? 'on' : ''}`} onClick={() => setAs('client')}>client</button>
        {([undefined, 'stale', 'degraded', 'empty', 'unauthorized'] as ForceState[]).map(f => (
          <button key={String(f)} className={`seg ${force === f ? 'on' : ''}`} onClick={() => setForce(f)}>{f ?? 'as captured'}</button>))}
      </span>
    </div>
    <HqNext viewer={PREVIEW_VIEWERS[as]} forceState={force} />
  </div>);
}
