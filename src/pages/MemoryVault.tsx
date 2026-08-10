/** MEMORIES · /hq/memories
 *
 * Same family as Your World: a lead line, a wikipedia-style infobox on the
 * right, a table of contents grouped by lane, and one long debriefing table
 * of every memory. The table of contents and the table both run as long as
 * the data does: never clamped, never paginated.
 *
 * Every read goes through the tenant-keyed, service-role projection
 * (hq_memory_read / hq_memory_counts). This page never writes: changing a
 * memory is a conversation with the COB.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HqShell } from "@/components/hq/HqShell";
import { useComposeToDock } from "@/components/hq/dock-context";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  callWorld,
  sectionForRegister,
  type EntityCard,
  type LaneEntity,
  type SearchHit,
} from "@/lib/world-lanes";
import { datedLines, daysAway, linkify, loudestClock, type LinkTarget } from "@/lib/world-wiki";
import { ViewSwitch } from "@/components/hq/ViewSwitch";
import { readView, writeView, type HqView } from "@/lib/world-views";
import "@/hq-next/styles/hq-lanes.css";
import { useCobLabel } from "@/lib/cob-identity";

const DOT = "\u00b7";
const INFOBOX_CEILING = 8;
const SEEN_GRADES = ["seen", "own-probe", "document", "system-of-record", "verified"];

interface MemoryRow {
  id: string;
  category: string | null;
  lane: string | null;
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

interface Counts {
  active: number;
  review: number;
  superseded: number;
  binned: number;
  total: number;
}

const EMPTY_COUNTS: Counts = { active: 0, review: 0, superseded: 0, binned: 0, total: 0 };

const shortId = (id: string) => id.slice(0, 8);

function shortDate(iso: string | null): string {
  if (!iso) return "no date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "no date";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function lastUpdated(iso: string | null): string {
  if (!iso) return "nothing dated yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "nothing dated yet";
  if (d.toDateString() === new Date().toDateString()) return "today";
  return shortDate(iso);
}

function statusWord(status: string | null): string {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return "in use";
    case "review":
      return "being checked";
    case "superseded":
      return "replaced";
    case "binned":
      return "thrown out";
    default:
      return status ?? "unknown";
  }
}

function SourceChip({ row }: { row: MemoryRow }) {
  const COB = useCobLabel();
  const by = (row.created_by ?? "").toLowerCase();
  const seen = SEEN_GRADES.some((g) => by.includes(g));
  return (
    <span
      className={`chip ${seen ? "seen" : "told"}`}
      title={seen ? `${COB} checked this itself.` : `Someone told ${COB} this.`}
    >
      {seen ? "SEEN" : "TOLD"}
      {row.created_by ? ` ${DOT} ${row.created_by}` : ""}
    </span>
  );
}

type SortKey = "date" | "lane" | "category";

export function MemoryVault() {
  const composeToDock = useComposeToDock();
  const COB = useCobLabel();
  const { toast } = useToast();

  const [rows, setRows] = useState<MemoryRow[] | null>(null);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [err, setErr] = useState<string | null>(null);
  const [entities, setEntities] = useState<LaneEntity[]>([]);

  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [openRows, setOpenRows] = useState<string[]>([]);
  const [openLane, setOpenLane] = useState<string | null>(null);
  const [view, setView] = useState<HqView>(() => readView("memories"));

  const [pop, setPop] = useState<{
    target: LinkTarget;
    card: EntityCard | null;
    where: SearchHit[] | null;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const cardCache = useRef<Map<string, EntityCard>>(new Map());

  useEffect(() => {
    let live = true;
    const rpc = (fn: string, args?: Record<string, unknown>) =>
      (
        supabase as never as {
          rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc(fn, args);

    void Promise.all([rpc("hq_memory_read", { p_limit: 1000, p_offset: 0 }), rpc("hq_memory_counts")])
      .then(([list, c]) => {
        if (!live) return;
        if (list.error) throw new Error("memories_read_failed");
        setRows((list.data ?? []) as MemoryRow[]);
        setCounts({ ...EMPTY_COUNTS, ...((c.data ?? {}) as Partial<Counts>) });
      })
      .catch(() => live && setErr("We could not open your memories just now."));

    callWorld<{ rows: LaneEntity[] }>("entities")
      .then((d) => live && setEntities(d.rows ?? []))
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, []);

  const targets = useMemo<LinkTarget[]>(
    () => entities.map((e) => ({ id: e.id, name: e.name })),
    [entities],
  );

  const prefetch = useCallback((t: LinkTarget) => {
    if (cardCache.current.has(t.id)) return;
    callWorld<EntityCard>("entity_card", { entity_id: t.id })
      .then((d) => cardCache.current.set(t.id, d))
      .catch(() => undefined);
  }, []);

  const openPop = useCallback((t: LinkTarget) => {
    const cached = cardCache.current.get(t.id);
    setPop({ target: t, card: cached ?? null, where: null, loading: !cached, error: null });
    if (cached) return;
    callWorld<EntityCard>("entity_card", { entity_id: t.id })
      .then((d) => {
        cardCache.current.set(t.id, d);
        setPop((p) => (p && p.target.id === t.id ? { ...p, card: d, loading: false } : p));
      })
      .catch(() =>
        setPop((p) =>
          p && p.target.id === t.id
            ? { ...p, loading: false, error: "We could not open that record." }
            : p,
        ),
      );
  }, []);

  const loadWhere = useCallback((t: LinkTarget) => {
    callWorld<{ rows: SearchHit[] }>("entity_where", { entity_id: t.id })
      .then((d) =>
        setPop((p) => (p && p.target.id === t.id ? { ...p, where: d.rows ?? [] } : p)),
      )
      .catch(() => undefined);
  }, []);

  const Ilink = useCallback(
    (t: LinkTarget, key: string, matched: string) => (
      <button
        key={key}
        className="ilink"
        onMouseEnter={() => prefetch(t)}
        onTouchStart={() => prefetch(t)}
        onClick={() => openPop(t)}
      >
        {matched}
      </button>
    ),
    [openPop, prefetch],
  );

  const ask = useCallback(
    (row: MemoryRow) => {
      const message = [
        `Change request for a memory.`,
        `Lane: ${row.lane ?? "not filed to a lane"}.`,
        `Memory: ${row.title} (${row.id}).`,
        "What should change:",
      ].join("\n");
      // The dock is the only pen. The message lands in the composer, ready to send.
      composeToDock(message);
    },
    [composeToDock],
  );

  const list = rows ?? [];

  const lanes = useMemo(() => {
    const map = new Map<string, MemoryRow[]>();
    for (const r of list) {
      const key = r.lane ?? "Not filed to a lane";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [list]);

  const categories = useMemo(
    () => new Set(list.map((r) => r.category).filter(Boolean) as string[]),
    [list],
  );

  const freshest = useMemo(() => {
    const times = list
      .map((r) => r.updated_at ?? r.created_at)
      .filter(Boolean)
      .map((t) => new Date(t as string).getTime())
      .filter((t) => !Number.isNaN(t));
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  }, [list]);

  const clock = useMemo(
    () => loudestClock(list.flatMap((r) => datedLines(`${r.title}. ${r.body_md ?? ""}`))),
    [list],
  );

  const infobox = useMemo(() => {
    const out: Array<{ k: string; v: string; alert?: boolean }> = [];
    out.push({ k: "Memories", v: `${list.length} you can read now` });
    if (clock) {
      const away = daysAway(clock.date);
      out.push({
        k: "Coming up",
        v: `${clock.label}${away !== null ? ` ${DOT} ${away} ${away === 1 ? "day" : "days"} away` : ""}`,
        alert: true,
      });
    }
    out.push({ k: "Last updated", v: lastUpdated(freshest) });
    out.push({ k: "Groups", v: `${lanes.length} ${lanes.length === 1 ? "group" : "groups"}` });
    out.push({ k: "Kinds", v: categories.size ? `${categories.size} kinds of memory` : "none yet" });
    if (counts.review) out.push({ k: "Being checked", v: `${counts.review} waiting` });
    if (counts.superseded) out.push({ k: "Replaced", v: `${counts.superseded} older ones` });
    out.push({ k: "Where from", v: "your own COB" });
    return out.slice(0, INFOBOX_CEILING);
  }, [categories.size, clock, counts.review, counts.superseded, freshest, lanes.length, list.length]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = q
      ? list.filter((r) =>
          `${r.title} ${r.body_md ?? ""} ${r.lane ?? ""} ${r.category ?? ""}`
            .toLowerCase()
            .includes(q),
        )
      : list;
    const sorted = [...base];
    if (sort === "date") {
      sorted.sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      );
    } else if (sort === "lane") {
      sorted.sort((a, b) => (a.lane ?? "~").localeCompare(b.lane ?? "~"));
    } else {
      sorted.sort((a, b) => (a.category ?? "~").localeCompare(b.category ?? "~"));
    }
    return sorted;
  }, [filter, list, sort]);

  const toggleRow = (id: string) =>
    setOpenRows((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const Sortable = ({ label, k }: { label: string; k: SortKey }) => (
    <th>
      <button type="button" onClick={() => setSort(k)} title={`Sort by ${label.toLowerCase()}`}>
        {label}
        {sort === k ? " \u25BE" : ""}
      </button>
    </th>
  );

  return (
    <HqShell>
      <div className="wld">
        <div className="crumb">HQ {DOT} 03 {DOT} memories</div>
        <h1>Memories</h1>

        <div className="article">
          <div>
            <p className="lead">
              <b>These are the things {COB} remembers about you.</b> {DOT} Each one is a short
              note. They are grouped below. Open any line to read the whole thing. If something is
              wrong, tell {COB} and it will fix it.
            </p>

            {err && <p className="plain">{err}</p>}
            {!err && rows === null && <p className="plain">Opening your memories.</p>}
            {!err && rows !== null && list.length === 0 && (
              <p className="plain">
                Nothing here yet. {COB} adds memories as you work together.
              </p>
            )}

            {list.length > 0 && (
              <ViewSwitch
                view={view}
                onChange={(v) => {
                  setView(v);
                  writeView("memories", v);
                }}
                labels={{ folders: "Groups", grid: "Grid", list: "List" }}
              />
            )}

            {list.length > 0 && view === "grid" && (
              <div className="fgrid">
                {lanes.map(([lane, items], i) => (
                  <button
                    className="fcard"
                    key={lane}
                    onClick={() => {
                      setView("folders");
                      writeView("memories", "folders");
                      setOpenLane(lane);
                    }}
                    title="Open this group"
                  >
                    <span className="fn">Group {String(i + 1).padStart(2, "0")}</span>
                    <span className="ft">{lane}</span>
                    <span className="fm">
                      {items.length} {items.length === 1 ? "memory" : "memories"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {list.length > 0 && (
              <>
                {view === "folders" && (
                <>
                <div className="tock" title="Every group your memories are filed under.">
                  Table of contents {DOT} tap any line to open it in full
                </div>
                <div className="toc">
                  {lanes.map(([lane, items], i) => {
                    const isOpen = openLane === lane;
                    return (
                      <div key={lane}>
                        <button
                          className={`tline${isOpen ? " exp" : ""}`}
                          onClick={() => setOpenLane(isOpen ? null : lane)}
                          aria-expanded={isOpen}
                        >
                          <span className="tn">{String(i + 1).padStart(2, "0")}</span>
                          <span className="tt">{lane}</span>
                          <span className="dots" />
                          <span className="tm">
                            {isOpen ? "open \u25BE" : `${items.length} ${items.length === 1 ? "memory" : "memories"}`}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="expand">
                            {items.map((m) => (
                              <div key={m.id}>
                                <h4>{m.title}</h4>
                                <p>{linkify(m.body_md ?? "", targets, Ilink)}</p>
                                <div className="chips">
                                  {m.category && <span className="chip">{m.category}</span>}
                                  <span className="chip" title="How this memory stands right now.">
                                    {statusWord(m.status)}
                                  </span>
                                  <SourceChip row={m} />
                                  <span className="chip" title="Where this came from.">
                                    memory {DOT} {shortId(m.id)}
                                  </span>
                                </div>
                                <button className="ask" onClick={() => ask(m)}>
                                  Tell {COB} to change something here &rarr;
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                </>
                )}

                <div className="secname">Everything {COB} remembers</div>
                <div className="mtools">
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Type a word to find a memory"
                    aria-label="Find a memory"
                  />
                  <span className="cnt">
                    {filtered.length} of {list.length} shown
                  </span>
                </div>

                <div className="tscroll">
                  <table className="dtab">
                    <thead>
                      <tr>
                        <Sortable label="Date" k="date" />
                        <Sortable label="Group" k="lane" />
                        <Sortable label="Kind" k="category" />
                        <th>Memory</th>
                        <th>Where from</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 && (
                        <tr>
                          <td className="empty" colSpan={5}>
                            No memory has those words in it.
                          </td>
                        </tr>
                      )}
                      {filtered.map((m) => {
                        const isOpen = openRows.includes(m.id);
                        return (
                          <Fragment key={m.id}>
                            <tr className={isOpen ? "open" : undefined}>
                              <td className="d">{shortDate(m.created_at)}</td>
                              <td className="d">{m.lane ?? "\u2014"}</td>
                              <td className="d">{m.category ?? "\u2014"}</td>
                              <td>
                                <button
                                  className="rowbtn"
                                  onClick={() => toggleRow(m.id)}
                                  aria-expanded={isOpen}
                                  title="Open to read the whole memory"
                                >
                                  {m.title}
                                </button>
                              </td>
                              <td>
                                <SourceChip row={m} />
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="open">
                                <td className="body" colSpan={5}>
                                  <p>{linkify(m.body_md ?? "Nothing written down yet.", targets, Ilink)}</p>
                                  <div className="chips">
                                    <span className="chip" title="How this memory stands right now.">
                                      {statusWord(m.status)}
                                    </span>
                                    {m.confidence != null && (
                                      <span className="chip" title={`How sure ${COB} is about this.`}>
                                        {Math.round(Number(m.confidence) * 100)}% sure
                                      </span>
                                    )}
                                    <SourceChip row={m} />
                                    <span className="chip" title="Where this came from.">
                                      memory {DOT} {shortId(m.id)}
                                    </span>
                                  </div>
                                  <button className="ask" onClick={() => ask(m)}>
                                    Tell {COB} to change something here &rarr;
                                  </button>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div>
            <div className="infobox">
              <div className="ih">Memories</div>
              {infobox.map((r, i) => (
                <div className={`irow${r.alert ? " alert" : ""}`} key={i}>
                  <span className="k">{r.k}</span>
                  <span className="v">{r.v}</span>
                </div>
              ))}
            </div>

            {pop && (
              <div className="pop">
                <button className="popclose" onClick={() => setPop(null)} aria-label="Close">
                  &times;
                </button>
                <div className="pk">{pop.target.name}</div>
                {pop.loading && <div className="pv">Opening the record.</div>}
                {pop.error && <div className="pv">{pop.error}</div>}
                {pop.card && (
                  <div className="pv">
                    {pop.card.entity.etype}
                    {pop.card.entity.tag ? ` ${DOT} ${pop.card.entity.tag}` : ""} {DOT}{" "}
                    {pop.card.claim_count} {pop.card.claim_count === 1 ? "note" : "notes"} on file.
                    {pop.card.lead ? ` ${pop.card.lead}` : " Nothing written down yet."}
                  </div>
                )}
                {pop.card && pop.where === null && (
                  <button className="ask" onClick={() => loadWhere(pop.target)}>
                    Everywhere they show up &rarr;
                  </button>
                )}
                {pop.where !== null && (
                  <div className="pwhere">
                    {pop.where.length === 0 && <span className="loc">Only here so far.</span>}
                    {pop.where.map((h, i) => (
                      <a
                        key={`${h.rid}-${i}`}
                        href={`/hq/world#${h.slug ?? ""}/${sectionForRegister(h.register)}`}
                      >
                        <span className="loc">{h.lane ?? h.register}</span>
                        {h.title ?? h.rid}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </HqShell>
  );
}

export default MemoryVault;
