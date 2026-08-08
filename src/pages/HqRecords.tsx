/** /hq/records · the RECORDS explorer.
 *
 * Admin-only fleet drill-down: fleet → client registers → register table →
 * row detail with clickable cross-links. Every number on this page is what the
 * server returned; nothing is hand-authored and nothing is optimistic about
 * substrate health. Empty register = warn, absent read = err.
 *
 * Authority is server-side: the hq-records function refuses a non-operator.
 * The gate here is a courtesy, not the lock.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import HqShell, { useIsOperator } from "@/components/hq/HqShell";
import { FleetLive } from "@/components/hq/FleetLive";
import { supabase } from "@/integrations/supabase/client";
import "@/hq-next/styles/hq-records.css";

const REGISTERS = [
  "memory_entries",
  "open_loops",
  "sessions",
  "session_checkpoints",
  "decisions",
  "council_minutes",
  "improvement_signals",
  "directives",
  "ritual_runs",
  "save_receipts",
  "blueprints",
  "change_log",
  "world_claims",
  "goals",
  "storyline",
  "document_registry",
] as const;

type Register = (typeof REGISTERS)[number];

const REGISTER_LABEL: Record<Register, string> = {
  memory_entries: "memory",
  open_loops: "open loops",
  sessions: "sessions",
  session_checkpoints: "checkpoints",
  decisions: "decisions",
  council_minutes: "minutes",
  improvement_signals: "signals",
  directives: "directives",
  ritual_runs: "rituals",
  save_receipts: "receipts",
  blueprints: "blueprints",
  change_log: "change log",
  world_claims: "world",
  goals: "goals",
  storyline: "storyline",
  document_registry: "documents",
};

type Row = Record<string, unknown>;

interface FleetRow {
  cid: string;
  display_name: string | null;
  cob_name: string | null;
  principal: string | null;
  status: string | null;
  memory_count: number;
  memory_last: string | null;
  sessions_count: number;
  sessions_last: string | null;
  loops_open: number;
  minutes_count: number;
  decisions_count: number;
  last_write: string | null;
}

interface CountRow {
  register: string;
  row_count: number;
  last_write: string | null;
}

interface RowsPayload {
  register: Register;
  cid: string;
  columns: string[];
  date_col: string;
  title_col: string | null;
  body_col: string | null;
  cat_col: string | null;
  status_col: string | null;
  page: number;
  page_size: number;
  total: number;
  rows: Row[];
}

interface Filters {
  category?: string;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  lane?: string;
  session_id?: string;
  id?: string;
  entity_id?: string;
}

async function call<T>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("hq-records", { body });
  if (error) return { data: null, error: error.message };
  const payload = data as { error?: string; reason?: string } & T;
  if (payload && (payload as { error?: string }).error) {
    return { data: null, error: `${payload.error}${payload.reason ? ` \u00b7 ${payload.reason}` : ""}` };
  }
  return { data: payload as T, error: null };
}

/** Short calendar day, or the honest word for nothing. */
function shortDate(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return same ? "today" : `${d.getMonth() + 1}/${d.getDate()}`;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "\u2014";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return shortDate(v);
    return v.length > 90 ? `${v.slice(0, 90)}\u2026` : v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v).slice(0, 90);
}

/** Fleet state pill · derived only from what the roll-up returned. */
function fleetState(r: FleetRow): { cls: string; label: string } {
  const total = r.memory_count + r.sessions_count + r.loops_open + r.minutes_count + r.decisions_count;
  const status = (r.status ?? "").toLowerCase();
  if (total === 0 && (status === "incomplete" || !r.principal)) {
    return { cls: "err", label: "phantom \u00b7 cleanup" };
  }
  if (total === 0) return { cls: "warn", label: "provisioned \u00b7 unfed" };
  if (status === "provisioning" && r.memory_count === 0) return { cls: "warn", label: "onboarding" };
  const last = r.last_write ? Date.parse(r.last_write) : 0;
  const dormant = last > 0 && Date.now() - last > 1000 * 60 * 60 * 24 * 14;
  if (dormant) return { cls: "warn", label: "dormant" };
  return { cls: "ok", label: "active" };
}

function Skeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div style={{ padding: "12px 0" }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skel" style={{ width: `${100 - i * 7}%` }} />
      ))}
    </div>
  );
}

function toCsv(cols: string[], rows: Row[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function HqRecords() {
  const isOperator = useIsOperator();
  const [tab, setTab] = useState<"explorer" | "live">(
    () => (typeof location !== "undefined" && location.hash === "#live" ? "live" : "explorer"),
  );

  const [fleet, setFleet] = useState<FleetRow[] | null>(null);
  const [fleetErr, setFleetErr] = useState<string | null>(null);

  const [cid, setCid] = useState<string | null>(null);
  const [counts, setCounts] = useState<CountRow[] | null>(null);
  const [countsErr, setCountsErr] = useState<string | null>(null);

  const [register, setRegister] = useState<Register | null>(null);
  const [payload, setPayload] = useState<RowsPayload | null>(null);
  const [rowsErr, setRowsErr] = useState<string | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);

  const [facets, setFacets] = useState<{ categories: string[]; statuses: string[] }>({ categories: [], statuses: [] });
  const [filters, setFilters] = useState<Filters>({});
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [hiddenCols, setHiddenCols] = useState<string[]>([]);
  const [colMenu, setColMenu] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const tableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOperator !== true) return;
    void call<{ rows: FleetRow[] }>({ action: "fleet" }).then(({ data, error }) => {
      if (error) setFleetErr(error);
      else setFleet(data?.rows ?? []);
    });
  }, [isOperator]);

  const selectClient = useCallback((next: string) => {
    setCid(next);
    setCounts(null);
    setCountsErr(null);
    setRegister(null);
    setPayload(null);
    setExpanded(null);
    void call<{ rows: CountRow[] }>({ action: "counts", cid: next }).then(({ data, error }) => {
      if (error) setCountsErr(error);
      else setCounts(data?.rows ?? []);
    });
  }, []);

  const loadRows = useCallback(
    async (reg: Register, forCid: string, f: Filters, p: number, size: number, col: string | null, dir: "asc" | "desc") => {
      setRowsLoading(true);
      setRowsErr(null);
      const { data, error } = await call<RowsPayload>({
        action: "rows",
        register: reg,
        cid: forCid,
        filters: f,
        page: p,
        page_size: size,
        sort_col: col ?? undefined,
        sort_dir: dir,
      });
      setRowsLoading(false);
      if (error) {
        setRowsErr(error);
        setPayload(null);
        return;
      }
      setPayload(data);
    },
    [],
  );

  const openRegister = useCallback(
    (reg: Register, extra: Filters = {}) => {
      if (!cid) return;
      // optimistic: the section swaps immediately, rows fill under a skeleton
      setRegister(reg);
      setPayload(null);
      setExpanded(null);
      setPage(0);
      setSortCol(null);
      setSortDir("desc");
      setHiddenCols([]);
      const f = { ...extra };
      setFilters(f);
      setSearch(f.q ?? "");
      void loadRows(reg, cid, f, 0, pageSize, null, "desc");
      void call<{ categories: string[]; statuses: string[] }>({ action: "facets", register: reg, cid })
        .then(({ data }) => setFacets({ categories: data?.categories ?? [], statuses: data?.statuses ?? [] }));
      requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
    [cid, loadRows, pageSize],
  );

  const applyFilters = useCallback(
    (next: Filters, nextPage = 0, nextSize = pageSize, col = sortCol, dir = sortDir) => {
      setFilters(next);
      setPage(nextPage);
      setPageSize(nextSize);
      if (register && cid) void loadRows(register, cid, next, nextPage, nextSize, col, dir);
    },
    [register, cid, loadRows, pageSize, sortCol, sortDir],
  );

  const visibleCols = useMemo(
    () => (payload ? payload.columns.filter((c) => !hiddenCols.includes(c)) : []),
    [payload, hiddenCols],
  );

  const countFor = (reg: Register): CountRow | undefined => counts?.find((c) => c.register === reg);

  const selectedFleetRow = fleet?.find((f) => f.cid === cid) ?? null;

  if (isOperator === undefined) {
    return (
      <HqShell>
        <div className="page-rec">
          <div className="crumb">HQ &middot; control &middot; records</div>
          <Skeleton lines={4} />
        </div>
      </HqShell>
    );
  }

  if (isOperator === false) {
    return (
      <HqShell>
        <div className="page-rec">
          <div className="crumb">HQ &middot; control &middot; records</div>
          <h1 className="rec-h1">Access denied</h1>
          <p className="psub">
            This surface reads across the whole fleet, so it opens only for an operator identity.
            Your identity resolves to a client plane.
          </p>
          <span className="pill err" style={{ marginTop: 12, display: "inline-block" }}>
            not fleet operator
          </span>
        </div>
      </HqShell>
    );
  }

  return (
    <HqShell>
      <div className="page-rec">
        <div className="crumb">
          HQ &middot; control &middot; records{cid ? ` \u00b7 ${cid}` : " \u00b7 fleet"}
          {register ? ` \u00b7 ${REGISTER_LABEL[register]}` : ""}
        </div>
        <h1 className="rec-h1">Records</h1>
        <p className="psub">
          Every COBCLIENT, every register, every row. The fleet lands first; a client row drills to their
          registers; a register drills to its rows; a row opens its full record with provenance and its links.
          Every number reads live from its one register; nothing here is hand-authored.
        </p>

        <div className="lv-tabs" role="tablist" aria-label="Records views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "explorer"}
            className={tab === "explorer" ? "on" : ""}
            onClick={() => setTab("explorer")}
          >
            Explorer
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "live"}
            className={tab === "live" ? "on" : ""}
            onClick={() => setTab("live")}
          >
            Live
          </button>
        </div>

        {tab === "live" ? <FleetLive /> : (
        <>
        {/* LEVEL 1 · FLEET */}
        <div className="sec" style={{ marginTop: 18 }}>
          <div className="sec-k">
            <h2>Fleet &middot; all COBCLIENTS</h2>
            <span className="src">one row per tenant, keyed by CID &middot; click a row to drill</span>
          </div>
          {fleetErr ? (
            <div style={{ padding: "12px 0" }}>
              <span className="pill err">read failed &middot; {fleetErr}</span>
            </div>
          ) : !fleet ? (
            <Skeleton lines={6} />
          ) : (
            <table className="rec">
              <thead>
                <tr>
                  <th>CID</th>
                  <th>COB</th>
                  <th>Principal world</th>
                  <th>Memory</th>
                  <th>Sessions</th>
                  <th>Loops open</th>
                  <th>Minutes</th>
                  <th>Decisions</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map((r) => {
                  const st = fleetState(r);
                  return (
                    <tr
                      key={r.cid}
                      className={`click ${cid === r.cid ? "sel" : ""}`}
                      onClick={() => selectClient(r.cid)}
                    >
                      <td className="rk">{r.cid.replace("CID-", "")}</td>
                      <td className="rt">{r.cob_name ?? r.display_name ?? "\u2014"}</td>
                      <td className="rk">{r.principal ?? "\u2014"}</td>
                      <td className="rk">{r.memory_count} &middot; {shortDate(r.memory_last)}</td>
                      <td className="rk">{r.sessions_count} &middot; {shortDate(r.sessions_last)}</td>
                      <td className="rk">{r.loops_open}</td>
                      <td className="rk">{r.minutes_count}</td>
                      <td className="rk">{r.decisions_count}</td>
                      <td><span className={`pill ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* LEVEL 2 · REGISTER CHIPS */}
        {cid && (
          <div className="sec" ref={tableRef}>
            <div className="sec-k">
              <h2>
                Register explorer &middot; {cid} selected
                {selectedFleetRow?.cob_name ? ` \u00b7 ${selectedFleetRow.cob_name}` : ""}
              </h2>
              <span className="src">level 2 of the drill &middot; a register chip opens its table below</span>
            </div>

            {countsErr ? (
              <div style={{ padding: "12px 0" }}>
                <span className="pill err">counts unavailable &middot; {countsErr}</span>
              </div>
            ) : !counts ? (
              <Skeleton lines={2} />
            ) : (
              <div className="chips">
                {REGISTERS.map((reg) => {
                  const c = countFor(reg);
                  const cls = c === undefined ? "err" : c.row_count === 0 ? "warn" : "";
                  return (
                    <button
                      key={reg}
                      type="button"
                      className={`chip ${cls} ${register === reg ? "on" : ""}`}
                      onClick={() => openRegister(reg)}
                    >
                      {REGISTER_LABEL[reg]} &middot; {c === undefined ? "absent" : c.row_count}
                    </button>
                  );
                })}
              </div>
            )}

            {/* LEVEL 3 · REGISTER TABLE */}
            {register && (
              <>
                <div className="fbar">
                  <select
                    value={cid}
                    aria-label="Client"
                    onChange={(e) => {
                      const next = e.target.value;
                      selectClient(next);
                    }}
                  >
                    {(fleet ?? []).map((f) => (
                      <option key={f.cid} value={f.cid}>
                        {f.cid} &middot; {f.cob_name ?? f.display_name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filters.category ?? ""}
                    aria-label="Category"
                    disabled={facets.categories.length === 0}
                    onChange={(e) => applyFilters({ ...filters, category: e.target.value || undefined })}
                  >
                    <option value="">category: all</option>
                    {facets.categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <select
                    value={filters.status ?? ""}
                    aria-label="Status"
                    disabled={facets.statuses.length === 0}
                    onChange={(e) => applyFilters({ ...filters, status: e.target.value || undefined })}
                  >
                    <option value="">status: all</option>
                    {facets.statuses.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <input
                    type="date"
                    aria-label="From date"
                    value={filters.from?.slice(0, 10) ?? ""}
                    onChange={(e) =>
                      applyFilters({ ...filters, from: e.target.value ? `${e.target.value}T00:00:00Z` : undefined })
                    }
                  />
                  <input
                    type="date"
                    aria-label="To date"
                    value={filters.to?.slice(0, 10) ?? ""}
                    onChange={(e) =>
                      applyFilters({ ...filters, to: e.target.value ? `${e.target.value}T23:59:59Z` : undefined })
                    }
                  />

                  <input
                    className="grow"
                    placeholder={"search title + body\u2026"}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyFilters({ ...filters, q: search || undefined });
                    }}
                  />

                  <button type="button" className="strong" onClick={() => setColMenu((v) => !v)}>
                    columns &#9662;
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!payload) return;
                      const csv = toCsv(visibleCols, payload.rows);
                      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${register}_${cid}_p${page + 1}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    export csv
                  </button>

                  {(filters.session_id || filters.lane || filters.id || filters.entity_id) && (
                    <button type="button" onClick={() => applyFilters({ q: filters.q })}>
                      clear links
                    </button>
                  )}

                  {colMenu && payload && (
                    <div className="colmenu">
                      {payload.columns.map((c) => (
                        <label key={c}>
                          <input
                            type="checkbox"
                            checked={!hiddenCols.includes(c)}
                            onChange={() =>
                              setHiddenCols((h) => (h.includes(c) ? h.filter((x) => x !== c) : [...h, c]))
                            }
                          />
                          {c}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {rowsErr ? (
                  <div style={{ padding: "12px 0" }}>
                    <span className="pill err">read failed &middot; {rowsErr}</span>
                  </div>
                ) : rowsLoading || !payload ? (
                  <Skeleton lines={8} />
                ) : payload.total === 0 ? (
                  <div style={{ padding: "12px 0" }}>
                    <span className="pill warn">no rows &middot; register empty for this filter</span>
                  </div>
                ) : (
                  <table className="rec">
                    <thead>
                      <tr>
                        <th style={{ width: 16 }} />
                        {visibleCols.map((c) => (
                          <th
                            key={c}
                            onClick={() => {
                              const dir = sortCol === c && sortDir === "desc" ? "asc" : "desc";
                              setSortCol(c);
                              setSortDir(dir);
                              applyFilters(filters, 0, pageSize, c, dir);
                            }}
                          >
                            {c.replace(/_/g, " ")}
                            {sortCol === c && <span className="si"> {sortDir === "asc" ? "\u2191" : "\u2193"}</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payload.rows.map((r, i) => {
                        const rowId = String(r.id ?? r.save_id ?? i);
                        const open = expanded === rowId;
                        return (
                          <Fragment key={rowId}>
                            <tr
                              className={`click ${open ? "sel" : ""}`}
                              onClick={() => setExpanded(open ? null : rowId)}
                            >
                              <td className="rk">{open ? "\u25BE" : "\u25B8"}</td>
                              {visibleCols.map((c, ci) => (
                                <td key={c} className={ci === 0 ? "rt" : "rk"}>
                                  {cellText(r[c])}
                                </td>
                              ))}
                            </tr>
                            {open && (
                              <tr className="sel">
                                <td />
                                <td colSpan={visibleCols.length}>
                                  <RowDetail
                                    row={r}
                                    register={payload.register}
                                    bodyCol={payload.body_col}
                                    cid={payload.cid}
                                    onSession={(sid) => openRegister("memory_entries", { session_id: sid })}
                                    onChain={(id) => openRegister(payload.register, { id })}
                                    onLane={(lane) => applyFilters({ ...filters, lane })}
                                    onReceipts={(entityId) => openRegister("change_log", { entity_id: entityId })}
                                  />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                      <tr>
                        <td colSpan={visibleCols.length + 1} style={{ padding: 0 }}>
                          <div className="pager">
                            <button
                              type="button"
                              disabled={page === 0}
                              onClick={() => applyFilters(filters, page - 1, pageSize)}
                            >
                              prev
                            </button>
                            <span>
                              rows {page * pageSize + 1}&ndash;
                              {Math.min((page + 1) * pageSize, payload.total)} of {payload.total}
                            </span>
                            <button
                              type="button"
                              disabled={(page + 1) * pageSize >= payload.total}
                              onClick={() => applyFilters(filters, page + 1, pageSize)}
                            >
                              next
                            </button>
                            {[25, 50, 100].map((s) => (
                              <button
                                key={s}
                                type="button"
                                className={s === pageSize ? "strong" : ""}
                                onClick={() => applyFilters(filters, 0, s)}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        )}

        {/* REGISTER HEALTH · derived from the counts the server returned */}
        {cid && counts && (
          <div className="sec">
            <div className="sec-k">
              <h2>Register health</h2>
              <span className="src">one row per register &middot; last write verified at read time</span>
            </div>
            <table className="rec">
              <thead>
                <tr><th>Register</th><th>Rows</th><th>Last write</th><th>State</th></tr>
              </thead>
              <tbody>
                {REGISTERS.map((reg) => {
                  const c = countFor(reg);
                  return (
                    <tr key={reg} className="click" onClick={() => openRegister(reg)}>
                      <td className="rt">{REGISTER_LABEL[reg]}</td>
                      <td className="rk">{c ? c.row_count : "\u2014"}</td>
                      <td className="rk">{c ? shortDate(c.last_write) : "\u2014"}</td>
                      <td>
                        {!c ? (
                          <span className="pill err">absent &middot; no register</span>
                        ) : c.row_count === 0 ? (
                          <span className="pill warn">unfed</span>
                        ) : (
                          <span className="pill ok">healthy</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="foot-note">
          read live &middot; read only &middot; every value on this page is what the server returned for the
          selected CID &middot; registers are matched by client id, never by display name
        </p>
        </>
        )}
      </div>
    </HqShell>
  );
}

/** LEVEL 4 · the full record, its spine, and the links that keep drilling. */
function RowDetail({
  row,
  register,
  bodyCol,
  cid,
  onSession,
  onChain,
  onLane,
  onReceipts,
}: {
  row: Row;
  register: Register;
  bodyCol: string | null;
  cid: string;
  onSession: (sessionId: string) => void;
  onChain: (id: string) => void;
  onLane: (lane: string) => void;
  onReceipts: (entityId: string) => void;
}) {
  const body = bodyCol && typeof row[bodyCol] === "string" ? (row[bodyCol] as string) : null;
  const str = (k: string) => (typeof row[k] === "string" && row[k] ? (row[k] as string) : null);

  const sessionId = str("session_id") ?? (register === "sessions" ? str("id") : null);
  const supersededBy = str("superseded_by");
  const supersedes = str("supersedes");
  const lane = str("lane");
  const entityId = str("entity_id") ?? (register === "blueprints" ? str("id") : null);

  return (
    <div className="detail">
      <div className="detail-k">Row detail &middot; level 4 of the drill</div>
      {body ? (
        <div className="detail-body">
          <ReactMarkdown>{body}</ReactMarkdown>
        </div>
      ) : (
        <div className="detail-body">
          <span className="rk">no body text on this register</span>
        </div>
      )}

      <div className="kv">
        <div className="cell">
          <span className="rk">cid</span>
          <br />
          <span className="val">{cid}</span>
        </div>
        <div className="cell">
          <span className="rk">session</span>
          <br />
          {sessionId ? (
            <button type="button" className="link val" onClick={() => onSession(sessionId)}>
              {sessionId.slice(0, 8)} &rarr; what it wrote
            </button>
          ) : (
            <span className="val">&mdash;</span>
          )}
        </div>
        <div className="cell">
          <span className="rk">supersedes</span>
          <br />
          {supersedes ? (
            <button type="button" className="link val" onClick={() => onChain(supersedes)}>
              {supersedes.slice(0, 8)} &rarr; walk the chain
            </button>
          ) : (
            <span className="val">&mdash; (head of chain)</span>
          )}
        </div>
        <div className="cell">
          <span className="rk">superseded by</span>
          <br />
          {supersededBy ? (
            <button type="button" className="link val" onClick={() => onChain(supersededBy)}>
              {supersededBy.slice(0, 8)} &rarr; walk the chain
            </button>
          ) : (
            <span className="val">&mdash; (current head)</span>
          )}
        </div>
        <div className="cell">
          <span className="rk">provenance</span>
          <br />
          <span className="val">{str("provenance") ?? str("miner") ?? "\u2014"}</span>
        </div>
        <div className="cell">
          <span className="rk">confidence</span>
          <br />
          <span className="val">{row.confidence != null ? String(row.confidence) : "\u2014"}</span>
        </div>
        <div className="cell">
          <span className="rk">created by</span>
          <br />
          <span className="val">{str("created_by") ?? str("actor") ?? str("decided_by") ?? "\u2014"}</span>
        </div>
        <div className="cell">
          <span className="rk">memory lane</span>
          <br />
          {lane ? (
            <button type="button" className="link val" onClick={() => onLane(lane)}>
              {lane} &rarr; filter this lane
            </button>
          ) : (
            <span className="val">&mdash;</span>
          )}
        </div>
        <div className="cell">
          <span className="rk">receipts</span>
          <br />
          {entityId ? (
            <button type="button" className="link val" onClick={() => onReceipts(entityId)}>
              change log for {entityId.slice(0, 8)}
            </button>
          ) : (
            <span className="val">&mdash;</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default HqRecords;
