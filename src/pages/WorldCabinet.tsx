/** THE LANE DOSSIER CABINET · /hq/world · design v4
 *
 * Anatomy: lanes are tabs of a fixed width in rows of four, back rows peek, one
 * giant folder is open beneath, and the folder face carries, in order:
 *   · IN SHORT              a short synopsis of the whole folder
 *   · WHAT YOUR COB CONCLUDES  numbered conclusions, each with its reasoning,
 *                              how sure your COB is, and the records behind it
 *   · WHAT YOUR COB RECOMMENDS sequenced next moves
 *   · TABLE OF CONTENTS     leader dots, one line per group of details
 *   · THE DETAILS           every fact, grouped by theme, dates in the margin
 *
 * The read (synopsis, conclusions, recommendations) is written and stored by
 * the COB, never computed here. When a folder has no read yet, the page says so
 * plainly. Reads are server-side and keyed to the signed-in principal. This
 * surface never writes: editing is a chat handoff to the COB.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion, type Transition } from "framer-motion";

import { HqShell } from "@/components/hq/HqShell";
import { useToast } from "@/hooks/use-toast";
import {
  callWorld,
  composeChangeRequest,
  sectionForRegister,
  sourceLine,
  type CobRead,
  type LaneDossierPayload,
  type LaneRow,
  type SearchHit,
} from "@/lib/world-lanes";
import {
  datedLines,
  daysAway,
  humanDate,
  leadSentences,
  linkify,
  loudestClock,
  type DatedLine,
  type LinkTarget,
} from "@/lib/world-wiki";
import { ViewSwitch } from "@/components/hq/ViewSwitch";
import { heatClass, heatTitle, heatWord, readView, writeView, type HqView } from "@/lib/world-views";
import "@/hq-next/styles/hq-lanes.css";

const DOT = "\u00b7";
const EASE: Transition["ease"] = [0.22, 1, 0.36, 1];
const PER_ROW = 5;
const INFOBOX_CEILING = 8;

const shortId = (id: string) => id.slice(0, 8);
const num = (n: number) => String(n).padStart(2, "0");

function freshness(iso: string | null): string {
  if (!iso) return "nothing dated yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "nothing dated yet";
  if (d.toDateString() === new Date().toDateString()) return "updated today";
  return `updated ${humanDate(iso)}`;
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

const CONFIDENCE_COPY: Record<string, string> = {
  high: "Very sure",
  medium: "Fairly sure",
  low: "Not very sure",
};

type Fact = {
  key: string;
  date: string;
  late?: boolean;
  body: React.ReactNode;
  source: string;
};

type DetailGroup = {
  key: string;
  title: string;
  summary: string;
  meta: string;
  ids: string[];
  facts: Fact[];
  table?: React.ReactNode;
  empty?: string;
};

export function WorldCabinet() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [rows, setRows] = useState<LaneRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [doss, setDoss] = useState<(LaneDossierPayload & { read?: CobRead | null }) | null>(null);
  const [dossErr, setDossErr] = useState<string | null>(null);

  // World search.
  const [view, setView] = useState<HqView>(() => readView("world"));
  const [listSort, setListSort] = useState<"heat" | "folder" | "holds" | "people" | "touched">("heat");
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

  // The cabinet.
  useEffect(() => {
    let live = true;
    callWorld<{ rows: LaneRow[] }>("lanes")
      .then((d) => {
        if (!live) return;
        const list = d.rows ?? [];
        setRows(list);
        const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
        const [slug] = hash.split("/");
        const found = list.find((r) => r.slug === slug);
        setActive(found?.slug ?? list[0]?.slug ?? null);
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
    callWorld<LaneDossierPayload & { read?: CobRead | null }>("lane", { slug: active })
      .then((d) => live && setDoss(d))
      .catch((e: Error) => live && setDossErr(e.message));
    return () => {
      live = false;
    };
  }, [active]);

  // Debounced as-you-type search, on the same server-side read path.
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

  const openBrief = useCallback((id: string) => navigate(`/hq/world/brief/${id}`), [navigate]);

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

  const goto = (slug: string | null, section: string) => {
    if (!slug) return;
    if (slug !== active) setActive(slug);
    window.history.replaceState(null, "", `#${slug}/${section}`);
    setHits(null);
    window.setTimeout(() => {
      document.getElementById(`g-${section}`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }, 350);
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
      <button key={key} className="ilink" onClick={() => openBrief(target.id)} title={`Open the brief on ${target.name}`}>
        {target.name}
      </button>
    ),
    [openBrief],
  );

  /** Every dated sentence across the folder's own material. */
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

  /** Infobox facts, read from the folder only. Hard ceiling of eight rows. */
  const infobox = useMemo(() => {
    if (!doss || !activeRow) return [] as Array<{ k: string; v: JSX.Element | string; alert?: boolean }>;
    const out: Array<{ k: string; v: JSX.Element | string; alert?: boolean }> = [];

    out.push({ k: "Notes on file", v: <><b>{activeRow.entry_count}</b> written down</> });

    if (clock) {
      const away = daysAway(clock.date);
      out.push({
        k: "Next clock",
        v: `${clock.label}${away !== null ? ` ${DOT} ${away} ${away === 1 ? "day" : "days"}` : ""}`,
        alert: true,
      });
    }

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
        k: "Comes up most",
        v: `${counted[0].e.name} ${DOT} ${counted[0].n} ${counted[0].n === 1 ? "time" : "times"}`,
      });
    }

    const people = doss.entities.filter((e) => /person|people|human|contact/i.test(e.etype)).slice(0, 3);
    if (people.length) out.push({ k: "Key people", v: people.map((p) => p.name).join(` ${DOT} `) });

    if (activeRow.open_thread_count !== null) {
      out.push({
        k: "Still waiting on",
        v: activeRow.open_thread_count ? `${activeRow.open_thread_count} open` : "nothing open",
      });
    }

    out.push({ k: "Last updated", v: freshness(activeRow.updated_at) });
    if (doss.read?.written_at) out.push({ k: "Read written", v: humanDate(doss.read.written_at) });
    out.push({ k: "Where from", v: "your own records" });

    return out.slice(0, INFOBOX_CEILING);
  }, [activeRow, clock, doss]);

  /** THE DETAILS · every fact, grouped by theme, never a flat list. */
  const groups = useMemo<DetailGroup[]>(() => {
    if (!doss) return [];
    const out: DetailGroup[] = [];

    (doss.narrative?.sections ?? []).forEach((s, i) => {
      const dated = datedLines(s.body);
      out.push({
        key: `s-${i + 1}`,
        title: s.heading,
        summary: leadSentences(s.body, 1) || "Written up by your COB from the notes in this folder.",
        meta: `${s.body.trim().split(/\s+/).length} words`,
        ids: doss.narrative ? [doss.narrative.id] : [],
        facts: dated.map((l, li) => {
          const away = daysAway(l.date);
          return {
            key: `${i}-${li}`,
            date: l.label,
            late: away !== null && away >= 0,
            body: linkify(l.sentence, targets, Ilink),
            source: sourceLine(doss.narrative?.grade),
          };
        }),
        table: (
          <p className="inshort" style={{ marginTop: 12 }}>
            {linkify(s.body, targets, Ilink)}
          </p>
        ),
      });
    });

    // Notes, grouped by the kind of note they are.
    const byCategory = new Map<string, typeof doss.memories>();
    for (const m of doss.memories) {
      const key = (m.category ?? "General notes").trim() || "General notes";
      byCategory.set(key, [...(byCategory.get(key) ?? []), m]);
    }
    Array.from(byCategory.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([category, list]) => {
        out.push({
          key: `c-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          title: category,
          summary: `${list.length} ${list.length === 1 ? "note" : "notes"} of this kind, newest first.`,
          meta: `${list.length} ${list.length === 1 ? "note" : "notes"}`,
          ids: list.map((m) => m.id),
          facts: list.map((m) => ({
            key: m.id,
            date: humanDate(m.updated_at ?? m.created_at, true),
            body: (
              <>
                <b>{m.title}</b>. {linkify(m.body_md, targets, Ilink)}
              </>
            ),
            source: sourceLine(null, m.created_by),
          })),
        });
      });

    if (doss.entities.length) {
      out.push({
        key: "people",
        title: "People and companies",
        summary: "Everyone and every company named in this folder.",
        meta: `${doss.entities.length} named`,
        ids: doss.entities.map((e) => e.id),
        facts: [],
        table: (
          <table className="wtab">
            <thead>
              <tr>
                <th>Name</th>
                <th>What they are</th>
                <th>Where they stand</th>
              </tr>
            </thead>
            <tbody>
              {doss.entities.map((e) => (
                <tr key={e.id}>
                  <td>
                    <button className="ilink" onClick={() => openBrief(e.id)}>
                      {e.name}
                    </button>
                  </td>
                  <td className="d">{e.etype}</td>
                  <td className="d">{[e.status, e.sensitivity].filter(Boolean).join(` ${DOT} `) || "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ),
      });
    }

    out.push({
      key: "waiting",
      title: "Still waiting on",
      summary: "Things that are open and have not come back yet.",
      meta: doss.threads.length ? `${doss.threads.length} open` : "nothing open",
      ids: doss.threads.map((t) => t.id),
      facts: [],
      empty: doss.threads.length ? undefined : "Nothing is waiting on this folder right now.",
      table: doss.threads.length ? (
        <table className="wtab">
          <thead>
            <tr>
              <th>Last touched</th>
              <th>What we are waiting on</th>
              <th>Whose move</th>
            </tr>
          </thead>
          <tbody>
            {doss.threads.map((t) => (
              <tr key={t.id}>
                <td className="d">{humanDate(t.updated_at)}</td>
                <td>
                  <b>{t.title}</b>
                  {t.trigger ? <> {DOT} {linkify(t.trigger, targets, Ilink)}</> : null}
                </td>
                <td className="d">{t.owner ?? "not said"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : undefined,
    });

    return out;
  }, [doss, Ilink, openBrief, targets]);

  const Fillers = ({ count, k }: { count: number; k: string }) => (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span className="tab fill" key={`${k}-f${i}`} aria-hidden="true">
          &mdash;
        </span>
      ))}
    </>
  );

  const Tab = ({ row, n }: { row: LaneRow; n: number }) => (
    <button
      className={`tab${row.slug === active ? " on" : ""}`}
      onClick={() => {
        setActive(row.slug);
        window.history.replaceState(null, "", `#${row.slug}`);
      }}
      title={row.label}
    >
      <span className="no">{num(n)}</span>
      {row.label}
    </button>
  );

  // "in N places" · the same subject reached from more than one place.
  const placeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of hits ?? []) {
      const k = (h.title ?? h.rid).toLowerCase().trim();
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [hits]);

  const read = doss?.read ?? null;

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
            No folders have taken shape yet. The first one appears here the moment your COB writes something down.
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
                    <Fillers count={PER_ROW - chunk.length} k={`r-${ri}`} />
                  </div>
                ),
              )}
              <div className="trow front">
                {(chunks[frontRow] ?? []).map((row) => (
                  <Tab key={row.slug} row={row} n={lanes.indexOf(row) + 1} />
                ))}
                <Fillers count={PER_ROW - (chunks[frontRow] ?? []).length} k="front" />
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
                  <div className="dtitle">The {activeRow?.label ?? ""} folder</div>
                  <div className="dsub">
                    {activeRow && (
                      <>
                        {activeRow.entry_count} {activeRow.entry_count === 1 ? "note" : "notes"}
                        {activeRow.open_thread_count !== null && (
                          <>
                            {" "}
                            {DOT} waiting on {activeRow.open_thread_count}{" "}
                            {activeRow.open_thread_count === 1 ? "thing" : "things"}
                          </>
                        )}{" "}
                        {DOT} {freshness(activeRow.updated_at)}
                      </>
                    )}
                  </div>

                  {dossErr && <p className="plain">We could not open this folder just now.</p>}
                  {!dossErr && !doss && <p className="plain">Opening the folder.</p>}

                  {doss && (
                    <div className="article">
                      <div>
                        {/* IN SHORT */}
                        <div className="exsec">
                          <div className="exhead">In short</div>
                          {read?.synopsis ? (
                            <p className="inshort">{linkify(read.synopsis, targets, Ilink)}</p>
                          ) : doss.narrative ? (
                            <p className="inshort">
                              {linkify(leadSentences(doss.narrative.sections?.[0]?.body ?? "", 3), targets, Ilink)}
                            </p>
                          ) : (
                            <p className="nowrite">
                              Your COB has not written a short version of this folder yet. The notes below are what it
                              has so far.
                            </p>
                          )}
                        </div>

                        {/* WHAT YOUR COB CONCLUDES */}
                        <div className="exsec">
                          <div className="exhead">What your COB concludes</div>
                          {read && read.judgments.length > 0 ? (
                            <>
                              {read.judgments.map((j, i) => (
                                <div className="kj" key={i}>
                                  <div className="kjn">{num(i + 1)} {DOT} conclusion</div>
                                  <div className="kjc">{linkify(j.claim, targets, Ilink)}</div>
                                  {j.reasoning && <div className="kjr">{linkify(j.reasoning, targets, Ilink)}</div>}
                                  <div className="kjfoot">
                                    {j.confidence && (
                                      <span
                                        className={`pill ${j.confidence}`}
                                        title="How sure your COB is about this."
                                      >
                                        {CONFIDENCE_COPY[j.confidence]}
                                      </span>
                                    )}
                                    {j.sources.map((s, si) => (
                                      <button
                                        className="srcchip"
                                        key={si}
                                        title="Where this came from."
                                        onClick={() => goto(active, "records")}
                                      >
                                        from {DOT} {s.length > 24 ? shortId(s) : s}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              <Ask section="What your COB concludes" ids={read.judgments.flatMap((j) => j.sources)} />
                            </>
                          ) : (
                            <p className="nowrite">
                              Your COB has not written its read on this folder yet. Ask it for one and it will show up
                              here.
                            </p>
                          )}
                        </div>

                        {/* WHAT YOUR COB RECOMMENDS */}
                        <div className="exsec">
                          <div className="exhead">What your COB recommends</div>
                          {read && read.actions.length > 0 ? (
                            <div className="recs">
                              {read.actions.map((a, i) => (
                                <div className="rec" key={i}>
                                  <span className="rn">{num(i + 1)}</span>
                                  <span className="rt">
                                    {linkify(a.text, targets, Ilink)}
                                    {a.blocker && <span className="rb">waiting on {a.blocker}</span>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="nowrite">
                              Your COB has not written any next moves for this folder yet.
                            </p>
                          )}
                        </div>

                        {/* TABLE OF CONTENTS */}
                        <div className="tock">Table of contents {DOT} tap any line to jump to it</div>
                        <div className="toc">
                          {groups.map((g, i) => (
                            <button className="tline" key={g.key} onClick={() => goto(active, g.key)}>
                              <span className="tn">&sect; {i + 1}</span>
                              <span className="tt">{g.title}</span>
                              <span className="dots" />
                              <span className="tm">{g.meta}</span>
                            </button>
                          ))}
                        </div>

                        {/* THE DETAILS */}
                        <div className="exsec">
                          <div className="exhead">The details</div>
                          {groups.map((g, i) => (
                            <div className="dgroup" id={`g-${g.key}`} key={g.key}>
                              <h3>
                                <span className="gn">&sect; {i + 1}</span>
                                {g.title}
                              </h3>
                              <div className="gsum">{g.summary}</div>
                              {g.table}
                              {g.facts.map((f) => (
                                <div className={`fact${f.late ? " late" : ""}`} key={f.key}>
                                  <div className="fd">{f.date}</div>
                                  <div className="fs">
                                    {f.body}
                                    <span className="fsrc">{f.source}</span>
                                  </div>
                                </div>
                              ))}
                              {g.empty && !g.table && <p className="nowrite">{g.empty}</p>}
                              <Ask section={g.title} ids={g.ids} />
                            </div>
                          ))}
                        </div>
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
