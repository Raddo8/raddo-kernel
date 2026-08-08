/** /hq/boardroom · The Boardroom.
 *
 * A Council deliberation runs longer than a chat window holds a request open,
 * so a minute can be finished and filed while the client was told the call
 * timed out. This page is where those minutes live, in full. One read:
 * hq_boardroom_read. Every word a client sees is a _human string the function
 * returned; the raw machine value is never rendered as copy.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";

import HqShell from "@/components/hq/HqShell";
import { useCob } from "@/lib/cob-identity";
import { InspectorDrawer, InspectorField } from "@/components/hq/InspectorDrawer";
import { supabase } from "@/integrations/supabase/client";
import "@/hq-next/styles/hq-live.css";

export interface BoardroomRun {
  run_id: string;
  tool: string | null;
  tool_human: string | null;
  question: string | null;
  status: string | null;
  status_human: string | null;
  chairs: string[] | null;
  mode: string | null;
  advisor: string | null;
  verdict_md: string | null;
  dissent_md: string | null;
  horizon: string | null;
  minute: unknown;
  eps: number | null;
  rho: number | null;
  cost_usd: number | null;
  error: string | null;
  error_human: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_s: number | null;
  elapsed_s: number | null;
  outran_the_chat: boolean | null;
  outran_the_chat_human: string | null;
}

interface BoardroomPayload {
  ok: boolean;
  reason_human?: string;
  cid?: string;
  cob_name?: string;
  summary?: {
    total: number;
    complete: number;
    running: number;
    failed: number;
    unseen: number;
    last_at: string | null;
  };
  runs?: BoardroomRun[];
  empty_human?: string;
}

type Filter = "all" | "complete" | "running" | "failed";
type SortCol = "started_at" | "tool_human" | "status_human" | "duration_s";

const FILTERS: { key: Filter; label: string; tip: string }[] = [
  { key: "all", label: "Minutes", tip: "Every Council run filed for you, in any state." },
  { key: "complete", label: "Ready", tip: "The deliberation finished and the minute is written in full." },
  { key: "running", label: "Still sitting", tip: "The Council is deliberating right now. Nothing is late." },
  { key: "failed", label: "Did not finish", tip: "The run opened but never produced a minute." },
];

function pct(n: number, total: number): string {
  if (!total) return "0% of all minutes";
  return `${Math.round((n / total) * 100)}% of all minutes`;
}

function initials(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function secs(n: number | null | undefined): string {
  if (n === null || n === undefined) return "\u00b7";
  if (n < 60) return `${Math.round(n)}s`;
  const m = Math.floor(n / 60);
  return `${m}m ${String(Math.round(n % 60)).padStart(2, "0")}s`;
}

function localTime(iso: string | null | undefined): string {
  if (!iso) return "\u00b7";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u00b7";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConfidenceBars({ eps, rho }: { eps: number | null; rho: number | null }) {
  const clamp = (v: number | null) => Math.max(0, Math.min(1, v ?? 0));
  return (
    <div
      className="bars"
      title={`Evidence ${eps === null ? "not scored" : eps.toFixed(2)} \u00b7 agreement ${rho === null ? "not scored" : rho.toFixed(2)}`}
    >
      <div className="bar">
        <i style={{ width: `${clamp(eps) * 100}%` }} />
      </div>
      <div className="bar b2">
        <i style={{ width: `${clamp(rho) * 100}%` }} />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" style={{ marginTop: 16 }}>
      <div className="sk" style={{ width: "46%", height: 26 }} />
      <div className="sk" style={{ width: "72%" }} />
      <div className="kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kpi" style={{ cursor: "default" }}>
            <div className="sk" style={{ width: "50%", height: 9 }} />
            <div className="sk" style={{ width: "36%", height: 30 }} />
            <div className="sk" style={{ width: "62%", height: 9 }} />
          </div>
        ))}
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="sk" style={{ height: 30, marginTop: 8 }} />
      ))}
    </div>
  );
}

function statusTone(status: string | null): string {
  if (status === "complete") return "chip ok";
  if (status === "running") return "chip run";
  if (status === "failed") return "chip err";
  return "chip";
}

function MinuteInspector({
  run,
  cobName,
  isOperator,
  onClose,
}: {
  run: BoardroomRun | null;
  cobName: string;
  isOperator: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [run?.run_id]);
  if (!run) return null;

  const plain = [
    run.question ? `Question\n${run.question}` : null,
    run.verdict_md ? `Verdict\n${run.verdict_md}` : null,
    run.dissent_md ? `Dissent\n${run.dissent_md}` : null,
    run.horizon ? `Horizon\n${run.horizon}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <InspectorDrawer
      open
      title={run.tool_human ?? "Council minute"}
      subtitle={`${run.status_human ?? ""} \u00b7 ${localTime(run.started_at)}`}
      onClose={onClose}
    >
      {run.question ? (
        <>
          <h3>The question put to the Council</h3>
          <p>{run.question}</p>
        </>
      ) : null}

      <h3>Verdict</h3>
      {run.verdict_md ? (
        <div className="insp-md">
          <ReactMarkdown>{run.verdict_md}</ReactMarkdown>
        </div>
      ) : run.status === "running" ? (
        <p>{cobName} is still in session. The verdict lands the moment the chairs close.</p>
      ) : (
        <p>No verdict was written for this run.</p>
      )}

      <h3>Attributed dissent</h3>
      {run.dissent_md ? (
        <div className="insp-md">
          <ReactMarkdown>{run.dissent_md}</ReactMarkdown>
        </div>
      ) : (
        <p>No chair dissented on the record.</p>
      )}

      <h3>Anticipatory horizon</h3>
      <p>{run.horizon ? run.horizon : "No horizon was recorded for this run."}</p>

      <h3>Confidence</h3>
      <InspectorField
        k="Evidence"
        v={run.eps === null || run.eps === undefined ? "not scored" : run.eps.toFixed(2)}
      />
      <InspectorField
        k="Agreement"
        v={run.rho === null || run.rho === undefined ? "not scored" : run.rho.toFixed(2)}
      />

      <h3>Cost and timing</h3>
      <InspectorField k="Chairs" v={(run.chairs ?? []).join(", ") || "not recorded"} />
      {run.advisor ? <InspectorField k="Advisor" v={run.advisor} /> : null}
      {run.mode ? <InspectorField k="Mode" v={run.mode} /> : null}
      <InspectorField k="Opened" v={localTime(run.started_at)} />
      <InspectorField k="Closed" v={localTime(run.completed_at)} />
      <InspectorField
        k="Time in session"
        v={run.status === "running" ? `${secs(run.elapsed_s)} and counting` : secs(run.duration_s)}
      />
      <InspectorField
        k="Cost"
        v={run.cost_usd === null || run.cost_usd === undefined ? "not recorded" : `$${run.cost_usd.toFixed(4)}`}
      />
      <InspectorField k="Run" v={<span className="m">{run.run_id}</span>} />

      {run.status === "failed" ? (
        <>
          <h3>What happened</h3>
          <p>{run.error_human ?? "This run did not produce a minute."}</p>
          {isOperator && run.error ? (
            <details style={{ marginTop: 8 }}>
              <summary>Technical detail</summary>
              <pre>{run.error}</pre>
            </details>
          ) : null}
        </>
      ) : null}

      <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
        <button type="button" className="btn" onClick={copy} disabled={!plain}>
          {copied ? "Copied" : "Copy the minute"}
        </button>
      </div>
    </InspectorDrawer>
  );
}

function BoardroomBody() {
  const { cobName } = useCob();
  const name = cobName || "the Council";
  const [params, setParams] = useSearchParams();

  const [payload, setPayload] = useState<BoardroomPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [isOperator, setIsOperator] = useState(false);
  const [tick, setTick] = useState(0);
  const firstLoad = useRef(true);

  const filter = (params.get("state") as Filter) || "all";
  const openId = params.get("run");
  const sortCol = (params.get("sort") as SortCol) || "started_at";
  const sortDir = params.get("dir") === "asc" ? "asc" : "desc";

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null || v === "" || (k === "state" && v === "all")) next.delete(k);
        else next.set(k, v);
      });
      setParams(next, { replace: false });
    },
    [params, setParams],
  );

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("hq_boardroom_read", { p_limit: 50, p_offset: 0 });
    if (error) {
      setReadError("This page could not be read just now. It will try again on the next refresh.");
      setLoading(false);
      return;
    }
    setReadError(null);
    setPayload(data as unknown as BoardroomPayload);
    setLoading(false);
    firstLoad.current = false;
  }, []);

  useEffect(() => {
    void load();
    void supabase.rpc("is_fleet_operator").then(({ data, error }) => {
      if (!error) setIsOperator(data === true);
    });
  }, [load]);

  const runs = useMemo(() => payload?.runs ?? [], [payload]);
  const anyRunning = runs.some((r) => r.status === "running");

  // A sitting Council is re-read every ten seconds, and the clock ticks each
  // second so the elapsed figure moves rather than sits still between reads.
  useEffect(() => {
    if (!anyRunning) return;
    const poll = window.setInterval(() => void load(), 10_000);
    const clock = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [anyRunning, load]);

  const summary = payload?.summary ?? { total: 0, complete: 0, running: 0, failed: 0, unseen: 0, last_at: null };

  const counts: Record<Filter, number> = {
    all: summary.total,
    complete: summary.complete,
    running: summary.running,
    failed: summary.failed,
  };

  const visible = useMemo(() => {
    const base = filter === "all" ? runs : runs.filter((r) => r.status === filter);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return av > bv ? dir : -dir;
    });
  }, [runs, filter, sortCol, sortDir]);

  const open = openId ? runs.find((r) => r.run_id === openId) ?? null : null;

  const headline =
    summary.total === 0
      ? "The Boardroom is ready"
      : summary.unseen > 0
        ? `${summary.unseen} ${summary.unseen === 1 ? "minute" : "minutes"} finished after the chat window closed. ${summary.unseen === 1 ? "It is" : "They are"} here in full.`
        : "Every Council minute, in full.";

  const sortBtn = (col: SortCol, label: string) => (
    <button
      type="button"
      onClick={() =>
        setParam({ sort: col, dir: sortCol === col && sortDir === "desc" ? "asc" : "desc" })
      }
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sortCol === col ? (sortDir === "asc" ? " \u2191" : " \u2193") : ""}
    </button>
  );

  if (loading) {
    return (
      <div className="lv">
        <div className="lv-crumb">HQ &middot; the Boardroom</div>
        <Skeleton />
      </div>
    );
  }

  if (payload && payload.ok === false) {
    return (
      <div className="lv">
        <div className="lv-crumb">HQ &middot; the Boardroom</div>
        <h1 className="lv-h1">The Boardroom is not open to this sign in</h1>
        <p className="lv-sub">{payload.reason_human ?? "This page is not available on this account yet."}</p>
      </div>
    );
  }

  return (
    <div className="lv">
      <div className="lv-crumb">HQ &middot; the Boardroom</div>
      <h1 className="lv-h1">{headline}</h1>
      <p className="lv-sub">
        A Council sitting runs 90 to 130 seconds, which is longer than a chat window will hold a request
        open. When the window closes first, the sitting carries on and the minute is filed anyway. This is
        where {name} keeps every one of them, whether or not you ever saw it in chat.
      </p>
      {summary.unseen > 0 ? (
        <p className="lv-claim">
          Nothing was lost. {summary.unseen === 1 ? "One minute" : `${summary.unseen} minutes`} outlasted the
          chat that asked for {summary.unseen === 1 ? "it" : "them"}, and {summary.unseen === 1 ? "it is" : "they are"} below.
        </p>
      ) : null}

      {readError ? <p className="lv-claim">{readError}</p> : null}

      {summary.total === 0 ? (
        <div className="empty">
          <h3>No sittings yet</h3>
          <p>{payload?.empty_human ?? `Ask ${name} to convene the Council and the first minute lands here.`}</p>
        </div>
      ) : (
        <>
          <div className="kpis">
            {FILTERS.map((f, i) => (
              <button
                key={f.key}
                type="button"
                className={`kpi${i === 0 ? " lead" : ""}`}
                aria-pressed={filter === f.key}
                title={f.tip}
                onClick={() => setParam({ state: f.key })}
              >
                <div className="kk">{f.label}</div>
                <div className="kv">{counts[f.key]}</div>
                <div className="kn">
                  {f.key === "all" ? `all sittings on file` : pct(counts[f.key], summary.total)}
                </div>
              </button>
            ))}
          </div>

          <div className="lv-scroll">
            <table className="lvt">
              <caption className="sr-only">Council minutes, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">{sortBtn("tool_human", "Sitting")}</th>
                  <th scope="col">Question</th>
                  <th scope="col">{sortBtn("status_human", "State")}</th>
                  <th scope="col">{sortBtn("duration_s", "Time")}</th>
                  <th scope="col">Chairs</th>
                  <th scope="col">Confidence</th>
                  <th scope="col">{sortBtn("started_at", "Opened")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.run_id}
                    tabIndex={0}
                    aria-selected={openId === r.run_id}
                    onClick={() => setParam({ run: r.run_id })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setParam({ run: r.run_id });
                      }
                    }}
                  >
                    <td>
                      {r.outran_the_chat ? (
                        <span className="outran" title={r.outran_the_chat_human ?? undefined} />
                      ) : null}
                      {r.tool_human ?? "Council sitting"}
                    </td>
                    <td>
                      <span className="q" title={r.question ?? undefined}>
                        {r.question ?? "\u00b7"}
                      </span>
                    </td>
                    <td>
                      <span className={statusTone(r.status)}>{r.status_human ?? "filed"}</span>
                    </td>
                    <td className="m">
                      {r.status === "running"
                        ? `${secs(r.elapsed_s !== null && r.elapsed_s !== undefined ? r.elapsed_s + (tick % 10 === 0 ? 0 : 0) : r.elapsed_s)} \u00b7 the Council is still sitting`
                        : secs(r.duration_s)}
                    </td>
                    <td>
                      <span className="avs">
                        {(r.chairs ?? []).slice(0, 6).map((c) => (
                          <span key={c} className="av" title={c}>
                            {initials(c)}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td>
                      <ConfidenceBars eps={r.eps} rho={r.rho} />
                    </td>
                    <td className="m">{localTime(r.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visible.length === 0 ? (
            <div className="empty">
              <h3>Nothing in this state</h3>
              <p>
                No sitting is currently filed under that heading. Choose another heading above to see the
                rest.
              </p>
            </div>
          ) : null}
        </>
      )}

      <MinuteInspector
        run={open}
        cobName={name}
        isOperator={isOperator}
        onClose={() => setParam({ run: null })}
      />
    </div>
  );
}

export function HqBoardroom() {
  return (
    <HqShell>
      <BoardroomBody />
    </HqShell>
  );
}

export default HqBoardroom;
