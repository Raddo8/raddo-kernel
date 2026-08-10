/** HQ-NEXT · REQUESTS STRIP
 * Titles and state only. Detail lives in the drawer, opened on selection.
 * Renders nothing when there is nothing asked for. */
import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import '../styles/aggregation.css';

export interface RequestRow {
  request_id: string;
  action: string;
  title: string | null;
  state: string;
  requested_at: string | null;
  ack_at: string | null;
  fulfilled_at: string | null;
  outcome: string | null;
}

const STATE_LABEL: Record<string, string> = {
  requested: 'requested',
  acknowledged: 'acknowledged',
  in_progress: 'in progress',
  fulfilled: 'fulfilled',
  declined: 'declined',
};

function when(raw: string | null): string {
  if (!raw) return 'not recorded';
  const d = new Date(raw);
  return Number.isNaN(d.getTime())
    ? raw
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Detail({ row, onClose }: { row: RequestRow; onClose: () => void }) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="drw-scrim" onClick={onClose} />
      <aside className="drw" role="dialog" aria-modal="true" aria-label="Request detail">
        <div className="drw-h">
          <div style={{ minWidth: 0 }}>
            <h2>{row.title ?? row.action}</h2>
            <div className="rk">{row.action}</div>
          </div>
          <button ref={closeRef} className="seg" onClick={onClose}>Close</button>
        </div>
        <div className="drw-b">
          <div className="drw-f"><div className="k">State</div><div className="v">{STATE_LABEL[row.state] ?? row.state}</div></div>
          <div className="drw-f"><div className="k">Asked</div><div className="v">{when(row.requested_at)}</div></div>
          <div className="drw-f"><div className="k">Acknowledged</div><div className="v">{when(row.ack_at)}</div></div>
          <div className="drw-f"><div className="k">Fulfilled</div><div className="v">{when(row.fulfilled_at)}</div></div>
          <div className="drw-f"><div className="k">Outcome</div><div className="v">{row.outcome ?? 'nothing recorded yet'}</div></div>
        </div>
      </aside>
    </>
  );
}

export function RequestsStrip({ nonce = 0 }: { nonce?: number }) {
  const [rows, setRows] = React.useState<RequestRow[]>([]);
  const [open, setOpen] = React.useState<RequestRow | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void supabase.rpc('hq_my_requests', { p_limit: 10 }).then(({ data, error }) => {
      if (cancelled || error) return;
      const payload = (data ?? {}) as { rows?: RequestRow[] };
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
    });
    return () => { cancelled = true; };
  }, [nonce]);

  if (rows.length === 0) return null;

  return (
    <section className="agg-req" aria-label="What you have already asked for">
      <div className="agg-h">Asked for</div>
      {rows.map((r) => (
        <button key={r.request_id} type="button" className="agg-req-line" onClick={() => setOpen(r)}>
          <span className="t">{r.title ?? r.action}</span>
          <span className={`s ${r.state}`}>{STATE_LABEL[r.state] ?? r.state}</span>
        </button>
      ))}
      {open ? <Detail row={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

export default RequestsStrip;
