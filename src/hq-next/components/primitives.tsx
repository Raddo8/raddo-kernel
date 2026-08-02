import React from 'react';
import { EPISTEMIC, type EpistemicState } from '../contracts/status';
import type { HqReadEnvelope } from '../contracts/hq-read';
export function Badge({ kind, children, title }: { kind?: string; children: React.ReactNode; title?: string }) { return <span className={`g ${kind ?? ''}`} title={title}>{children}</span>; }
export function StateBadge({ state }: { state: EpistemicState }) { const d = EPISTEMIC[state]; return <span className={`g e-${d.tone}`} title={d.meaning}>{d.label}</span>; }
export function Section({ title, source, right, children }: { title: string; source?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return <section className="sec"><div className="sec-h"><h2>{title}</h2>{right}{source && <span className="src">{source}</span>}</div>{children}</section>;
}
export function ProvenanceBar({ env }: { env: HqReadEnvelope<unknown> }) {
  const p = env.provenance;
  if (!p) return <div className="prov"><span className="warnq">NO PROVENANCE</span><span className="sep">·</span><span>cannot state where or when it read</span></div>;
  const age = Math.max(0, Math.round((Date.now() - new Date(p.as_of).getTime()) / 1000));
  const ageTxt = age < 90 ? `${age}s ago` : age < 5400 ? `${Math.round(age/60)}m ago` : `${Math.round(age/3600)}h ago`;
  return (<div className="prov">
    <StateBadge state={env.state} /><span className="sep">·</span><span>{p.source}</span>
    <span className="sep">·</span><span>read {ageTxt}</span>
    <span className="sep">·</span><span>watermark {p.source_watermark ? p.source_watermark.slice(0,10) : 'none'}</span>
    <span className="sep">·</span><span>{env.row_count} rows</span>
    <span className="sep">·</span><span>{env.projection} projection</span>
    <span className="sep">·</span><span>backend {p.backend}</span>
    <span className="sep">·</span>{p.receipt_id ? <span>receipt {p.receipt_id}</span> : p.telemetry_id ? <span>telemetry {p.telemetry_id}</span> : <span className="warnq">UNRECEIPTED</span>}
  </div>);
}
export function StateBlock({ state, reasons }: { state: EpistemicState; reasons?: string[] }) {
  const d = EPISTEMIC[state];
  return (<div className={`stateblk ${d.tone === 'bad' ? 'bad' : d.tone === 'warn' ? 'warn' : 'unknown'}`}>
    <StateBadge state={state} /><h3>{state === 'EMPTY_UNEXPECTED' ? 'Nothing here — and that is the finding.' : state === 'UNAUTHORIZED' ? 'You are not permitted to read this.' : d.label}</h3>
    <p>{d.meaning}</p>{reasons?.map((r, i) => <p key={i} style={{ marginTop: 6, color: 'var(--err)', fontFamily: 'var(--mono)', fontSize: 9.5 }}>— {r}</p>)}
  </div>);
}
export function FactTile({ k, v, note, tone }: { k: string; v: React.ReactNode; note?: string; tone?: 'good'|'warn'|'bad' }) {
  return <div className={`fct ${tone ?? ''}`}><div className="k">{k}</div><div className="v">{v}</div>{note && <div className="n">{note}</div>}</div>;
}
export function FactRow({ children }: { children: React.ReactNode }) { return <div className="fct-row">{children}</div>; }
export function ExceptionsBar({ label, detail }: { label: string; detail: string }) { return <div className="xbar"><span className="xt">{label}</span><span className="xd">{detail}</span></div>; }
export interface Column<R> { key: string; label: string; render: (r: R) => React.ReactNode; align?: 'right' }
export function RegisterTable<R>({ columns, rows, rowKey }: { columns: Column<R>[]; rows: R[]; rowKey: (r: R) => string }) {
  return (<table className="reg"><thead><tr>{columns.map(c => <th key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={rowKey(r)}>{columns.map(c => <td key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>{c.render(r)}</td>)}</tr>)}</tbody></table>);
}
