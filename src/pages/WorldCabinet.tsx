/** THE LANE DOSSIER CABINET · /hq/world
 *
 * Anatomy (unchanged, artifact v2): lanes are tabs in rows of four, back rows
 * peek, one giant folder is open beneath, the folder face is the table of
 * contents, every line expands in place.
 *
 * This turn adds, per artifacts v3 and v2.1:
 *  · the WIKI layout inside the folder — lead paragraph with inline entity
 *    links, a sticky right-rail infobox (hard ceiling of eight rows), a
 *    chronology table wherever the material carries dates, dense evidence in
 *    tables below the fold, and a pop-out record on the right for any link.
 *  · WORLD SEARCH above the tabs, served by the same server-side read path.
 *
 * Reads are CID-keyed server-side and read-only. This surface never writes:
 * editing is a chat handoff to the COB.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion, type Transition } from "framer-motion";

import { HqShell } from "@/components/hq/HqShell";
import { useToast } from "@/hooks/use-toast";
import {
  callWorld,
  composeChangeRequest,
  sectionForRegister,
  type EntityCard,
  type LaneDossierPayload,
  type LaneRow,
  type SearchHit,
} from "@/lib/world-lanes";
import {
  datedLines,
  daysAway,
  leadSentences,
  linkify,
  loudestClock,
  type DatedLine,
  type LinkTarget,
} from "@/lib/world-wiki";
import "@/hq-next/styles/hq-lanes.css";

const DOT = "\u00b7";
const EASE: Transition["ease"] = [0.22, 1, 0.36, 1];
const SEEN_GRADES = ["seen", "own-probe", "document", "system-of-record", "verified"];
const PER_ROW = 4;
const INFOBOX_CEILING = 8;

const shortId = (id: string) => id.slice(0, 8);
const num = (n: number) => String(n).padStart(2, "0");

function freshness(iso: string | null): string {
  if (!iso) return "no dated material yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "no dated material yet";
  if (d.toDateString() === new Date().toDateString()) return "updated today";
  return `updated ${d.getMonth() + 1}/${d.getDate()}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return "undated";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "undated";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** world_search_v1 marks its hits with **double asterisks**. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <span className="snip">
      {parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}
    </span>
  );
}

function GradeChip({ grade }: { grade: string | null | undefined }) {
  const g = String(grade ?? "").toLowerCase();
  if (!g) return null;
  const seen = SEEN_GRADES.includes(g);
  return (
    <span
      className={`chip ${seen ? "seen" : "told"}`}
      title={seen ? "Your COB checked this itself." : "Someone told your COB this."}
    >
      {seen ? "SEEN" : "TOLD"} {DOT} {g}
    </span>
  );
}

function Chronology({ lines, matter }: { lines: DatedLine[]; matter: string }) {
  if (!lines.length) return null;
  return (
    <table className="wtab">
      <thead>
        <tr>
          <th>When</th>
          <th>What happened</th>
          <th>Matter or source</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => {
          const away = daysAway(l.date);
          const due = away !== null && away >= 0;
          return (
            <tr key={i} className={due ? "due" : undefined}>
              <td className="d">
                {l.label}
                {due && ` ${DOT} ${away} ${away === 1 ? "day" : "days"}`}
              </td>
              <td>{due ? <b>{l.sentence}</b> : l.sentence}</td>
              <td className="d">{matter}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type TocItem = {
  key: string;
  n: string;
  title: string;
  meta: string;
  render: () => JSX.Element;
};

type PopState = {
  target: LinkTarget;
  card: EntityCard | null;
  where: SearchHit[] | null;
  loading: boolean;
  error: string | null;
};

export function WorldCabinet() {
  const { toast } = useToast();
  const reduced = useReducedMotion();
  const [rows, setRows] = useState<LaneRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [doss, setDoss] = useState<LaneDossierPayload | null>(null);
  const [dossErr, setDossErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string[]>([]);

  // World search.
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const clearSearch = useCallback(() => {
    setQ("");
    setHits(null);
    setSearching(false);
    searchRef.current?.focus();
  }, []);


  // The pop-out record, right rail.
  const [pop, setPop] = useState<PopState | null>(null);
  const cardCache = useRef<Map<string, EntityCard>>(new Map());
  const whereCache = useRef<Map<string, SearchHit[]>>(new Map());

  // The cabinet.
  useEffect(() => {
    let live = true;
    callWorld<{ rows: LaneRow[] }>("lanes")
      .then((d) => {
        if (!live) return;
        const list = d.rows ?? [];
        setRows(list);
        const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
        const [slug, section] = hash.split("/");
        const found = list.find((r) => r.slug === slug);
        setActive(found?.slug ?? list[0]?.slug ?? null);
        if (found && section) setOpen([section]);
      })
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, []);

  // The pulled folder.
  useEffect(() => {
    if (!active) return;
    let live = true;
    setDoss(null);
    setDossErr(null);
    setPop(null);
    callWorld<LaneDossierPayload>("lane", { slug: active })
      .then((d) => live && setDoss(d))
      .catch((e: Error) => live && setDossErr(e.message));
    return () => {
      live = false;
    };
  }, [active]);

  // Debounced as-you-type search, on the same server-derived read path.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(() => {
      let live = true;
      callWorld<{ rows: SearchHit[] }>("search", { q: term, limit: 20 })
        .then((d) => live && setHits(d.rows ?? []))
        .catch(() => live && setHits([]))
        .finally(() => live && setSearching(false));
      return () => {
        live = false;
      };
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const prefetchEntity = useCallback((target: LinkTarget) => {
    if (cardCache.current.has(target.id)) return;
    callWorld<EntityCard>("entity_card", { entity_id: target.id })
      .then((d) => cardCache.current.set(target.id, d))
      .catch(() => undefined);
  }, []);

  const openPop = useCallback((target: LinkTarget) => {
    const cached = cardCache.current.get(target.id);
    setPop({ target, card: cached ?? null, where: whereCache.current.get(target.id) ?? null, loading: !cached, error: null });
    if (cached) return;
    callWorld<EntityCard>("entity_card", { entity_id: target.id })
      .then((d) => {
        cardCache.current.set(target.id, d);
        setPop((p) => (p && p.target.id === target.id ? { ...p, card: d, loading: false } : p));
      })
      .catch((e: Error) =>
        setPop((p) => (p && p.target.id === target.id ? { ...p, loading: false, error: e.message } : p)),
      );
  }, []);

  const loadWhere = useCallback((target: LinkTarget) => {
    const cached = whereCache.current.get(target.id);
    if (cached) {
      setPop((p) => (p && p.target.id === target.id ? { ...p, where: cached } : p));
      return;
    }
    callWorld<{ rows: SearchHit[] }>("entity_where", { entity_id: target.id })
      .then((d) => {
        whereCache.current.set(target.id, d.rows ?? []);
        setPop((p) => (p && p.target.id === target.id ? { ...p, where: d.rows ?? [] } : p));
      })
      .catch(() => undefined);
  }, []);

  const ask = useCallback(
    async (section: string, recordIds: string[]) => {
      if (!doss) return;
      const message = composeChangeRequest({ lane: doss.lane, section, recordIds });
      try {
        await navigator.clipboard.writeText(message);
        toast({
          title: "Copied for your COB",
          description: "Paste this into your COB conversation and say what should change.",
        });
      } catch {
        toast({ title: "Copy it manually", description: message });
      }
    },
    [doss, toast],
  );

  const Ask = useCallback(
    ({ section, ids }: { section: string; ids: string[] }) => (
      <button className="ask" onClick={() => ask(section, ids)}>
        Tell your COB to change something here &rarr;
      </button>
    ),
    [ask],
  );

  const toggle = (key: string) => {
    setOpen((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (!prev.includes(key) && active) {
        window.history.replaceState(null, "", `#${active}/${key}`);
      }
      return next;
    });
  };

  const goto = (slug: string | null, section: string) => {
    if (!slug) return;
    if (slug !== active) {
      setActive(slug);
      setOpen([section]);
    } else {
      setOpen((prev) => (prev.includes(section) ? prev : [...prev, section]));
    }
    window.history.replaceState(null, "", `#${slug}/${section}`);
    setHits(null);
  };

  const lanes = rows ?? [];
  const activeIndex = lanes.findIndex((r) => r.slug === active);

  const chunks: LaneRow[][] = [];
  for (let i = 0; i < lanes.length; i += PER_ROW) chunks.push(lanes.slice(i, i + PER_ROW));
  const frontRow = activeIndex >= 0 ? Math.floor(activeIndex / PER_ROW) : chunks.length - 1;

  const targets = useMemo<LinkTarget[]>(
    () => (doss?.entities ?? []).map((e) => ({ id: e.id, name: e.name })),
    [doss],
  );

  const Ilink = useCallback(
    (target: LinkTarget, key: string) => (
      <button
        key={key}
        className="ilink"
        onMouseEnter={() => prefetchEntity(target)}
        onTouchStart={() => prefetchEntity(target)}
        onClick={() => openPop(target)}
      >
        {target.name}
      </button>
    ),
    [openPop, prefetchEntity],
  );

  /** Every dated sentence across the lane's own material. */
  const laneDates = useMemo<DatedLine[]>(() => {
    if (!doss) return [];
    const blocks = [
      ...(doss.narrative?.sections ?? []).map((s) => s.body),
      ...doss.memories.map((m) => `${m.title}. ${m.body_md}`),
      ...doss.threads.map((t) => `${t.title}. ${t.trigger ?? ""}`),
    ];
    return blocks.flatMap((b) => datedLines(b));
  }, [doss]);

  const clock = useMemo(() => loudestClock(laneDates), [laneDates]);

  const activeRow = activeIndex >= 0 ? lanes[activeIndex] : null;

  /** Infobox facts, derived only. Hard ceiling of eight rows; the rest live in
   *  the tables below the fold. */
  const infobox = useMemo(() => {
    if (!doss || !activeRow) return [] as Array<{ k: string; v: JSX.Element | string; alert?: boolean }>;
    const out: Array<{ k: string; v: JSX.Element | string; alert?: boolean }> = [];

    out.push({
      k: "Records",
      v: (
        <>
          <b>{activeRow.entry_count}</b> on the record
        </>
      ),
    });

    if (clock) {
      const away = daysAway(clock.date);
      out.push({
        k: "Next clock",
        v: `${clock.label}${away !== null ? ` ${DOT} ${away} ${away === 1 ? "day" : "days"}` : ""}`,
        alert: true,
      });
    }

    // Densest subject: the entity named most often in this lane's material.
    const haystack = [
      doss.narrative?.sections.map((s) => s.body).join(" ") ?? "",
      ...doss.memories.map((m) => `${m.title} ${m.body_md}`),
    ]
      .join(" ")
      .toLowerCase();
    const counted = doss.entities
      .map((e) => ({ e, n: haystack.split(e.name.toLowerCase()).length - 1 }))
      .sort((a, b) => b.n - a.n);
    if (counted[0] && counted[0].n > 0) {
      out.push({
        k: "Densest",
        v: `${counted[0].e.name} ${DOT} ${counted[0].n} ${counted[0].n === 1 ? "mention" : "mentions"}`,
      });
    }

    const people = doss.entities.filter((e) => /person|people|human|contact/i.test(e.etype)).slice(0, 3);
    if (people.length) {
      out.push({ k: "Key people", v: people.map((p) => p.name).join(` ${DOT} `) });
    }

    if (activeRow.open_thread_count !== null) {
      out.push({
        k: "Still waiting on",
        v: activeRow.open_thread_count
          ? `${activeRow.open_thread_count} open`
          : "nothing open",
      });
    }

    out.push({ k: "Last updated", v: freshness(activeRow.updated_at) });

    if (doss.narrative?.grade) out.push({ k: "How we know", v: doss.narrative.grade });

    out.push({ k: "Where from", v: "your own records" });

    return out.slice(0, INFOBOX_CEILING);
  }, [activeRow, clock, doss]);

  const lead = useMemo(() => {
    const first = doss?.narrative?.sections?.[0]?.body ?? "";
    return leadSentences(first, 4);
  }, [doss]);

  const toc = useMemo<TocItem[]>(() => {
    if (!doss) return [];
    const items: TocItem[] = [];
    const sections = doss.narrative?.sections ?? [];
    const narrativeIds = doss.narrative ? [doss.narrative.id] : [];

    sections.forEach((s, i) => {
      const key = `s-${i + 1}`;
      const dates = datedLines(s.body);
      items.push({
        key,
        n: `\u00a7 ${i + 1}`,
        title: s.heading,
        meta: `${s.body.trim().split(/\s+/).length} words`,
        render: () => (
          <>
            <p>{linkify(s.body, targets, Ilink)}</p>
            {dates.length > 0 && (
              <>
                <div className="secname">Chronology {DOT} read from this section&rsquo;s own material</div>
                <Chronology lines={dates} matter={doss.lane} />
              </>
            )}
            <div className="chips">
              <GradeChip grade={doss.narrative?.grade} />
              {(doss.narrative?.cites ?? []).slice(0, 8).map((c, ci) => (
                <span className="chip" key={ci}>
                  source {DOT} {typeof c === "string" ? shortId(c) : JSON.stringify(c).slice(0, 24)}
                </span>
              ))}
            </div>
            <Ask section={s.heading} ids={narrativeIds} />
          </>
        ),
      });
    });

    const base = sections.length;

    items.push({
      key: "entities",
      n: `\u00a7 ${base + 1}`,
      title: "People & entities",
      meta: doss.entities.length
        ? doss.entities.slice(0, 3).map((e) => e.name).join(` ${DOT} `)
        : "none on the record yet",
      render: () =>
        doss.entities.length === 0 ? (
          <p>No people or organisations on the record are named in this lane&rsquo;s material yet.</p>
        ) : (
          <>
            <table className="wtab">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Standing</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {doss.entities.map((e) => (
                  <tr key={e.id}>
                    <td>{Ilink({ id: e.id, name: e.name }, e.id)}</td>
                    <td className="d">{e.etype}</td>
                    <td className="d">{[e.status, e.sensitivity].filter(Boolean).join(` ${DOT} `) || "\u2014"}</td>
                    <td className="d">{shortId(e.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Ask section="People & entities" ids={doss.entities.map((e) => e.id)} />
          </>
        ),
    });

    items.push({
      key: "threads",
      n: `\u00a7 ${base + 2}`,
      title: "Still waiting on",
      meta: doss.threads.length ? `${doss.threads.length} open` : "nothing open",
      render: () =>
        doss.threads.length === 0 ? (
          <p>
            Nothing is waiting on this group right now.
          </p>
        ) : (
          <>
            {doss.threads.map((t) => (
              <div key={t.id}>
                <h4>{t.title}</h4>
                {t.trigger && <p>{linkify(t.trigger, targets, Ilink)}</p>}
                <div className="chips">
                  <span className="chip open">open</span>
                  {t.owner && <span className="chip">{t.owner}</span>}
                  {t.state && <span className="chip">{t.state}</span>}
                  <span className="chip">thread {DOT} {shortId(t.id)}</span>
                </div>
                <Ask section={`Open thread: ${t.title}`} ids={[t.id]} />
              </div>
            ))}
          </>
        ),
    });

    items.push({
      key: "records",
      n: `\u00a7 ${base + 3}`,
      title: "Every record, in full",
      meta: doss.memories.length
        ? `${doss.memories.length} ${doss.memories.length === 1 ? "entry" : "entries"} verbatim`
        : "no entries yet",
      render: () =>
        doss.memories.length === 0 ? (
          <p>No entries are recorded against this lane yet.</p>
        ) : (
          <>
            {doss.memories.map((m) => (
              <div key={m.id} id={`m-${m.id}`}>
                <h4>{m.title}</h4>
                <p>{linkify(m.body_md, targets, Ilink)}</p>
                <div className="chips">
                  {m.category && <span className="chip">{m.category}</span>}
                  {m.status && <span className="chip">{m.status}</span>}
                  {m.created_by && (
                    <span className="chip told" title="Someone told your COB this.">
                      TOLD {DOT} {m.created_by}
                    </span>
                  )}
                  <span className="chip">source {DOT} memory {shortId(m.id)}</span>
                </div>
                <Ask section={m.title} ids={[m.id]} />
              </div>
            ))}
          </>
        ),
    });

    items.push({
      key: "storyline",
      n: `\u00a7 ${base + 4}`,
      title: "The storyline",
      meta: doss.narrative ? "how this got here" : "not written yet",
      render: () =>
        !doss.narrative ? (
          <p>
            Your COB has not written the story of this group yet. The notes above are what it has so far.
          </p>
        ) : (
          <>
            <h4>{doss.narrative.title}</h4>
            {(doss.narrative.sections ?? []).map((s, i) => (
              <p key={i}>{linkify(s.body, targets, Ilink)}</p>
            ))}
            <div className="chips">
              <GradeChip grade={doss.narrative.grade} />
              <span className="chip" title="Where this came from.">story {DOT} {shortId(doss.narrative.id)}</span>
            </div>
            <Ask section="The storyline" ids={narrativeIds} />
          </>
        ),
    });

    return items;
  }, [doss, Ask, Ilink, targets]);

  const Tab = ({ row, n }: { row: LaneRow; n: number }) => (
    <button
      className={`tab${row.slug === active ? " on" : ""}`}
      onClick={() => {
        setActive(row.slug);
        setOpen([]);
        window.history.replaceState(null, "", `#${row.slug}`);
      }}
      title={row.label}
    >
      <span className="no">{num(n)}</span>
      {row.label}
    </button>
  );


  // "in N places" · the same subject reached from more than one register or lane.
  const placeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of hits ?? []) {
      const k = (h.title ?? h.rid).toLowerCase().trim();
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [hits]);

  return (
    <HqShell>
      <div className="wld">
        <div className="crumb">HQ {DOT} 02 {DOT} the world</div>
        <h1>The World</h1>

        <div className="wsearch">
          <div className="wsbar">
            <span className="gl" aria-hidden="true">&#8981;</span>
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  clearSearch();
                }
              }}
              placeholder="Ask your world a question, or name anyone in it"
              aria-label="Search the world"
            />
            {q.length > 0 && (
              <button
                type="button"
                className="wsclear"
                onClick={clearSearch}
                title="Clear search (Esc)"
                aria-label="Clear search"
              >
                &times;
              </button>
            )}
            <span className="tagline">{searching ? "SEARCHING" : "SEARCH THE WORLD"}</span>
          </div>

          {hits !== null && (
            <div className="wsres">
              {hits.length === 0 && !searching && (
                <div className="wsempty">Nothing in your world matches that yet.</div>
              )}
              {hits.map((h, i) => {
                const section = sectionForRegister(h.register);
                const places = placeCounts.get((h.title ?? h.rid).toLowerCase().trim()) ?? 1;
                return (
                  <button className="wsrow" key={`${h.register}-${h.rid}-${i}`} onClick={() => goto(h.slug, section)}>
                    <span className="loc">
                      {h.lane ?? h.register} {DOT} {h.register}
                    </span>
                    <Snippet text={h.snippet ?? h.title ?? ""} />
                    {places > 1 && <span className="many">in {places} places</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {err && <div className="plain">We could not open your world just now.</div>}
        {!err && rows === null && <div className="plain">Opening your world.</div>}
        {!err && rows !== null && lanes.length === 0 && (
          <div className="plain">
            No lanes have taken shape yet. The first one appears here the moment your COB records material against
            it.
          </div>
        )}

        {lanes.length > 0 && (
          <>
            <div className="tabs">
              {chunks.map((chunk, ri) =>
                ri === frontRow ? null : (
                  <div className="trow back" key={`r-${ri}`}>
                    {chunk.map((row) => (
                      <Tab key={row.slug} row={row} n={lanes.indexOf(row) + 1} />
                    ))}
                    
                  </div>
                ),
              )}
              <div className="trow front">
                {(chunks[frontRow] ?? []).map((row) => (
                  <Tab key={row.slug} row={row} n={lanes.indexOf(row) + 1} />
                ))}
                
              </div>
            </div>

            <div className="stackwrap">
              <div className="peek1" />
              <div className="peek2" />
              <div className="doss">
                <div className="strip">
                  <span>
                    Dossier &#8470; <span style={{ color: "var(--ink)" }}>{num(activeIndex + 1)}</span> /{" "}
                    {num(lanes.length)} {DOT} {activeRow?.label ?? ""}
                  </span>
                  <b>For Principal {DOT} Confidential</b>
                </div>
                <motion.div
                  className="dbody"
                  key={active ?? "none"}
                  initial={reduced ? false : { opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: reduced ? 0 : 0.4, ease: EASE }}
                >
                  <div className="kick">
                    {num(activeIndex + 1)} {DOT} {activeRow?.label ?? ""}
                  </div>
                  <div className="rule" />
                  <div className="dtitle">The {activeRow?.label ?? ""} lane</div>
                  <div className="dsub">
                    {activeRow && (
                      <>
                        {activeRow.entry_count} {activeRow.entry_count === 1 ? "record" : "records"}
                        {activeRow.open_thread_count !== null && (
                          <>
                            {" "}
                            {DOT} waiting on {activeRow.open_thread_count}{" "}
                            {activeRow.open_thread_count === 1 ? "thing" : "things"}
                          </>
                        )}{" "}
                        {DOT} {freshness(activeRow.updated_at)} {DOT}{" "}
                        {activeRow.has_narrative
                          ? "your COB keeps this story and notes where each part came from"
                          : "no story written yet"}
                      </>
                    )}
                  </div>

                  {dossErr && <p className="plain">We could not open this folder just now.</p>}
                  {!dossErr && !doss && <p className="plain">Opening the folder.</p>}

                  {doss && (
                    <div className="article">
                      <div>
                        {lead ? (
                          <p className="lead">
                            <b>{doss.lane}</b> {DOT} {linkify(lead, targets, Ilink)}
                          </p>
                        ) : (
                          <p className="lead">
                            <b>{doss.lane}</b> {DOT} no story has been written yet. Below are the notes
                            themselves.
                          </p>
                        )}

                        <div className="tock">Table of contents {DOT} tap any line to open it in full</div>
                        <div className="toc">
                          {toc.map((item) => {
                            const isOpen = open.includes(item.key);
                            return (
                              <div key={item.key}>
                                <button
                                  className={`tline${isOpen ? " exp" : ""}`}
                                  onClick={() => toggle(item.key)}
                                  aria-expanded={isOpen}
                                >
                                  <span className="tn">{item.n}</span>
                                  <span className="tt">{item.title}</span>
                                  <span className="dots" />
                                  <span className="tm">{isOpen ? "expanded \u25BE" : item.meta}</span>
                                </button>
                                {isOpen && <div className="expand">{item.render()}</div>}
                              </div>
                            );
                          })}
                        </div>

                        {doss.memories.length > 0 && (
                          <>
                            <div className="secname">
                              Evidence {DOT} every record in this lane, at a glance
                            </div>
                            <table className="wtab">
                              <thead>
                                <tr>
                                  <th>Recorded</th>
                                  <th>Record</th>
                                  <th>Standing</th>
                                </tr>
                              </thead>
                              <tbody>
                                {doss.memories.map((m) => (
                                  <tr key={m.id}>
                                    <td className="d">{shortDate(m.updated_at ?? m.created_at)}</td>
                                    <td>
                                      <button className="ilink" onClick={() => toggle("records")}>
                                        {m.title}
                                      </button>
                                    </td>
                                    <td className="d">
                                      {[m.category, m.status].filter(Boolean).join(` ${DOT} `) || "\u2014"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}
                      </div>

                      <div>
                        <div className="infobox">
                          <div className="ih">{doss.lane}</div>
                          {infobox.map((r, i) => (
                            <div className={`irow${r.alert ? " alert" : ""}`} key={i}>
                              <span className="k">{r.k}</span>
                              <span className="v">{r.v}</span>
                            </div>
                          ))}
                        </div>

                        {pop && (
                          <div className="pop">
                            <button className="popclose" onClick={() => setPop(null)} aria-label="Close pop-out">
                              &times;
                            </button>
                            <div className="pk">Pop-out {DOT} {pop.target.name}</div>
                            {pop.loading && <div className="pv">Reading the record.</div>}
                            {pop.error && <div className="pv">That record could not be read: {pop.error}</div>}
                            {pop.card && (
                              <div className="pv">
                                {pop.card.entity.etype}
                                {pop.card.entity.tag ? ` ${DOT} ${pop.card.entity.tag}` : ""} {DOT}{" "}
                                {pop.card.claim_count} {pop.card.claim_count === 1 ? "claim" : "claims"} on record.
                                {pop.card.lead ? ` ${pop.card.lead}` : " No claim text recorded yet."}
                              </div>
                            )}
                            {pop.card && pop.where === null && (
                              <button className="ask" onClick={() => loadWhere(pop.target)}>
                                Everywhere they show up &rarr;
                              </button>
                            )}
                            {pop.where !== null && (
                              <div className="pwhere">
                                {pop.where.length === 0 && (
                                  <span className="loc">Only in this lane so far.</span>
                                )}
                                {pop.where.map((h, i) => (
                                  <button
                                    key={`${h.rid}-${i}`}
                                    onClick={() => goto(h.slug, sectionForRegister(h.register))}
                                  >
                                    <span className="loc">
                                      {h.lane ?? h.register} {DOT} {h.register}
                                    </span>
                                    {h.title ?? h.rid}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            </div>
          </>
        )}

      </div>
    </HqShell>
  );
}

export default WorldCabinet;
