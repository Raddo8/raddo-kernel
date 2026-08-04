/** THE VAULT · governed belief system, client plane, strictly READ-ONLY.
 * Golden master /hq treatment (surface_version hq v29-r28): navy .rail,
 * white .filehead + .fh-strip, numbered .sec sections, flat .reg registers.
 * Every read routes through a service-role projection (hq_memory_*), never a
 * direct client table read. Propose / correct / confirm / supersede is a later
 * stage (MEMORY-P5) and is deliberately absent here. */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import "@/hq-next/styles/hq-golden.css";
import cobMark from "@/assets/cob-mark.png.asset.json";

interface MemoryRow {
  id: string;
  category: string | null;
  title: string;
  body_md: string | null;
  confidence: number | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  session_id: string | null;
  notion_block_ref: string | null;
  supersedes: string | null;
}

interface LineageRow {
  old_id: string;
  old_title: string | null;
  old_category: string | null;
  old_created_at: string | null;
  superseded_at: string | null;
  new_id: string;
  new_title: string | null;
}

interface SearchRow {
  id: string;
  category: string | null;
  title: string;
  body_md: string | null;
  confidence: number | null;
  status: string | null;
  created_at: string | null;
  rank: number | null;
}

interface Counts {
  active: number;
  review: number;
  superseded: number;
  binned: number;
  total: number;
}

const EMPTY_COUNTS: Counts = { active: 0, review: 0, superseded: 0, binned: 0, total: 0 };

const READ_ONLY_NOTE =
  "Beliefs are proposed, corrected, and retired through your COB Connector \u00b7 just ask your COB.";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ageOf(iso: string | null): string {
  if (!iso) return "\u2014";
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} old`;
  } catch {
    return "\u2014";
  }
}

function confidenceLabel(value: number | null): string {
  if (value == null) return "\u2014";
  return `${Math.round(Number(value) * 100)}%`;
}

function confidenceKind(value: number | null): string {
  const v = value == null ? 0 : Number(value);
  if (v >= 0.85) return "act";
  if (v >= 0.6) return "live";
  if (v >= 0.35) return "pend";
  return "dorm";
}

function statusKind(status: string | null): string {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return "act";
    case "review":
      return "pend";
    case "superseded":
      return "owed";
    case "binned":
      return "dorm";
    default:
      return "private";
  }
}

interface Viewer {
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
      return { kind: "ready", viewer: { cid, displayName: tenantRes.data.cob_name ?? null } };
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

const VIEWS = ["Beliefs", "Supersessions", "Search"] as const;
type View = (typeof VIEWS)[number];

/** Golden rail · logo tile, numbered nav links. */
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
        <a className="nl" href="/hq/blueprints">
          <span className="nn">01</span>
          <span>Blueprints</span>
        </a>
        <a className="nl" href="/hq">
          <span className="nn">02</span>
          <span>HQ</span>
        </a>
        <a className="nl on" href="/hq/memories">
          <span className="nn">03</span>
          <span>Memory</span>
        </a>
      </nav>
      <div className="rail-foot">
        <span className="dot" />
        read live &middot; read only
      </div>
    </aside>
  );
}

function FileHead({ total, cells }: { total: number; cells: { label: string; value: number }[] }) {
  return (
    <div className="filehead">
      <div className="fh-top">
        <div>
          <div className="fh-sub">Memory</div>
          <div className="fh-name">What your COB believes</div>
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
  children,
}: {
  n: number;
  title: string;
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sec">
      <div className="sec-h">
        <span className="n">{pad2(n)}</span>
        <h2>{title}</h2>
        {count && <span className="cnt">{count}</span>}
      </div>
      {children}
    </div>
  );
}

export function MemoryVault() {
  const resolution = useResolvedViewer();
  const [view, setView] = useState<View>("Beliefs");
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MemoryRow | null>(null);

  const beliefsQuery = useQuery({
    queryKey: ["hq-memory-read"],
    queryFn: async (): Promise<MemoryRow[]> => {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("hq_memory_read", { p_limit: 500, p_offset: 0 });
      if (error) throw error;
      return (data ?? []) as MemoryRow[];
    },
  });

  const countsQuery = useQuery({
    queryKey: ["hq-memory-counts"],
    queryFn: async (): Promise<Counts> => {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("hq_memory_counts");
      if (error) throw error;
      return { ...EMPTY_COUNTS, ...((data ?? {}) as Partial<Counts>) };
    },
  });

  const lineageQuery = useQuery({
    queryKey: ["hq-memory-lineage"],
    queryFn: async (): Promise<LineageRow[]> => {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("hq_memory_lineage", { p_limit: 200 });
      if (error) throw error;
      return (data ?? []) as LineageRow[];
    },
  });

  const searchQuery = useQuery({
    queryKey: ["hq-memory-search", query],
    enabled: query.trim().length > 0,
    queryFn: async (): Promise<SearchRow[]> => {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("hq_memory_search", { p_q: query, p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as SearchRow[];
    },
  });

  const beliefs = useMemo(() => beliefsQuery.data ?? [], [beliefsQuery.data]);
  const counts = countsQuery.data ?? EMPTY_COUNTS;
  const lineage = useMemo(() => lineageQuery.data ?? [], [lineageQuery.data]);

  const grouped = useMemo(() => {
    const map = new Map<string, MemoryRow[]>();
    for (const row of beliefs) {
      const key = row.category ?? "uncategorised";
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [beliefs]);

  const isLoading = beliefsQuery.isLoading || countsQuery.isLoading;
  const isError = beliefsQuery.isError || countsQuery.isError;

  const BeliefTable = ({ rows }: { rows: MemoryRow[] }) => (
    <table className="reg">
      <thead>
        <tr>
          <th>Belief</th>
          <th>Confidence</th>
          <th>State</th>
          <th>Age</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <button
                type="button"
                className="rt"
                style={{
                  background: "none",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                  color: "inherit",
                }}
                onClick={() => setSelected(r)}
              >
                {r.title}
              </button>
              {r.body_md && <div className="rd">{r.body_md.slice(0, 160)}</div>}
            </td>
            <td>
              <span className={`g ${confidenceKind(r.confidence)}`}>{confidenceLabel(r.confidence)}</span>
            </td>
            <td>
              <span className={`g ${statusKind(r.status)}`}>{r.status ?? "unknown"}</span>
            </td>
            <td className="rk">{ageOf(r.created_at)}</td>
            <td className="rk">{r.created_by ?? (r.notion_block_ref ? "notion" : "\u2014")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (resolution.kind === "loading") {
    return (
      <div className="hqg">
        <Rail cid={null} />
        <div className="main">
          <div className="page on">
            <div className="sec">
              <div className="sec-h">
                <h2>Opening the vault\u2026</h2>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (resolution.kind === "unauthorized") {
    return (
      <div className="hqg">
        <Rail cid={null} />
        <div className="main">
          <div className="page on">
            <div className="sec">
              <div className="sec-h">
                <h2>No client record resolved for this sign in</h2>
              </div>
              <p className="rd">Ask your COB to confirm your access, then reload this page.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <Sec n={1} title="Reading the vault">
        <p className="rd">Fetching your active beliefs.</p>
      </Sec>
    );
  } else if (isError) {
    body = (
      <Sec n={1} title="The vault could not be read">
        <p className="rd">The projection refused this read. Ask your COB to check the memory register.</p>
      </Sec>
    );
  } else if (view === "Beliefs") {
    body =
      grouped.length === 0 ? (
        <Sec n={1} title="Nothing believed yet">
          <p className="rd">
            Your COB has recorded no beliefs for this record. Beliefs accrue as your COB works with you.
          </p>
        </Sec>
      ) : (
        <>
          {grouped.map(([category, rows], i) => (
            <Sec key={category} n={i + 1} title={category} count={`${rows.length}`}>
              <BeliefTable rows={rows} />
            </Sec>
          ))}
        </>
      );
  } else if (view === "Supersessions") {
    body = (
      <Sec n={1} title="What replaced what" count={`${lineage.length}`}>
        {lineage.length === 0 ? (
          <p className="rd">No belief has been superseded yet.</p>
        ) : (
          <table className="reg">
            <thead>
              <tr>
                <th>Retired belief</th>
                <th>Replaced by</th>
                <th>Category</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {lineage.map((r) => (
                <tr key={r.old_id}>
                  <td>
                    <span className="rt">{r.old_title ?? "Untitled"}</span>
                    <div className="rd">held from {r.old_created_at ? format(new Date(r.old_created_at), "dd MMM yyyy") : "\u2014"}</div>
                  </td>
                  <td>
                    <span className="rt">{r.new_title ?? "Untitled"}</span>
                  </td>
                  <td>
                    <span className="g private">{r.old_category ?? "uncategorised"}</span>
                  </td>
                  <td className="rk">
                    {r.superseded_at ? format(new Date(r.superseded_at), "dd MMM yyyy \u00b7 HH:mm") : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sec>
    );
  } else {
    const hits = searchQuery.data ?? [];
    body = (
      <Sec n={1} title="Search the vault" count={query ? `${hits.length}` : undefined}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(term.trim());
          }}
          style={{ display: "flex", gap: 8, marginBottom: 12 }}
        >
          <input
            className="bpb"
            style={{ flex: 1, textAlign: "left" }}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search titles and bodies"
            aria-label="Search memory"
          />
          <button type="submit" className="bpb bppri">
            Search
          </button>
        </form>
        {query && searchQuery.isLoading && <p className="rd">Searching.</p>}
        {query && !searchQuery.isLoading && hits.length === 0 && (
          <p className="rd">No belief matches that wording.</p>
        )}
        {hits.length > 0 && (
          <BeliefTable
            rows={hits.map((h) => ({
              id: h.id,
              category: h.category,
              title: h.title,
              body_md: h.body_md,
              confidence: h.confidence,
              status: h.status,
              created_at: h.created_at,
              updated_at: null,
              created_by: null,
              session_id: null,
              notion_block_ref: null,
              supersedes: null,
            }))}
          />
        )}
      </Sec>
    );
  }

  return (
    <div className="hqg">
      <Rail cid={resolution.viewer.cid} />
      <div className="main">
        <FileHead
          total={counts.total}
          cells={[
            { label: "Active", value: counts.active },
            { label: "In review", value: counts.review },
            { label: "Superseded", value: counts.superseded },
            { label: "Total", value: counts.total },
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
          </div>
          {body}
          <p className="rd" style={{ marginTop: 16 }}>
            {READ_ONLY_NOTE}
          </p>
        </div>
      </div>

      {selected && (
        <>
          <div className="bpdrw-scrim" onClick={() => setSelected(null)} />
          <aside className="bpdrw" role="dialog" aria-label="Belief record">
            <div className="bpdrw-h">
              <div>
                <h2>{selected.title}</h2>
                <div className="rk">Belief record &middot; read only</div>
              </div>
              <button type="button" className="bpb" onClick={() => setSelected(null)}>
                close
              </button>
            </div>
            <div className="bpdrw-b">
              <div className="bpdrw-f">
                <div className="k">Category</div>
                <div className="v">{selected.category ?? "uncategorised"}</div>
              </div>
              <div className="bpdrw-f">
                <div className="k">Confidence</div>
                <div className="v">
                  <span className={`g ${confidenceKind(selected.confidence)}`}>
                    {confidenceLabel(selected.confidence)}
                  </span>
                </div>
              </div>
              <div className="bpdrw-f">
                <div className="k">State</div>
                <div className="v">
                  <span className={`g ${statusKind(selected.status)}`}>{selected.status ?? "unknown"}</span>
                </div>
              </div>
              <div className="bpdrw-f">
                <div className="k">Held since</div>
                <div className="v">
                  {selected.created_at
                    ? `${format(new Date(selected.created_at), "dd MMM yyyy \u00b7 HH:mm")} \u00b7 ${ageOf(selected.created_at)}`
                    : "\u2014"}
                </div>
              </div>
              <div className="bpdrw-f">
                <div className="k">Recorded by</div>
                <div className="v">{selected.created_by ?? "\u2014"}</div>
              </div>
              <div className="bpdrw-f">
                <div className="k">Session</div>
                <div className="v">{selected.session_id ?? "\u2014"}</div>
              </div>
              <div className="bpdrw-f">
                <div className="k">Notion block</div>
                <div className="v">{selected.notion_block_ref ?? "\u2014"}</div>
              </div>
              <div className="bpdrw-f">
                <div className="k">Replaces</div>
                <div className="v">{selected.supersedes ?? "nothing"}</div>
              </div>
              {selected.body_md && (
                <div className="bpdrw-f">
                  <div className="k">Belief</div>
                  <pre className="bpdrw-pre">{selected.body_md}</pre>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

export default MemoryVault;
