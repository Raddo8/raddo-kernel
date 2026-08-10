import React from 'react';
import { Section, StateBlock, StateBadge } from '../components/primitives';

type Kind = 'business' | 'lane' | 'workstream';
const KINDS: { id: Kind; label: string }[] = [
  { id: 'business', label: 'Businesses' },
  { id: 'lane', label: 'Lanes' },
  { id: 'workstream', label: 'Workstreams' },
];

/** Businesses · Lanes · Workstreams — honest NOT CONNECTED. Domain model undecided; NOT forced into items. */
export function Entities({ kind }: { kind?: Kind } = {}) {
  const [active, setActive] = React.useState<Kind>(kind ?? 'business');
  const current = KINDS.find(k => k.id === active) ?? KINDS[0];
  return (<>
    <div className="hqx-ph"><h1>{current.label}</h1><StateBadge state="ASSERTED_STATE_WITHOUT_SUBSTRATE" /></div>
    <div className="hqx-tabs" role="tablist" aria-label="Entity kind">
      {KINDS.map(k => (
        <button key={k.id} type="button" role="tab" aria-selected={active === k.id}
          className={active === k.id ? 'on' : ''} onClick={() => setActive(k.id)}>
          {k.label}
        </button>
      ))}
    </div>
    <p className="hqx-sub">The interface exists before the data, deliberately. The domain model (tenant to business to lane to workstream to initiative) is an open decision, and this page will not pretend otherwise.</p>
    <Section title="Status" source="domain model undecided">
      <StateBlock state="ASSERTED_STATE_WITHOUT_SUBSTRATE" reasons={[
        'items is CRM-workspace scoped (requires account_id, workspace-member authority) \u00b7 rejected as substrate',
        'no lane/workstream table exists; creating one awaits the entity-domain ruling',
      ]} />
    </Section>
  </>);
}
