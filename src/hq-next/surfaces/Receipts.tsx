import React from 'react';
import { useHqRead, type Viewer, type ForceState } from '../useHqRead';
import type { ReceiptRowFleet, ReceiptRowTenant } from '../contracts/registers';
import { Section, ProvenanceBar, StateBlock, Badge, StateBadge, RegisterTable, type Column } from '../components/primitives';
export function Receipts({ viewer, force }: { viewer: Viewer; force?: ForceState }) {
  const env = useHqRead<ReceiptRowFleet | ReceiptRowTenant>({ module: 'receipts' }, viewer, force);
  const fleet = env.projection === 'fleet';
  const fleetCols: Column<ReceiptRowFleet>[] = [
    { key: 'i', label: 'Receipt', render: r => <span className="rk">{r.id}</span> },
    { key: 'k', label: 'Kind', render: r => <Badge kind="private">{r.kind}</Badge> },
    { key: 't', label: 'Tenant', render: r => <span className="rt">{r.tenant}</span> },
    { key: 's', label: 'Status', render: r => <Badge kind={r.status === 'SUCCESS' ? 'act' : 'pend'}>{r.status}</Badge> },
    { key: 'f', label: 'Failed layers', render: r => <span className="num">{r.layers_failed}</span>, align: 'right' },
    { key: 'a', label: 'At', render: r => <span className="rk">{r.created_at.slice(0, 16)}</span> },
  ];
  const tenantCols: Column<ReceiptRowTenant>[] = [
    { key: 'i', label: 'Receipt', render: r => <span className="rk">{r.id}</span> },
    { key: 'k', label: 'Kind', render: r => <Badge kind="private">{r.kind}</Badge> },
    { key: 's', label: 'Status', render: r => <Badge kind={r.status === 'SUCCESS' ? 'act' : 'pend'}>{r.status}</Badge> },
    { key: 'a', label: 'At', render: r => <span className="rk">{r.created_at.slice(0, 16)}</span> },
  ];
  return (<>
    <div className="hqx-ph"><h1>Receipts &amp; Audit</h1><StateBadge state={env.state} /></div>
    <p className="hqx-sub">{fleet ? 'Fleet projection: every save, ritual and execution receipt, all tenants.' : 'Your receipts. No other tenant appears here.'}</p>
    <Section title="Receipts" source={fleet ? 'vac · save_receipts (fleet)' : 'vac · save_receipts (tenant-safe)'}>
      <ProvenanceBar env={env} />
      {env.row_count === 0 ? <StateBlock state={env.state} reasons={env.reasons} />
        : fleet ? <RegisterTable columns={fleetCols} rows={env.rows as ReceiptRowFleet[]} rowKey={r => r.id} />
        : <RegisterTable columns={tenantCols} rows={env.rows as ReceiptRowTenant[]} rowKey={r => r.id} />}
    </Section>
  </>);
}
