import React from 'react';
import { Section, StateBlock, StateBadge } from '../components/primitives';
/** Businesses · Lanes · Workstreams — honest NOT CONNECTED. Domain model undecided; NOT forced into items. */
export function Entities({ kind }: { kind: 'business'|'lane'|'workstream' }) {
  return (<>
    <div className="hqx-ph"><h1>{kind[0].toUpperCase() + kind.slice(1)}s</h1><StateBadge state="ASSERTED_STATE_WITHOUT_SUBSTRATE" /></div>
    <p className="hqx-sub">The interface exists before the data, deliberately. The domain model (tenant \u2192 business \u2192 lane \u2192 workstream \u2192 initiative) is an open decision \u2014 and this page will not pretend otherwise.</p>
    <Section title="Status" source="domain model undecided">
      <StateBlock state="ASSERTED_STATE_WITHOUT_SUBSTRATE" reasons={[
        'items is CRM-workspace scoped (requires account_id, workspace-member authority) \u2014 rejected as substrate',
        'no lane/workstream table exists; creating one awaits the entity-domain ruling',
      ]} />
    </Section>
  </>);
}
