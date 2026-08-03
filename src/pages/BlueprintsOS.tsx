/** BLUEPRINTS OS · client plane, LIVE reads, strictly READ-ONLY.
 * Adopts the hq-next design system: same shell, rail, Section / RegisterTable /
 * FactTile / Badge vocabulary and tokens. No shadcn chrome. No DB writes. */
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
import "@/hq-next/styles/hq-next.css";
import {
  Section,
  StateBlock,
  Badge,
  FactTile,
  FactRow,
  RegisterTable,
  type Column,
} from "@/hq-next/components/primitives";
import type { Viewer } from "@/hq-next/useHqRead";

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
  "Builds are created, scheduled, and moved through your COB Connector · just ask your COB.";

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

const STAGE_KIND: Record<string, string> = {
  Queued: "dorm",
  Scheduled: "sealed",
  "Awaiting GO": "pend",
  "In Motion": "act",
  "In Audit": "hi",
  Done: "act",
};

/** Project grouping derived from the blueprint title prefix. */
function projectOf(title: string): string {
  const t = title ?? "";
  if (t.includes("★")) return "Command";
  if (t.startsWith("AUTHORITY & CID")) return "Authority & CID";
  if (t.startsWith("BUDDY")) return "BUDDY & Load";
  if (t.startsWith("HQ · BLUEPRINTS-OS")) return "Blueprints OS";
  if (/^HQ · \d\d /.test(t)) return "HQ Pages";
  if (t.startsWith("HQ ·")) return "HQ Program";
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
  if (s.includes("block") || s.includes("fail")) return "hi";
  if (s.includes("sealed") || s.includes("ready")) return "sealed";
  return "dorm";
}

/** Server-derived viewer · identical resolution path to src/hq-next/routes.tsx. */
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

function Shell({ cid, children }: { cid: string | null; children: React.ReactNode }) {
  return (
    <div className="hqx">
      <div className="hqx-app">
        <nav className="hqx-rail">
          <div className="hqx-brand">
            <b>COB · HQ</b>
            <span>{cid ?? "resolving\u2026"}</span>
          </div>
          <div>
            <div className="hqx-grp">Plan</div>
            <a className="nl on" href="/hq/blueprints"><span>Blueprints</span></a>
            <a className="nl" href="/hq-next"><span>HQ</span></a>
          </div>
        </nav>
        <main className="hqx-main">{children}</main>
      </div>
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
    enabled: true,
    queryFn: async (): Promise<BlueprintRow[]> => {
      const { data, error } = await supabase.rpc("hq_blueprints_read");
      if (error) throw error;
      return (data ?? []) as unknown as BlueprintRow[];
    },
  });

  const scheduledQuery = useQuery({
    queryKey: ["hq-scheduled"],
    enabled: true,
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

  const scheduledCols: Column<ScheduledRow>[] = useMemo(
    () => [
      {
        key: "title",
        label: "Title",
        render: (r) => (
          <button type="button" className="lnk" onClick={() => setSelection({ kind: "scheduled", row: r })}>
            <span className="rt">{r.title ?? "Untitled"}</span>
          </button>
        ),
      },
      { key: "program", label: "Program", render: (r) => <Badge kind="private">{r.program ?? "\u2014"}</Badge> },
      {
        key: "run",
        label: "Run at",
        render: (r) => (
          <span className="rk">{r.run_at ? format(new Date(r.run_at), "dd MMM yyyy · HH:mm") : "\u2014"}</span>
        ),
      },
      { key: "gates", label: "Gates", render: (r) => <span className="rk">{gatesLabel(r)}</span>, align: "right" },
    ],
    []
  );

  const blueprintCols: Column<BlueprintRow>[] = useMemo(
    () => [
      {
        key: "title",
        label: "Title",
        render: (r) => (
          <button type="button" className="lnk" onClick={() => setSelection({ kind: "blueprint", row: r })}>
            <span className="rt">{r.title}</span>
          </button>
        ),
      },
      { key: "owner", label: "Owner", render: (r) => <span className="rd">{r.owner ?? "\u2014"}</span> },
      {
        key: "status",
        label: "Status",
        render: (r) => <Badge kind={statusKind(r.status)}>{r.status ?? "unknown"}</Badge>,
      },
    ],
    []
  );

  const isLoading = blueprintsQuery.isLoading || scheduledQuery.isLoading;
  const isError = blueprintsQuery.isError || scheduledQuery.isError;
  const isEmpty = !isLoading && !isError && blueprints.length === 0 && scheduled.length === 0;
  const total = blueprints.length + scheduled.length;

  const linkedBlueprint =
    selection?.kind === "scheduled" && selection.row.blueprint_id
      ? blueprints.find((b) => b.id === selection.row.blueprint_id) ?? null
      : selection?.kind === "blueprint"
        ? selection.row
        : null;

  if (resolution.kind === "loading") {
    return (
      <Shell cid={null}>
        <Section title="Identity">
          <p className="hqx-sub">resolving viewer from server context…</p>
        </Section>
      </Shell>
    );
  }

  if (resolution.kind === "unauthorized") {
    return (
      <Shell cid={null}>
        <Section title="Access">
          <StateBlock state="UNAUTHORIZED" reasons={["server context did not resolve a viewer"]} />
        </Section>
      </Shell>
    );
  }

  const body = (() => {
    if (isLoading)
      return (
        <Section title="Plan">
          <StateBlock state="LOADING" />
        </Section>
      );
    if (isError)
      return (
        <Section title="Plan">
          <StateBlock
            state="DEGRADED"
            reasons={["the read failed · nothing was changed", "reload the page to retry"]}
          />
        </Section>
      );
    if (isEmpty)
      return (
        <Section title="Plan">
          <StateBlock
            state="EMPTY_UNEXPECTED"
            reasons={["no plans yet · ask your COB to start one"]}
          />
        </Section>
      );

    if (view === "Board")
      return (
        <>
          <FactRow>
            {STAGES.map((s) => (
              <FactTile
                key={s}
                k={s}
                v={byStage[s].length}
                tone={s === "In Audit" && byStage[s].length > 0 ? "warn" : undefined}
              />
            ))}
          </FactRow>
          {STAGES.map((stage) => (
            <Section
              key={stage}
              title={`${stage} · ${byStage[stage].length}`}
              source="rpc · hq_scheduled_read"
              right={<Badge kind={STAGE_KIND[stage]}>{stage}</Badge>}
            >
              {byStage[stage].length === 0 ? (
                <StateBlock state="EMPTY_EXPECTED" />
              ) : (
                <RegisterTable columns={scheduledCols} rows={byStage[stage]} rowKey={(r) => r.id} />
              )}
            </Section>
          ))}
        </>
      );

    if (view === "Today")
      return (
        <>
          <FactRow>
            <FactTile k="Needs attention" v={today.attention.length} tone={today.attention.length ? "warn" : undefined} />
            <FactTile k="Scheduled soon" v={today.soon.length} />
            <FactTile k="Recently done" v={today.done.length} tone="good" />
          </FactRow>
          {[
            { label: "Needs attention", rows: today.attention },
            { label: "Scheduled soon", rows: today.soon },
            { label: "Recently done", rows: today.done },
          ].map((col) => (
            <Section key={col.label} title={`${col.label} · ${col.rows.length}`} source="rpc · hq_scheduled_read">
              {col.rows.length === 0 ? (
                <StateBlock state="EMPTY_EXPECTED" />
              ) : (
                <RegisterTable columns={scheduledCols} rows={col.rows} rowKey={(r) => r.id} />
              )}
            </Section>
          ))}
        </>
      );

    if (view === "Month")
      return (
        <Section
          title={format(monthCursor, "MMMM yyyy")}
          source="rpc · hq_scheduled_read"
          right={
            <span className="hqx-navbtns">
              <button type="button" className="seg" onClick={() => setMonthCursor(addMonths(monthCursor, -1))} aria-label="Previous month">
                ‹ prev
              </button>
              <button type="button" className="seg" onClick={() => setMonthCursor(addMonths(monthCursor, 1))} aria-label="Next month">
                next ›
              </button>
            </span>
          }
        >
          <div className="cal">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="cal-h">{d}</div>
            ))}
            {monthDays.map((day) => {
              const events = scheduled.filter((r) => r.run_at && isSameDay(new Date(r.run_at), day));
              const cls = [
                "cal-d",
                isSameMonth(day, monthCursor) ? "" : "out",
                isSameDay(day, new Date()) ? "now" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div key={day.toISOString()} className={cls}>
                  <div className="cal-n">{format(day, "d")}</div>
                  {events.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="cal-e"
                      onClick={() => setSelection({ kind: "scheduled", row })}
                    >
                      <span className="rk">{format(new Date(row.run_at as string), "HH:mm")}</span>{" "}
                      {row.title ?? "Untitled"}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </Section>
      );

    return (
      <>
        <FactRow>
          <FactTile k="Blueprints" v={blueprints.length} />
          <FactTile k="Projects" v={portfolio.length} />
        </FactRow>
        {portfolio.map(([project, rows]) => (
          <Section key={project} title={`${project} · ${rows.length} records`} source="rpc · hq_blueprints_read">
            <RegisterTable columns={blueprintCols} rows={rows} rowKey={(r) => r.id} />
          </Section>
        ))}
      </>
    );
  })();

  return (
    <Shell cid={resolution.viewer.cid}>
      <div className="hqx-ph">
        <h1>Blueprints</h1>
      </div>
      <p className="hqx-sub">
        Your build plan · from intent to done · {total} records · read live
      </p>
      <div className="prov">
        <Badge kind="act">LIVE</Badge>
        <span className="sep">·</span>
        <span>rpc · hq_blueprints_read + hq_scheduled_read</span>
        <span className="sep">·</span>
        <span>{total} rows read</span>
        <span className="sep">·</span>
        <span>tenant projection</span>
        <span className="sep">·</span>
        <span>read only</span>
      </div>

      <div className="segrow">
        {VIEWS.map((v) => (
          <button key={v} type="button" className={`seg ${view === v ? "on" : ""}`} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
        <button type="button" className="seg brass" onClick={notifyReadOnly}>
          Kick it off
        </button>
      </div>

      {body}

      {selection && (
        <>
          <div className="drw-scrim" onClick={() => setSelection(null)} />
          <aside className="drw" role="dialog" aria-label="Build packet">
            <div className="drw-h">
              <div>
                <h2>{selection.kind === "scheduled" ? selection.row.title ?? "Untitled" : selection.row.title}</h2>
                <span className="rk">Build packet · read only</span>
              </div>
              <button type="button" className="seg" onClick={() => setSelection(null)}>close</button>
            </div>
            <div className="drw-b">
              {selection.kind === "scheduled" && (
                <>
                  <FactRow>
                    <FactTile k="Program" v={selection.row.program ?? "\u2014"} />
                    <FactTile k="Stage" v={stageOf(selection.row)} />
                    <FactTile k="Gates" v={gatesLabel(selection.row)} />
                    <FactTile k="Spec status" v={selection.row.spec_status ?? "\u2014"} />
                  </FactRow>
                  <div className="drw-f">
                    <div className="k">Run at</div>
                    <div className="v">
                      {selection.row.run_at ? format(new Date(selection.row.run_at), "dd MMM yyyy · HH:mm") : "\u2014"}
                    </div>
                  </div>
                  <div className="drw-f">
                    <div className="k">Cadence</div>
                    <div className="v">{selection.row.cadence ?? "\u2014"}</div>
                  </div>
                  {selection.row.detail && (
                    <div className="drw-f">
                      <div className="k">Detail</div>
                      <div className="v">{selection.row.detail}</div>
                    </div>
                  )}
                  {selection.row.build_spec != null && (
                    <div className="drw-f">
                      <div className="k">Build spec</div>
                      <pre className="drw-pre">
                        {typeof selection.row.build_spec === "string"
                          ? selection.row.build_spec
                          : JSON.stringify(selection.row.build_spec, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}

              {linkedBlueprint && (
                <Section title="Blueprint" source="rpc · hq_blueprints_read">
                  <div className="drw-f">
                    <div className="k">Title</div>
                    <div className="v">{linkedBlueprint.title}</div>
                  </div>
                  <div className="drw-f">
                    <div className="k">Status</div>
                    <div className="v"><Badge kind={statusKind(linkedBlueprint.status)}>{linkedBlueprint.status ?? "unknown"}</Badge></div>
                  </div>
                  <div className="drw-f">
                    <div className="k">Owner</div>
                    <div className="v">{linkedBlueprint.owner ?? "\u2014"}</div>
                  </div>
                  {linkedBlueprint.intent && (
                    <div className="drw-f">
                      <div className="k">Intent</div>
                      <div className="v">{linkedBlueprint.intent}</div>
                    </div>
                  )}
                  {linkedBlueprint.current_state && (
                    <div className="drw-f">
                      <div className="k">Current state</div>
                      <div className="v">{linkedBlueprint.current_state}</div>
                    </div>
                  )}
                  {linkedBlueprint.next_action && (
                    <div className="drw-f">
                      <div className="k">Next action</div>
                      <div className="v">{linkedBlueprint.next_action}</div>
                    </div>
                  )}
                  {milestonesOf(linkedBlueprint.milestones).length > 0 && (
                    <div className="drw-f">
                      <div className="k">Milestones</div>
                      <ul className="drw-ul">
                        {milestonesOf(linkedBlueprint.milestones).map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Section>
              )}

              <button type="button" className="seg brass wide" onClick={notifyReadOnly}>
                Kick it off
              </button>
            </div>
          </aside>
        </>
      )}
    </Shell>
  );
}

export default BlueprintsOS;
