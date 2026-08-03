/** BLUEPRINTS OS · client plane, LIVE reads, strictly READ-ONLY.
 * Reproduces the golden master /hq surface (surface_version hq v29-r28):
 * navy .rail, white .filehead + .fh-strip, numbered .sec sections, flat .reg
 * register tables, .g badges. Styles come from hq-golden.css, scoped under .hqg.
 * No DB writes · every mutation路 routes through the COB Connector. */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  isSameDay,
  isSameMonth,
} from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import "@/hq-next/styles/hq-golden.css";
import cobMark from "@/assets/cob-mark.png.asset.json";

/** Shapes mirror the read-only RPC contracts; the page never writes. */
interface BlueprintRow {
  id: string;
  title: string;
  intent: string | null;
  status: string | null;
  owner: string | null;
  loop_cadence: string | null;
  current_state: string | null;
  next_action: string | null;
  milestones: unknown;
  version: number | null;
  updated_at: string | null;
}

interface ScheduledRow {
  id: string;
  blueprint_id: string | null;
  program: string | null;
  title: string | null;
  detail: string | null;
  run_at: string | null;
  cadence: string | null;
  seq: number | null;
  status: string | null;
  outcome: string | null;
  spec_status: string | null;
  gates_total: number | null;
  gates_passed: number | null;
  owner: string | null;
  build_spec?: unknown;
}

type Selection =
  | { kind: "scheduled"; row: ScheduledRow }
  | { kind: "blueprint"; row: BlueprintRow }
  | null;

const READ_ONLY_NOTE =
  "Builds are created, scheduled, and moved through your COB Connector \u00b7 just ask your COB.";

function notifyReadOnly() {
  toast(READ_ONLY_NOTE);
}

function milestonesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((m) => (typeof m === "string" ? m : JSON.stringify(m)));
  return [];
}

/** Board stage derivation · order matters, first match wins. */
function stageOf(row: ScheduledRow): string {
  const status = (row.status ?? "").toLowerCase();
  const spec = (row.spec_status ?? "").toUpperCase();
  if (status === "completed") return "Done";
  if (row.gates_total != null && (row.gates_passed ?? 0) < row.gates_total) return "In Audit";
  if (status === "running") return "In Motion";
  if (spec === "READY" || spec === "PROPOSED") return "Awaiting GO";
  if (status === "scheduled") return "Scheduled";
  if (status === "parked" || spec === "DRAFT") return "Queued";
  return "Queued";
}

const STAGES = ["Queued", "Scheduled", "Awaiting GO", "In Motion", "In Audit", "Done"] as const;

/** Golden `.g` badge modifiers only · no new palette. */
const STAGE_KIND: Record<string, string> = {
  Queued: "dorm",
  Scheduled: "sealed",
  "Awaiting GO": "pend",
  "In Motion": "live",
  "In Audit": "owed",
  Done: "act",
};

/** Project grouping derived from the blueprint title prefix. */
function projectOf(title: string): string {
  const t = title ?? "";
  if (t.includes("\u2605")) return "Command";
  if (t.startsWith("AUTHORITY & CID")) return "Authority & CID";
  if (t.startsWith("BUDDY")) return "BUDDY & Load";
  if (t.startsWith("HQ \u00b7 BLUEPRINTS-OS")) return "Blueprints OS";
  if (/^HQ \u00b7 \d\d /.test(t)) return "HQ Pages";
  if (t.startsWith("HQ \u00b7")) return "HQ Program";
  if (/^P\d/.test(t)) return "Platform Programs";
  if (t.startsWith("ENTITLEMENTS")) return "Entitlements";
  return "Other";
}

function gatesLabel(row: ScheduledRow): string {
  if (row.gates_total == null) return "\u2014";
  return `${row.gates_passed ?? 0}/${row.gates_total}`;
}

function statusKind(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("done") || s.includes("complete") || s === "active") return "act";
  if (s.includes("draft") || s.includes("propos") || s.includes("pending")) return "pend";
  if (s.includes("block") || s.includes("fail")) return "owed";
  if (s.includes("sealed") || s.includes("ready")) return "sealed";
  return "dorm";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Server-derived viewer · same resolution path as the rest of the client plane. */
interface Viewer {
  isOperator: boolean;
  cid: string;
  displayName: string | null;
}

type Resolution =
  | { kind: "loading" }
  | { kind: "ready"; viewer: Viewer }
  | { kind: "unauthorized" };

function useResolvedViewer(): Resolution {
  const [state, setState] = useState<Resolution>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    const resolve = async (): Promise<Resolution> => {
      const cidRes = await supabase.rpc("current_cid");
      const cid = cidRes.error ? null : (cidRes.data as string | null);
      if (!cid) return { kind: "unauthorized" };
      const tenantRes = await supabase
        .from("tenants")
        .select("cid, cob_name")
        .eq("cid", cid)
        .maybeSingle();
      if (tenantRes.error || !tenantRes.data) return { kind: "unauthorized" };
      const opRes = await supabase.rpc("is_fleet_operator");
      return {
        kind: "ready",
        viewer: {
          isOperator: !opRes.error && opRes.data === true,
          cid,
          displayName: tenantRes.data.cob_name ?? null,
        },
      };
    };
    void resolve().then((r) => {
      if (!cancelled) setState(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

const VIEWS = ["Board", "Today", "Month", "Portfolio"] as const;
type View = (typeof VIEWS)[number];

/** Golden rail · logo tile, PLAN group, numbered nav links. */
function Rail({ cid }: { cid: string | null }) {
  return (
    <aside className="rail">
      <div className="rail-brand">
        <div className="mark">
          <div className="mark-tile">
            <img src={cobMark.url} alt="COB" />
          </div>
          <div>
            <div className="mark-name">COB &middot; HQ</div>
            <div className="mark-sub">{cid ?? "resolving\u2026"}</div>
          </div>
        </div>
      </div>
      <nav className="rail-nav">
        <div className="nav-k">Plan</div>
        <a className="nl on" href="/hq/blueprints">
          <span className="nn">01</span>
          <span>Blueprints</span>
        </a>
        <a className="nl" href="/hq">
          <span className="nn">02</span>
          <span>HQ</span>
        </a>
      </nav>
      <div className="rail-foot">
        <span className="dot" />
        read live &middot; read only
      </div>
    </aside>
  );
}

/** Golden document header · white filehead with the four-cell stat strip. */
function FileHead({
  total,
  cells,
}: {
  total: number;
  cells: { label: string; value: number }[];
}) {
  return (
    <div className="filehead">
      <div className="fh-top">
        <div>
          <div className="fh-sub">Blueprints</div>
          <div className="fh-name">Your build plan</div>
        </div>
        <div className="fh-meta">
          read live &middot; tenant projection
          <br />
          {total} records
        </div>
      </div>
      <div className="fh-strip">
        {cells.map((c) => (
          <div className="fh-cell" key={c.label}>
            <b>{c.value}</b>
            <span>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sec({
  n,
  title,
  count,
  badge,
  children,
}: {
  n: number;
  title: string;
  count?: string;
  badge?: { kind: string; text: string };
  children: React.ReactNode;
}) {
  return (
    <div className="sec">
      <div className="sec-h">
        <span className="n">{pad2(n)}</span>
        <h2>{title}</h2>
        {badge && <span className={`g ${badge.kind}`}>{badge.text}</span>}
        {count && <span className="cnt">{count}</span>}
      </div>
      {children}
    </div>
  );
}

export function BlueprintsOS() {
  const resolution = useResolvedViewer();
  const [view, setView] = useState<View>("Board");
  const [monthCursor, setMonthCursor] = useState<Date>(new Date());
  const [selection, setSelection] = useState<Selection>(null);

  const blueprintsQuery = useQuery({
    queryKey: ["hq-blueprints"],
    queryFn: async (): Promise<BlueprintRow[]> => {
      const { data, error } = await supabase.rpc("hq_blueprints_read");
      if (error) throw error;
      return (data ?? []) as unknown as BlueprintRow[];
    },
  });

  const scheduledQuery = useQuery({
    queryKey: ["hq-scheduled"],
    queryFn: async (): Promise<ScheduledRow[]> => {
      const { data, error } = await supabase.rpc("hq_scheduled_read");
      if (error) throw error;
      return (data ?? []) as unknown as ScheduledRow[];
    },
  });

  const blueprints = useMemo(() => blueprintsQuery.data ?? [], [blueprintsQuery.data]);
  const scheduled = useMemo(() => scheduledQuery.data ?? [], [scheduledQuery.data]);

  const byStage = useMemo(() => {
    const map: Record<string, ScheduledRow[]> = Object.fromEntries(
      STAGES.map((s) => [s, [] as ScheduledRow[]])
    );
    for (const row of scheduled) map[stageOf(row)].push(row);
    return map;
  }, [scheduled]);

  const portfolio = useMemo(() => {
    const map = new Map<string, BlueprintRow[]>();
    for (const bp of blueprints) {
      const key = projectOf(bp.title ?? "");
      map.set(key, [...(map.get(key) ?? []), bp]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [blueprints]);

  const today = useMemo(() => {
    const now = new Date();
    const soonLimit = addDays(now, 7);
    return {
      attention: scheduled.filter((r) => {
        const spec = (r.spec_status ?? "").toUpperCase();
        return spec === "DRAFT" || stageOf(r) === "Awaiting GO";
      }),
      soon: scheduled.filter(
        (r) => r.run_at && new Date(r.run_at) >= now && new Date(r.run_at) <= soonLimit
      ),
      done: scheduled.filter((r) => (r.status ?? "").toLowerCase() === "completed").slice(0, 12),
    };
  }, [scheduled]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 });
    const days: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
  }, [monthCursor]);

  const total = blueprints.length + scheduled.length;
  const isLoading = blueprintsQuery.isLoading || scheduledQuery.isLoading;
  const isError = blueprintsQuery.isError || scheduledQuery.isError;
  const isEmpty = !isLoading && !isError && total === 0;

  const linkedBlueprint =
    selection?.kind === "scheduled" && selection.row.blueprint_id
      ? blueprints.find((b) => b.id === selection.row.blueprint_id) ?? null
      : selection?.kind === "blueprint"
        ? selection.row
        : null;

  /** Flat golden register · scheduled builds. */
  const ScheduledTable = ({ rows }: { rows: ScheduledRow[] }) => (
    <table className="reg">
      <thead>
        <tr>
          <th>Title</th>
          <th>Program</th>
          <th>Stage</th>
          <th>Run at</th>
          <th>Gates</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <button
                type="button"
                className="rt"
                style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}
                onClick={() => setSelection({ kind: "scheduled", row: r })}
              >
                {r.title ?? "Untitled"}
              </button>
              {r.detail && <div className="rd">{r.detail}</div>}
            </td>
            <td>
              <span className="g private">{r.program ?? "\u2014"}</span>
            </td>
            <td>
              <span className={`g ${STAGE_KIND[stageOf(r)]}`}>{stageOf(r)}</span>
            </td>
            <td className="rk">
              {r.run_at ? format(new Date(r.run_at), "dd MMM yyyy \u00b7 HH:mm") : "\u2014"}
            </td>
            <td className="rk">{gatesLabel(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  /** Flat golden register · blueprints. */
  const BlueprintTable = ({ rows }: { rows: BlueprintRow[] }) => (
    <table className="reg">
      <thead>
        <tr>
          <th>Title</th>
          <th>Owner</th>
          <th>Status</th>
          <th>Cadence</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <button
                type="button"
                className="rt"
                style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}
                onClick={() => setSelection({ kind: "blueprint", row: r })}
              >
                {r.title}
              </button>
              {r.intent && <div className="rd">{r.intent}</div>}
            </td>
            <td className="rd">{r.owner ?? "\u2014"}</td>
            <td>
              <span className={`g ${statusKind(r.status)}`}>{r.status ?? "unknown"}</span>
            </td>
            <td className="rk">{r.loop_cadence ?? "\u2014"}</td>
            <td className="rk">
              {r.updated_at ? format(new Date(r.updated_at), "dd MMM yyyy") : "\u2014"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const body = (() => {
    if (isLoading)
      return (
        <Sec n={1} title="Plan">
          <div className="bpempty">reading live \u00b7 one moment</div>
        </Sec>
      );
    if (isError)
      return (
        <Sec n={1} title="Plan" badge={{ kind: "owed", text: "degraded" }}>
          <div className="note">
            <b>The read did not complete.</b> Nothing was changed. Reload the page to read again.
          </div>
        </Sec>
      );
    if (isEmpty)
      return (
        <Sec n={1} title="Plan" badge={{ kind: "dorm", text: "empty" }}>
          <div className="note">
            <b>No plans yet.</b> Ask your COB to start one.
          </div>
        </Sec>
      );

    if (view === "Board")
      return (
        <>
          {STAGES.map((stage, i) => (
            <Sec
              key={stage}
              n={i + 1}
              title={stage}
              count={`${byStage[stage].length} records`}
              badge={{ kind: STAGE_KIND[stage], text: stage }}
            >
              {byStage[stage].length === 0 ? (
                <div className="bpempty">none in this stage</div>
              ) : (
                <ScheduledTable rows={byStage[stage]} />
              )}
            </Sec>
          ))}
        </>
      );

    if (view === "Today")
      return (
        <>
          {[
            { label: "Needs attention", rows: today.attention, kind: "pend" },
            { label: "Scheduled soon", rows: today.soon, kind: "sealed" },
            { label: "Recently done", rows: today.done, kind: "act" },
          ].map((col, i) => (
            <Sec
              key={col.label}
              n={i + 1}
              title={col.label}
              count={`${col.rows.length} records`}
              badge={{ kind: col.kind, text: col.label }}
            >
              {col.rows.length === 0 ? (
                <div className="bpempty">nothing here</div>
              ) : (
                <ScheduledTable rows={col.rows} />
              )}
            </Sec>
          ))}
        </>
      );

    if (view === "Month")
      return (
        <Sec
          n={1}
          title={format(monthCursor, "MMMM yyyy")}
          count={`${scheduled.filter((r) => r.run_at && isSameMonth(new Date(r.run_at), monthCursor)).length} scheduled`}
        >
          <div className="bpvs">
            <button type="button" className="bpb" onClick={() => setMonthCursor(addMonths(monthCursor, -1))}>
              &lsaquo; prev
            </button>
            <button type="button" className="bpb" onClick={() => setMonthCursor(new Date())}>
              today
            </button>
            <button type="button" className="bpb" onClick={() => setMonthCursor(addMonths(monthCursor, 1))}>
              next &rsaquo;
            </button>
          </div>
          <div className="bpcal" style={{ marginTop: 10 }}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="bpday" style={{ minHeight: 0 }}>
                <div className="bpdn">{d}</div>
              </div>
            ))}
            {monthDays.map((day) => {
              const events = scheduled.filter((r) => r.run_at && isSameDay(new Date(r.run_at), day));
              const cls = [
                "bpday",
                isSameDay(day, new Date()) ? "bptoday" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div
                  key={day.toISOString()}
                  className={cls}
                  style={isSameMonth(day, monthCursor) ? undefined : { opacity: 0.45 }}
                >
                  <div className="bpdn">{format(day, "d")}</div>
                  {events.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="bpev"
                      style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", font: "inherit" }}
                      onClick={() => setSelection({ kind: "scheduled", row })}
                    >
                      <b>{format(new Date(row.run_at as string), "HH:mm")}</b>
                      {row.title ?? "Untitled"}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </Sec>
      );

    return (
      <>
        {portfolio.map(([project, rows], i) => (
          <Sec key={project} n={i + 1} title={project} count={`${rows.length} records`}>
            <BlueprintTable rows={rows} />
          </Sec>
        ))}
      </>
    );
  })();

  if (resolution.kind !== "ready") {
    return (
      <div className="hqg">
        <Rail cid={null} />
        <div className="main">
          <FileHead total={0} cells={[]} />
          <div className="page on">
            <Sec
              n={1}
              title={resolution.kind === "loading" ? "Identity" : "Access"}
              badge={
                resolution.kind === "loading"
                  ? { kind: "dorm", text: "resolving" }
                  : { kind: "owed", text: "unauthorized" }
              }
            >
              {resolution.kind === "loading" ? (
                <div className="bpempty">resolving viewer from server context</div>
              ) : (
                <div className="note">
                  <b>This plan is not available to you.</b> Your session did not resolve a tenant.
                </div>
              )}
            </Sec>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hqg">
      <Rail cid={resolution.viewer.cid} />
      <div className="main">
        <FileHead
          total={total}
          cells={[
            { label: "Blueprints", value: blueprints.length },
            { label: "Scheduled", value: scheduled.length },
            { label: "Awaiting GO", value: byStage["Awaiting GO"].length },
            { label: "Done", value: byStage["Done"].length },
          ]}
        />
        <div className="page on">
          <div className="bpvs">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                className={`bpb ${view === v ? "bppri" : ""}`}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            ))}
            <button type="button" className="bpb" onClick={notifyReadOnly}>
              Kick it off
            </button>
          </div>

          {body}
        </div>
      </div>

      {selection && (
        <>
          <div className="bpdrw-scrim" onClick={() => setSelection(null)} />
          <aside className="bpdrw" role="dialog" aria-label="Build packet">
            <div className="bpdrw-h">
              <div>
                <h2>{selection.kind === "scheduled" ? selection.row.title ?? "Untitled" : selection.row.title}</h2>
                <div className="rk">Build packet &middot; read only</div>
              </div>
              <button type="button" className="bpb" onClick={() => setSelection(null)}>
                close
              </button>
            </div>
            <div className="bpdrw-b">
              {selection.kind === "scheduled" && (
                <>
                  <div className="bpdrw-f">
                    <div className="k">Program</div>
                    <div className="v">{selection.row.program ?? "\u2014"}</div>
                  </div>
                  <div className="bpdrw-f">
                    <div className="k">Stage</div>
                    <div className="v">
                      <span className={`g ${STAGE_KIND[stageOf(selection.row)]}`}>{stageOf(selection.row)}</span>
                    </div>
                  </div>
                  <div className="bpdrw-f">
                    <div className="k">Gates</div>
                    <div className="v">{gatesLabel(selection.row)}</div>
                  </div>
                  <div className="bpdrw-f">
                    <div className="k">Spec status</div>
                    <div className="v">{selection.row.spec_status ?? "\u2014"}</div>
                  </div>
                  <div className="bpdrw-f">
                    <div className="k">Run at</div>
                    <div className="v">
                      {selection.row.run_at
                        ? format(new Date(selection.row.run_at), "dd MMM yyyy \u00b7 HH:mm")
                        : "\u2014"}
                    </div>
                  </div>
                  <div className="bpdrw-f">
                    <div className="k">Cadence</div>
                    <div className="v">{selection.row.cadence ?? "\u2014"}</div>
                  </div>
                  {selection.row.detail && (
                    <div className="bpdrw-f">
                      <div className="k">Detail</div>
                      <div className="v">{selection.row.detail}</div>
                    </div>
                  )}
                  {selection.row.build_spec != null && (
                    <div className="bpdrw-f">
                      <div className="k">Build spec</div>
                      <pre className="bpdrw-pre">
                        {typeof selection.row.build_spec === "string"
                          ? selection.row.build_spec
                          : JSON.stringify(selection.row.build_spec, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}

              {linkedBlueprint && (
                <div className="sec">
                  <div className="sec-h">
                    <span className="n">{pad2(1)}</span>
                    <h2>Blueprint</h2>
                  </div>
                  <div className="bpdrw-f">
                    <div className="k">Title</div>
                    <div className="v">{linkedBlueprint.title}</div>
                  </div>
                  <div className="bpdrw-f">
                    <div className="k">Status</div>
                    <div className="v">
                      <span className={`g ${statusKind(linkedBlueprint.status)}`}>
                        {linkedBlueprint.status ?? "unknown"}
                      </span>
                    </div>
                  </div>
                  <div className="bpdrw-f">
                    <div className="k">Owner</div>
                    <div className="v">{linkedBlueprint.owner ?? "\u2014"}</div>
                  </div>
                  {linkedBlueprint.intent && (
                    <div className="bpdrw-f">
                      <div className="k">Intent</div>
                      <div className="v">{linkedBlueprint.intent}</div>
                    </div>
                  )}
                  {linkedBlueprint.current_state && (
                    <div className="bpdrw-f">
                      <div className="k">Current state</div>
                      <div className="v">{linkedBlueprint.current_state}</div>
                    </div>
                  )}
                  {linkedBlueprint.next_action && (
                    <div className="bpdrw-f">
                      <div className="k">Next action</div>
                      <div className="v">{linkedBlueprint.next_action}</div>
                    </div>
                  )}
                  {milestonesOf(linkedBlueprint.milestones).length > 0 && (
                    <div className="bpdrw-f">
                      <div className="k">Milestones</div>
                      <ul className="bpdrw-ul">
                        {milestonesOf(linkedBlueprint.milestones).map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <button type="button" className="bpb bppri" onClick={notifyReadOnly}>
                  Kick it off
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

export default BlueprintsOS;
