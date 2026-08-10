/** BOB · Blueprints Orchestrating Builds · /hq/blueprints
 *
 * HQ DESIGN light theme, tokens only (src/hq-next/styles/hq-design.css, scoped .hqd).
 * Strictly READ-ONLY: every read goes through the CID-scoped service-role
 * projections hq_blueprints_read / hq_scheduled_read. No direct table access.
 *
 * Density law: card faces carry short title, state chips, owner, date. All
 * verbose detail (intent, current state, next action, milestones) lives in the
 * right-side drawer.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  addDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isSameMonth,
} from "date-fns";
import { X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { HqShell } from "@/components/hq/HqShell";
import "@/hq-next/styles/hq-design.css";
import { useCobLabel } from "@/lib/cob-identity";
import { requestAction } from "@/lib/hq-request-action";

/* ---------------------------------------------------------------- contracts */

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
  | { kind: "blueprint"; row: BlueprintRow }
  | { kind: "scheduled"; row: ScheduledRow }
  | null;

const readOnlyNote = (cob: string) =>
  `Builds are created, scheduled, and moved through the Connector \u00b7 just ask ${cob}.`;

/* ------------------------------------------------------------------- shapes */

/** Marching-order states, in board order. */
const ORDERS = ["BANKED", "ACTIVE FRONT", "GATED", "TABLED"] as const;
type OrderState = (typeof ORDERS)[number];

const ORDER_CHIP: Record<OrderState, string> = {
  BANKED: "ok",
  "ACTIVE FRONT": "brass",
  GATED: "navy",
  TABLED: "warn",
};

interface OrderEntry {
  state: OrderState;
  tag: string;
  text: string;
  owner: string | null;
}

const CATEGORIES = [
  "Command",
  "Onboarding & TAYLOR",
  "World Engine & Deep Gather",
  "Memory",
  "HQ Pages & Design",
  "Authority & Security",
  "Platform & Programs",
] as const;
type Category = (typeof CATEGORIES)[number];

function categoryOf(title: string): Category {
  const t = (title ?? "").toUpperCase();
  if (t.includes("\u2605") || t.includes("MARCHING ORDER") || t.startsWith("P0 ")) return "Command";
  if (t.includes("ONBOARDING") || t.includes("TAYLOR")) return "Onboarding & TAYLOR";
  if (t.startsWith("WORLD ENGINE") || t.startsWith("DG ") || t.includes("DEEP GATHER"))
    return "World Engine & Deep Gather";
  if (t.startsWith("MEMORY") || t.includes(" MEMORY")) return "Memory";
  if (t.includes("AUTHORITY") || t.includes("SECURITY") || t.includes("LEGAL") || t.includes("ENTITLEMENTS"))
    return "Authority & Security";
  if (t.startsWith("HQ ")) return "HQ Pages & Design";
  return "Platform & Programs";
}

/** Card faces stay terse: no parentheticals, no long trailing clauses. */
function shortTitle(title: string): string {
  let t = (title ?? "").replace(/\u2605/g, "").trim();
  t = t.replace(/\s*\([^)]*\)\s*$/, "");
  t = t.split(/\s+\u2014\s+/)[0];
  t = t.replace(/^HQ\s*\u00b7\s*/, "");
  return t.trim() || "Untitled";
}

function statusChip(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s.includes("done") || s.includes("complete")) return "ok";
  if (s.includes("block") || s.includes("fail")) return "stop";
  if (s.includes("draft") || s.includes("pend") || s.includes("propos")) return "warn";
  return "";
}

function stageOf(row: ScheduledRow): string {
  const status = (row.status ?? "").toLowerCase();
  const spec = (row.spec_status ?? "").toUpperCase();
  if (status === "completed") return "done";
  if (row.gates_total != null && (row.gates_passed ?? 0) < row.gates_total) return "in audit";
  if (status === "running") return "in motion";
  if (spec === "READY" || spec === "PROPOSED") return "awaiting GO";
  if (status === "scheduled") return "scheduled";
  return "queued";
}

const STAGE_CHIP: Record<string, string> = {
  done: "ok",
  "in audit": "warn",
  "in motion": "brass",
  "awaiting GO": "warn",
  scheduled: "navy",
  queued: "",
};

function milestonesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((m) => (typeof m === "string" ? m : JSON.stringify(m)));
  return [];
}

/** Derive the marching order straight from the command register. Never typed. */
function parseOrders(blueprints: BlueprintRow[]): OrderEntry[] {
  const command = blueprints.find((b) => (b.title ?? "").includes("\u2605"));
  if (!command) return [];
  const out: OrderEntry[] = [];
  let state: OrderState | null = null;
  for (const line of milestonesOf(command.milestones)) {
    const header = line.match(/^=+\s*(.+?)\s*=+$/);
    if (header) {
      const label = header[1].toUpperCase();
      state =
        ORDERS.find((o) => label.startsWith(o)) ??
        (label.includes("GATED") ? "GATED" : label.includes("TABLED") ? "TABLED" : null);
      continue;
    }
    if (!state) continue;
    const tagged = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    const tag = tagged ? tagged[1] : state;
    let text = tagged ? tagged[2] : line;
    let owner: string | null = null;
    const ownerMatch = text.match(/\[owner:\s*([^\]]+)\]\s*$/i);
    if (ownerMatch) {
      owner = ownerMatch[1].trim();
      text = text.slice(0, ownerMatch.index).trim();
    }
    out.push({ state, tag, text, owner });
  }
  return out;
}

const STOP_WORDS = new Set(["THE", "AND", "FOR", "WITH", "PROGRAM", "PROGRAMME", "OWNER"]);

function tokens(value: string): string[] {
  return (value ?? "")
    .toUpperCase()
    .split(/[^A-Z0-9.]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Attach each order entry to the blueprint its owner label names. */
function ordersByBlueprint(orders: OrderEntry[], blueprints: BlueprintRow[]) {
  const map = new Map<string, OrderEntry[]>();
  for (const entry of orders) {
    if (!entry.owner) continue;
    const want = tokens(entry.owner);
    if (want.length === 0) continue;
    let best: { id: string; score: number } | null = null;
    for (const bp of blueprints) {
      const have = new Set(tokens(bp.title ?? ""));
      const score = want.filter((w) => have.has(w)).length / want.length;
      if (!best || score > best.score) best = { id: bp.id, score };
    }
    if (best && best.score >= 0.5) map.set(best.id, [...(map.get(best.id) ?? []), entry]);
  }
  return map;
}

/** Primary marching state for a blueprint · active front outranks the rest. */
function orderStateOf(entries: OrderEntry[] | undefined): OrderState | null {
  if (!entries || entries.length === 0) return null;
  for (const state of ["ACTIVE FRONT", "GATED", "TABLED", "BANKED"] as OrderState[]) {
    if (entries.some((e) => e.state === state)) return state;
  }
  return null;
}

/* ------------------------------------------------------------------- viewer */

interface Viewer {
  isOperator: boolean;
  cid: string;
  displayName: string | null;
}

type Resolution = { kind: "loading" } | { kind: "ready"; viewer: Viewer } | { kind: "unauthorized" };

function useResolvedViewer(): Resolution {
  const [state, setState] = useState<Resolution>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    const resolve = async (): Promise<Resolution> => {
      const cidRes = await supabase.rpc("current_cid");
      const cid = cidRes.error ? null : (cidRes.data as string | null);
      if (!cid) return { kind: "unauthorized" };
      const tenantRes = await supabase.from("tenants").select("cid, cob_name").eq("cid", cid).maybeSingle();
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

/* --------------------------------------------------------------- primitives */

function Sec({
  n,
  title,
  count,
  chip,
  children,
}: {
  n: number;
  title: string;
  count?: string;
  chip?: { kind: string; text: string };
  children: React.ReactNode;
}) {
  return (
    <section className="sec">
      <div className="sec-h">
        <span className="chipn">{String(n).padStart(2, "0")}</span>
        <h3>{title}</h3>
        {chip && <span className={`g ${chip.kind}`}>{chip.text}</span>}
        {count && <span className="cnt">{count}</span>}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------- page  */

const VIEWS = ["Board", "Roadmap", "Calendar"] as const;
type View = (typeof VIEWS)[number];

export function BlueprintsOS() {
  const COB = useCobLabel();
  const resolution = useResolvedViewer();
  const [view, setView] = useState<View>("Board");
  const [monthCursor, setMonthCursor] = useState<Date>(new Date());
  const [selection, setSelection] = useState<Selection>(null);
  const [kicking, setKicking] = useState(false);
  const [kickLine, setKickLine] = useState<string | null>(null);

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

  const orders = useMemo(() => parseOrders(blueprints), [blueprints]);
  const orderMap = useMemo(() => ordersByBlueprint(orders, blueprints), [orders, blueprints]);

  const grouped = useMemo(() => {
    const map = new Map<Category, BlueprintRow[]>();
    for (const bp of blueprints) {
      const key = categoryOf(bp.title ?? "");
      map.set(key, [...(map.get(key) ?? []), bp]);
    }
    for (const [, rows] of map) {
      rows.sort((a, b) => {
        const rank = (r: BlueprintRow) => {
          const s = orderStateOf(orderMap.get(r.id));
          return s ? ORDERS.indexOf(s === "BANKED" ? "TABLED" : s) : 2;
        };
        return rank(a) - rank(b) || shortTitle(a.title).localeCompare(shortTitle(b.title));
      });
    }
    return CATEGORIES.filter((c) => map.has(c)).map((c) => [c, map.get(c) as BlueprintRow[]] as const);
  }, [blueprints, orderMap]);

  const orderCounts = useMemo(() => {
    const counts: Record<OrderState, number> = { BANKED: 0, "ACTIVE FRONT": 0, GATED: 0, TABLED: 0 };
    for (const o of orders) counts[o.state] += 1;
    return counts;
  }, [orders]);

  /** Dated milestones across the register, for the calendar. */
  const datedMilestones = useMemo(() => {
    const out: { id: string; date: Date; label: string; row: BlueprintRow }[] = [];
    for (const bp of blueprints) {
      milestonesOf(bp.milestones).forEach((m, i) => {
        const hit = m.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!hit) return;
        const date = new Date(Number(hit[1]), Number(hit[2]) - 1, Number(hit[3]));
        out.push({ id: `${bp.id}-${i}`, date, label: shortTitle(bp.title), row: bp });
      });
    }
    return out;
  }, [blueprints]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 });
    const days: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
  }, [monthCursor]);

  const total = blueprints.length;
  const isLoading = blueprintsQuery.isLoading || scheduledQuery.isLoading;
  const isError = blueprintsQuery.isError || scheduledQuery.isError;

  const linkedBlueprint =
    selection?.kind === "scheduled" && selection.row.blueprint_id
      ? blueprints.find((b) => b.id === selection.row.blueprint_id) ?? null
      : selection?.kind === "blueprint"
        ? selection.row
        : null;

  const Card = ({ bp }: { bp: BlueprintRow }) => {
    const entries = orderMap.get(bp.id);
    const state = orderStateOf(entries);
    return (
      <button type="button" className="card" onClick={() => setSelection({ kind: "blueprint", row: bp })}>
        <div className="ct">{shortTitle(bp.title)}</div>
        <div className="crow">
          {state && <span className={`g ${ORDER_CHIP[state]}`}>{state}</span>}
          <span className={`g ${statusChip(bp.status)}`}>{bp.status ?? "unknown"}</span>
        </div>
        <div className="cmeta">
          <span>{bp.owner ?? "unassigned"}</span>
          <span className="dt">{bp.updated_at ? format(new Date(bp.updated_at), "dd MMM") : ""}</span>
        </div>
      </button>
    );
  };

  const board = (
    <>
      {grouped.map(([category, rows], i) => (
        <Sec key={category} n={i + 1} title={category} count={`${rows.length} records`}>
          <div className="grid">
            {rows.map((bp) => (
              <Card key={bp.id} bp={bp} />
            ))}
          </div>
        </Sec>
      ))}
    </>
  );

  const roadmapLanes: { key: string; label: string; states: OrderState[]; tone: string }[] = [
    { key: "behind", label: "Banked \u00b7 behind us", states: ["BANKED"], tone: "done" },
    { key: "now", label: "Active front \u00b7 now", states: ["ACTIVE FRONT"], tone: "now" },
    { key: "ahead", label: "Gated and tabled \u00b7 ahead", states: ["GATED", "TABLED"], tone: "next" },
  ];

  const roadmap = (
    <>
      {roadmapLanes.map((lane) => {
        const items = orders.filter((o) => lane.states.includes(o.state));
        return (
          <div key={lane.key}>
            <div className="lane-h">
              <span className="lt">{lane.label}</span>
              <span className="ln" />
              <span className="g">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <div className="note">Nothing in this lane right now.</div>
            ) : (
              <div className="rail-tl">
                {items.map((entry, i) => {
                  const target = blueprints.find(
                    (b) => (orderMap.get(b.id) ?? []).includes(entry)
                  );
                  return (
                    <div key={`${lane.key}-${i}`} className={`tl-item ${lane.tone}`}>
                      <div className={`tl-card ${lane.tone === "now" ? "now" : ""}`}>
                        <div className="tt">{entry.text}</div>
                        <div className="tm">
                          <span className={`g ${ORDER_CHIP[entry.state]}`}>{entry.tag}</span>
                          {entry.owner && (
                            <button
                              type="button"
                              className="g"
                              style={{ cursor: target ? "pointer" : "default" }}
                              onClick={() => target && setSelection({ kind: "blueprint", row: target })}
                            >
                              {entry.owner}
                            </button>
                          )}
                          {lane.tone === "next" && <span>depends on the active front clearing</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {scheduled.length > 0 && (
        <Sec n={1} title="Scheduled ahead" count={`${scheduled.length} builds`}>
          <div className="rail-tl">
            {[...scheduled]
              .sort((a, b) => (a.run_at ?? "").localeCompare(b.run_at ?? ""))
              .map((row) => (
                <div key={row.id} className="tl-item next">
                  <div className="tl-card">
                    <div className="tt">{row.title ?? "Untitled build"}</div>
                    <div className="tm">
                      <span className={`g ${STAGE_CHIP[stageOf(row)]}`}>{stageOf(row)}</span>
                      <span>{row.program ?? "no program"}</span>
                      <span>
                        {row.run_at ? format(new Date(row.run_at), "dd MMM yyyy \u00b7 HH:mm") : "undated"}
                      </span>
                      <button
                        type="button"
                        className="g"
                        onClick={() => setSelection({ kind: "scheduled", row })}
                      >
                        open
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </Sec>
      )}
    </>
  );

  const calendar = (
    <Sec
      n={1}
      title={format(monthCursor, "MMMM yyyy")}
      count={`${
        scheduled.filter((r) => r.run_at && isSameMonth(new Date(r.run_at), monthCursor)).length +
        datedMilestones.filter((m) => isSameMonth(m.date, monthCursor)).length
      } dated entries`}
    >
      <div className="views">
        <button type="button" className="vb" onClick={() => setMonthCursor(addMonths(monthCursor, -1))}>
          prev
        </button>
        <button type="button" className="vb" onClick={() => setMonthCursor(new Date())}>
          today
        </button>
        <button type="button" className="vb" onClick={() => setMonthCursor(addMonths(monthCursor, 1))}>
          next
        </button>
      </div>
      <div className="cal">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="cal-h">
            {d}
          </div>
        ))}
        {monthDays.map((day) => {
          const runs = scheduled.filter((r) => r.run_at && isSameDay(new Date(r.run_at), day));
          const miles = datedMilestones.filter((m) => isSameDay(m.date, day));
          const cls = [
            "cal-d",
            isSameMonth(day, monthCursor) ? "" : "out",
            isSameDay(day, new Date()) ? "now" : "",
            runs.length + miles.length === 0 ? "empty" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={day.toISOString()} className={cls}>
              <div className="cal-n">{format(day, "d MMM")}</div>
              {runs.slice(0, 6).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="cal-e"
                  onClick={() => setSelection({ kind: "scheduled", row })}
                >
                  <b>{format(new Date(row.run_at as string), "HH:mm")}</b>
                  {row.title ?? "Untitled build"}
                </button>
              ))}
              {miles.slice(0, 3).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="cal-e mile"
                  onClick={() => setSelection({ kind: "blueprint", row: m.row })}
                >
                  <b>MS</b>
                  {m.label}
                </button>
              ))}
              {runs.length + miles.length > 9 && (
                <div className="cal-more">
                  {runs.length + miles.length - Math.min(runs.length, 6) - Math.min(miles.length, 3)} more
                  on this day
                </div>
              )}

            </div>
          );
        })}
      </div>
    </Sec>
  );

  if (resolution.kind !== "ready") {
    return (
      <HqShell>
      <div className="hqd">
        <div className="wrap">
          <div className="kick">Blueprints orchestrating builds</div>
          <h1>BOB</h1>
          {resolution.kind === "loading" ? (
            <div className="note">Signing you in.</div>
          ) : (
            <div className="note">
              <b>This board is not open to you.</b> Ask {COB} to check your account.
            </div>
          )}
        </div>
      </div>
      </HqShell>
    );
  }

  return (
    <HqShell>
    <div className="hqd">
      <main className="wrap">
        <header>
          <div className="kick">Blueprints orchestrating builds</div>
          <h1>BOB</h1>
          <p className="lede">
            One board with everything we are working on, in order.
          </p>
        </header>

        <div className="strip">
          <div className="strip-top">
            <div className="kick">Current marching order</div>
            <h2>
              {orderCounts["ACTIVE FRONT"]} being worked on now &middot; {total} in total
            </h2>
          </div>
          <div className="strip-cells">
            {ORDERS.map((state) => (
              <div key={state} className={`cell ${state === "ACTIVE FRONT" ? "on" : ""}`}>
                <b>{orderCounts[state]}</b>
                <span>{state}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="views">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className={`vb ${view === v ? "on" : ""}`}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="grid" style={{ marginTop: 20 }} aria-busy="true">
            <div className="skel" />
            <div className="skel" />
            <div className="skel" />
          </div>
        )}

        {isError && (
          <div className="note">
            <b>We could not load this.</b> Nothing changed. Reload the page to try again.
          </div>
        )}

        {!isLoading && !isError && total === 0 && (
          <div className="note">
            <b>No plans yet.</b> Ask {COB} to start one.
          </div>
        )}

        {!isLoading && !isError && total > 0 && (
          <>
            {view === "Board" && board}
            {view === "Roadmap" && roadmap}
            {view === "Calendar" && calendar}
          </>
        )}

        <div className="foot">
          {resolution.viewer.cid} &middot; always up to date &middot; you can read, not change
        </div>
      </main>

      {selection && (
        <>
          <button
            type="button"
            className="scrim"
            aria-label="Close detail"
            onClick={() => setSelection(null)}
          />
          <aside className="drw" role="dialog" aria-label="Program detail">
            <div className="drw-h">
              <div>
                <div className="kick">
                  {selection.kind === "blueprint" ? "Program packet" : "Build packet"}
                </div>
                <h2>
                  {selection.kind === "blueprint"
                    ? shortTitle(selection.row.title)
                    : selection.row.title ?? "Untitled build"}
                </h2>
              </div>
              <button
                type="button"
                className="icon-b"
                style={{ marginLeft: "auto" }}
                aria-label="Close"
                onClick={() => setSelection(null)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="drw-b">
              {selection.kind === "scheduled" && (
                <>
                  <div className="fld">
                    <div className="k">Stage</div>
                    <div className="chiprow">
                      <span className={`g ${STAGE_CHIP[stageOf(selection.row)]}`}>
                        {stageOf(selection.row)}
                      </span>
                      <span className="g">{selection.row.program ?? "no program"}</span>
                      <span className="g">
                        gates {selection.row.gates_passed ?? 0}/{selection.row.gates_total ?? 0}
                      </span>
                    </div>
                  </div>
                  <div className="fld">
                    <div className="k">Run at</div>
                    <div className="v">
                      {selection.row.run_at
                        ? format(new Date(selection.row.run_at), "dd MMM yyyy \u00b7 HH:mm")
                        : "Undated"}
                    </div>
                  </div>
                  {selection.row.detail && (
                    <div className="fld">
                      <div className="k">Detail</div>
                      <div className="v">{selection.row.detail}</div>
                    </div>
                  )}
                  {selection.row.build_spec != null && (
                    <div className="fld">
                      <div className="k">Build spec</div>
                      <pre>
                        {typeof selection.row.build_spec === "string"
                          ? selection.row.build_spec
                          : JSON.stringify(selection.row.build_spec, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}

              {linkedBlueprint && (
                <>
                  <div className="fld">
                    <div className="k">Where it stands</div>
                    <div className="chiprow">
                      {(() => {
                        const state = orderStateOf(orderMap.get(linkedBlueprint.id));
                        return state ? <span className={`g ${ORDER_CHIP[state]}`}>{state}</span> : null;
                      })()}
                      <span className={`g ${statusChip(linkedBlueprint.status)}`}>
                        {linkedBlueprint.status ?? "unknown"}
                      </span>
                      <span className="g">{linkedBlueprint.owner ?? "unassigned"}</span>
                      <span className="g">{categoryOf(linkedBlueprint.title)}</span>
                      {linkedBlueprint.loop_cadence && (
                        <span className="g">{linkedBlueprint.loop_cadence}</span>
                      )}
                    </div>
                  </div>
                  <div className="fld">
                    <div className="k">Full title</div>
                    <div className="v">{linkedBlueprint.title}</div>
                  </div>
                  {linkedBlueprint.intent && (
                    <div className="fld">
                      <div className="k">Intent</div>
                      <div className="v">{linkedBlueprint.intent}</div>
                    </div>
                  )}
                  {linkedBlueprint.current_state && (
                    <div className="fld">
                      <div className="k">Current state</div>
                      <div className="v">{linkedBlueprint.current_state}</div>
                    </div>
                  )}
                  {linkedBlueprint.next_action && (
                    <div className="fld">
                      <div className="k">Next action</div>
                      <div className="v">{linkedBlueprint.next_action}</div>
                    </div>
                  )}
                  {(orderMap.get(linkedBlueprint.id) ?? []).length > 0 && (
                    <div className="fld">
                      <div className="k">Marching order</div>
                      <ul>
                        {(orderMap.get(linkedBlueprint.id) ?? []).map((e, i) => (
                          <li key={i}>
                            <span className={`g ${ORDER_CHIP[e.state]}`}>{e.tag}</span> {e.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {milestonesOf(linkedBlueprint.milestones).length > 0 && (
                    <div className="fld">
                      <div className="k">Milestones</div>
                      <ul>
                        {milestonesOf(linkedBlueprint.milestones).map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="fld">
                    <div className="k">Last written</div>
                    <div className="v">
                      {linkedBlueprint.updated_at
                        ? format(new Date(linkedBlueprint.updated_at), "dd MMM yyyy \u00b7 HH:mm")
                        : "Unknown"}
                    </div>
                  </div>
                </>
              )}

              <div style={{ marginTop: 24 }}>
                {kickLine ? (
                  <div className="said">{kickLine}</div>
                ) : (
                  <button
                    type="button"
                    className="vb brass"
                    disabled={kicking}
                    onClick={() => {
                      const row = selection.row as { id?: string; title?: string | null };
                      if (!row.id) return;
                      setKicking(true);
                      void requestAction('build.start', { blueprint_id: row.id }, `Kick off: ${row.title ?? 'this build'}`).then((res) => {
                        setKicking(false);
                        setKickLine(res.line);
                      });
                    }}
                  >
                    Kick it off
                  </button>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
    </HqShell>
  );
}

export default BlueprintsOS;
