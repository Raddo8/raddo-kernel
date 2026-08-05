/** THE LANE DOSSIER CABINET · /hq/world
 *
 * One folder per lane, derived server-side from the client's own registers
 * (memory lanes ∪ lane-narrative storyline rows). No lane name is hardcoded,
 * no approval affordance exists: a lane exists the moment its data does.
 *
 * This surface never writes. Changes are made by telling your COB.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { HqShell } from "@/components/hq/HqShell";
import { callWorld, type LaneRow } from "@/lib/world-lanes";
import "@/hq-next/styles/hq-lanes.css";

const DOT = "\u00b7";

function freshness(iso: string | null): string {
  if (!iso) return "no dated material yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "no dated material yet";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "updated today";
  return `updated ${d.getMonth() + 1}/${d.getDate()}`;
}

function Folder({ row, n }: { row: LaneRow; n: number }) {
  return (
    <Link className="folder" to={`/hq/world/lane/${row.slug}`}>
      <span className="tab">
        <span className="no">{String(n).padStart(2, "0")}</span>
        {row.label}
      </span>
      <div className="fbody">
        <div className="flabel">{row.label}</div>
        <div className="fprev">
          {row.preview ?? "Narrative pending. The material in this lane has not been written up yet."}
        </div>
        <div className="fstats">
          <span>
            <b>{row.entry_count}</b> {row.entry_count === 1 ? "entry" : "entries"}
          </span>
          {row.open_thread_count !== null && (
            <span>
              <b>{row.open_thread_count}</b> open {row.open_thread_count === 1 ? "thread" : "threads"}
            </span>
          )}
          <span className="fresh">{freshness(row.updated_at)}</span>
        </div>
      </div>
    </Link>
  );
}

function Listening() {
  return (
    <div className="folder listening">
      <span className="tab">
        <span className="no">{DOT}</span>Next lane
      </span>
      <div className="fbody">
        <div className="flabel">Born automatically</div>
        <div className="fprev">
          When your world grows a new lane, its folder appears here on its own. No approval step, ever.
        </div>
        <div className="fstats">
          <span className="fresh">listening</span>
        </div>
      </div>
    </div>
  );
}

export function WorldCabinet() {
  const [rows, setRows] = useState<LaneRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    callWorld<{ rows: LaneRow[] }>("lanes")
      .then((d) => live && setRows(d.rows ?? []))
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, []);

  // The first six folders sit in front; everything beyond peeks from behind,
  // three to a row, so the cabinet grows without limit.
  const front = (rows ?? []).slice(0, 6);
  const behind = (rows ?? []).slice(6);
  const backRows: LaneRow[][] = [];
  for (let i = 0; i < behind.length; i += 3) backRows.push(behind.slice(i, i + 3));

  return (
    <HqShell>
      <div className="wld">
        <div className="crumb">HQ {DOT} 02 {DOT} the world</div>
        <h1>The World</h1>
        <p className="psub">
          Everything your COB holds about your world, one folder per lane. Folders appear on their own the moment a
          new lane takes shape in your world; nothing waits on an approval. Open a folder for the full dossier.
          Anything inside can be changed by telling your COB.
        </p>

        <div className="seck">
          <h2>The cabinet</h2>
          <span className="src">
            one folder per lane {DOT} derived from your registers {DOT} rows grow as lanes grow
          </span>
        </div>
        <div style={{ height: 56 }} />

        {err && <div className="plain">The cabinet could not be read: {err}</div>}
        {!err && rows === null && <div className="plain">Reading your lanes.</div>}
        {!err && rows !== null && rows.length === 0 && (
          <div className="plain">
            No lanes have taken shape yet. The first one appears here the moment your COB records material against
            it.
          </div>
        )}

        {rows !== null && rows.length > 0 && (
          <>
            {backRows
              .slice()
              .reverse()
              .map((chunk, i) => (
                <div className="cab-row back" key={`back-${i}`}>
                  {chunk.map((row) => (
                    <Folder key={row.slug} row={row} n={rows.indexOf(row) + 1} />
                  ))}
                </div>
              ))}
            <div className="cab-row front">
              {front.map((row, i) => (
                <Folder key={row.slug} row={row} n={i + 1} />
              ))}
              <Listening />
            </div>
          </>
        )}

        <p className="foot">
          Read-only surface {DOT} every count and date comes from your own registers {DOT} your COB is the only pen
        </p>
      </div>
    </HqShell>
  );
}

export default WorldCabinet;
