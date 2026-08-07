/** HQ-NEXT · AGGREGATION PANEL
 * The first thing the client sees in HQ. Shows how much of their world the COB
 * has read, what the last run found, and invites the next run.
 *
 * BINDING:
 *  1. There is no overdue, late, behind or warning treatment anywhere here.
 *  2. Every number rendered comes from the payload. Nothing is derived.
 *  3. A null field renders an honest empty treatment, never a zero.
 *  4. Duration is the promise: minutes are preferred over item counts. */
import React from 'react';
import '../styles/aggregation.css';
import { useAggregation } from '../useAggregation';
import { CONFIDENCE_LABEL, type AggregationPayload, type AggregationSource, type UnattendedSurface } from '../contracts/aggregation';

const EMPTY = 'not counted yet';

function Stat({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="agg-stat">
      <div className="k">{k}</div>
      <div className={v === null ? 'v empty' : 'v'}>{v ?? EMPTY}</div>
    </div>
  );
}

function num(n: number | null | undefined): string | null {
  return typeof n === 'number' ? n.toLocaleString() : null;
}
function minutes(n: number | null | undefined): string | null {
  return typeof n === 'number' ? `${n.toLocaleString()} min` : null;
}
function hours(n: number | null | undefined): string | null {
  return typeof n === 'number' ? `${n.toLocaleString()} h` : null;
}
/** Formats a payload supplied horizon as a month and a year. No arithmetic. */
function monthYear(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function SourceSize(s: AggregationSource): string {
  if (typeof s.items_done === 'number' && typeof s.estimated_items === 'number') {
    return `${s.items_done.toLocaleString()} of ${s.estimated_items.toLocaleString()} read`;
  }
  if (typeof s.estimated_items === 'number') return `${s.estimated_items.toLocaleString()} items`;
  if (s.connect_state === 'connected') return 'not sized yet';
  return 'not connected';
}

function SurfaceCard({ s }: { s: UnattendedSurface }) {
  return (
    <div className="agg-surf">
      <b>{s.label ?? s.surface}</b>
      {s.why ? <span>{s.why}</span> : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="agg" aria-busy="true" aria-label="Loading your reading progress">
      <div className="agg-top">
        <div className="agg-barcol">
          <div className="agg-sk" style={{ width: 180, height: 34 }} />
          <div className="agg-track" style={{ borderColor: 'var(--edge)' }}>
            <div className="agg-seg agg-sk" style={{ flex: '1 1 0' }} />
          </div>
          <div className="agg-sk" style={{ height: 13, marginTop: 12, maxWidth: 520 }} />
          <div className="agg-sk" style={{ height: 13, marginTop: 6, maxWidth: 360 }} />
        </div>
        <div className="agg-statcol">
          {[0, 1, 2, 3].map((i) => <div key={i} className="agg-sk" style={{ height: 52 }} />)}
        </div>
      </div>
      <div className="agg-cards">
        {[0, 1, 2].map((i) => <div key={i} className="agg-sk" style={{ height: 132 }} />)}
      </div>
    </div>
  );
}

function Drawer({ source, onClose }: { source: AggregationSource; onClose: () => void }) {
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
      <aside className="drw" role="dialog" aria-modal="true" aria-label={`${source.label} detail`}>
        <div className="drw-h">
          <div style={{ minWidth: 0 }}>
            <h2>{source.label}</h2>
            <div className="rk">{source.kind}</div>
          </div>
          <button ref={closeRef} className="seg" onClick={onClose}>Close</button>
        </div>
        <div className="drw-b">
          <div className="drw-f"><div className="k">Connection</div><div className="v">{source.connect_state}</div></div>
          <div className="drw-f"><div className="k">Discovery</div><div className="v">{source.discovery_state}</div></div>
          <div className="drw-f"><div className="k">Size</div><div className="v">{SourceSize(source)}</div></div>
          <div className="drw-f"><div className="k">Why your COB knows this exists</div><div className="v">{source.basis ?? 'no basis recorded'}</div></div>
        </div>
      </aside>
    </>
  );
}

export function AggregationPanel() {
  const { read, reload } = useAggregation();
  const [open, setOpen] = React.useState<AggregationSource | null>(null);

  if (read.status === 'loading') return <Skeleton />;

  if (read.status === 'error') {
    return (
      <div className="agg">
        <h4 style={{ fontFamily: 'var(--serif)', fontSize: 15, color: 'var(--ink)', margin: 0 }}>The read did not come back.</h4>
        <p className="agg-line">Your reading progress could not be loaded just now. Nothing has changed on your side.</p>
        <button className="agg-ghost" onClick={reload}>Read again</button>
      </div>
    );
  }

  const p: AggregationPayload = read.data;
  const seg = p.segments;
  const nr = p.next_run;
  const sc = p.schedule;
  const notCounted = p.confidence !== 'counted';
  const ariaLabel = `Share of your world read${notCounted ? ', the total is an estimate' : ''}`;

  const connected = p.sources.filter((s) => s.connect_state === 'connected');
  const available = p.sources.filter((s) => s.connect_state !== 'connected');

  const bar = (
    <div
      className="agg-track"
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(typeof p.percent === 'number' ? { 'aria-valuenow': p.percent } : {})}
    >
      <div className="agg-seg read" style={{ flex: `${Math.max(seg.read ?? 0, 0)} 0 0` }} />
      <div className="agg-seg rem" style={{ flex: `${Math.max(seg.known_remaining ?? 0, 0)} 0 0` }} />
      {seg.tail_is_indeterminate ? <div className="agg-seg tail" aria-hidden="true" /> : null}
    </div>
  );

  return (
    <section className="agg" aria-label="Aggregation">
      <div className="agg-top">
        <div className="agg-barcol">
          <div className="agg-pct">
            {typeof p.percent === 'number'
              ? <b>{p.percent}%</b>
              : <span className="none">{EMPTY}</span>}
            <span className="cf">{CONFIDENCE_LABEL[p.confidence]}</span>
          </div>
          {bar}
          <p className="agg-line">{p.line}</p>
          {p.ordering_note ? <div className="agg-note">{p.ordering_note}</div> : null}
        </div>
        <div className="agg-statcol">
          <Stat k="Runs done" v={num(p.runs_done)} />
          <Stat k="Runs remaining" v={num(p.runs_remaining)} />
          <Stat k="Time remaining" v={hours(p.hours_remaining)} />
          <Stat k="Full read by" v={monthYear(p.full_read_horizon)} />
        </div>
      </div>

      {p.sources.length > 0 ? (
        <>
          <div className="agg-h">Sources</div>
          {[...connected, ...available].map((s, i) => (
            <div className="agg-src" key={`${s.label}-${i}`} title={s.basis ?? undefined}>
              <button
                className="sl"
                style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
                onClick={() => setOpen(s)}
              >
                <b>{s.label}</b>
                <span>{s.kind}</span>
              </button>
              <span className="ss">{SourceSize(s)}</span>
              {s.connect_state !== 'connected' ? (
                <button className="agg-connect" onClick={() => setOpen(s)}>Connect</button>
              ) : null}
            </div>
          ))}
        </>
      ) : null}

      <div className="agg-cards">
        {nr.last_run ? (
          <div className="agg-card">
            <div className="k" style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ash)' }}>Last run</div>
            <h4 style={{ marginTop: 6 }}>{nr.last_run.headline ?? 'The last run completed.'}</h4>
            <div className="agg-facts">
              <div><div className="k">Minutes</div><div className="v">{minutes(nr.last_run.minutes) ?? EMPTY}</div></div>
              <div><div className="k">Claims added</div><div className="v">{num(nr.last_run.claims_added) ?? EMPTY}</div></div>
              <div><div className="k">Entities added</div><div className="v">{num(nr.last_run.entities_added) ?? EMPTY}</div></div>
              <div><div className="k">Dated items added</div><div className="v">{num(nr.last_run.dated_items_added) ?? EMPTY}</div></div>
            </div>
          </div>
        ) : null}

        <div className="agg-card">
          <div className="k" style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ash)' }}>Next run</div>
          <h4 style={{ marginTop: 6 }}>{nr.headline}</h4>
          <p>{nr.body}</p>
          {nr.promise ? <p>{nr.promise}</p> : null}
          {nr.why_it_matters ? <p className="q">{nr.why_it_matters}</p> : null}
          {nr.horizon_line ? <p className="q">{nr.horizon_line}</p> : null}
          {nr.action && p.state !== 'complete' && nr.posture !== 'complete' ? (
            <button className="agg-cta" data-action={nr.action}>{nr.action_label ?? nr.action}</button>
          ) : null}
        </div>

        <div className="agg-card">
          <div className="k" style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ash)' }}>Schedule</div>
          <h4 style={{ marginTop: 6 }}>{sc.headline}</h4>
          <p>{sc.body}</p>
          {sc.enabled ? (
            <div className="agg-facts">
              <div><div className="k">Surface</div><div className="v">{sc.surface_label ?? sc.surface ?? EMPTY}</div></div>
              <div><div className="k">Window</div><div className="v">{sc.window ?? EMPTY}</div></div>
              <div><div className="k">Minutes</div><div className="v">{minutes(sc.minutes) ?? EMPTY}</div></div>
            </div>
          ) : (
            <>
              <button className="agg-cta">Turn the schedule on</button>
              {sc.unattended_surfaces.map((s) => <SurfaceCard key={s.surface} s={s} />)}
              {sc.not_for_unattended.length > 0 ? (
                <div className="agg-quiet">
                  <div className="qh">Cannot carry an unattended run</div>
                  <ul>
                    {sc.not_for_unattended.map((s) => (
                      <li key={s.surface}>{s.label ?? s.surface}{s.why ? `: ${s.why}` : ''}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
          {sc.surface_note ? <p className="q">{sc.surface_note}</p> : null}
        </div>
      </div>

      {open ? <Drawer source={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

export default AggregationPanel;
