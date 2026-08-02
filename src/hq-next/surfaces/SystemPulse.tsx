import React from 'react';
import { useHqRead, type Viewer } from '../useHqRead';
import type { PulseRow, KernelPartRow } from '../contracts/registers';
import { Section, ProvenanceBar, StateBlock, FactTile, FactRow, Badge, StateBadge, RegisterTable, ExceptionsBar, type Column } from '../components/primitives';
const cols: Column<KernelPartRow>[] = [
  { key: 'part', label: 'Part', render: r => <span className="rt">{r.part}</span> },
  { key: 'seq', label: 'Seq', render: r => <span className="rk">{r.seq}</span>, align: 'right' },
  { key: 'bytes', label: 'Bytes', render: r => <span className="num">{r.bytes.toLocaleString()}</span>, align: 'right' },
  { key: 'sha', label: 'sha256', render: r => <span className="rk">{r.sha256_prefix}\u2026</span> },
  { key: 'ok', label: 'Integrity', render: r => r.hash_match ? <Badge kind="act">hash match</Badge> : <Badge kind="hi">MISMATCH</Badge> },
];
export function SystemPulse({ viewer }: { viewer: Viewer }) {
  const pulse = useHqRead<PulseRow>({ module: 'pulse' }, viewer);
  const parts = useHqRead<KernelPartRow>({ module: 'pulse', view: 'kernel' }, viewer);
  const p = pulse.rows[0];
  return (<>
    <div className="hqx-ph"><h1>System Pulse</h1><StateBadge state={pulse.state} /></div>
    <p className="hqx-sub">Identity binding, kernel integrity, session spine. The page that must never lie.</p>
    <Section title="Identity binding" source="connector · begin_session">
      <ProvenanceBar env={pulse} />
      {!p ? <StateBlock state={pulse.state} reasons={pulse.reasons} /> : (<FactRow>
        <FactTile k="Resolved CID" v={p.cid} note={`tenant ${p.tenant}`} tone="good" />
        <FactTile k="Kernel" v={`${p.parts_verified}/${p.parts_total}`} note={p.kernel_sealed ? 'sealed · verified' : 'UNSEALED'} tone={p.parts_verified === p.parts_total ? 'good' : 'bad'} />
        <FactTile k="Last checkpoint" v={p.last_checkpoint_kind ?? '\u2014'} note={p.last_checkpoint_at?.slice(0, 16) ?? 'never'} />
        <FactTile k="Conversation stored" v="0" note="no table records a transcript" tone="bad" />
      </FactRow>)}
      {p && <ExceptionsBar label="key collision" detail="tenants.cob_name 'COB' vs runtime key 'COB-HQ' — a name join returns zero. CID repair is gated work." />}
    </Section>
    <Section title="Kernel integrity" source="connector · boot_kernel">
      <ProvenanceBar env={parts} />
      {parts.row_count === 0 ? <StateBlock state={parts.state} reasons={parts.reasons} /> : <RegisterTable columns={cols} rows={parts.rows} rowKey={r => `${r.part}-${r.seq}`} />}
    </Section>
  </>);
}
