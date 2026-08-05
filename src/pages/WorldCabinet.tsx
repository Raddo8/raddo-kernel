/** THE LANE DOSSIER CABINET · /hq/world
 *
 * Lanes are tabs (exact IntroducingCob anatomy): thin numbered mono tabs in
 * rows of four, back rows peeking above the front row, active tab brass-topped
 * and merging into the one giant folder below. The folder face is the table of
 * contents; every line expands in place with the full material.
 *
 * Lanes are derived server-side from the principal's own registers. This
 * surface never writes: editing is a chat handoff to the COB.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion, type Transition } from "framer-motion";

import { HqShell } from "@/components/hq/HqShell";
import { useToast } from "@/hooks/use-toast";
import {
  callWorld,
  composeChangeRequest,
  type LaneDossierPayload,
  type LaneRow,
} from "@/lib/world-lanes";
import "@/hq-next/styles/hq-lanes.css";

const DOT = "\u00b7";
const EASE: Transition["ease"] = [0.22, 1, 0.36, 1];
const SEEN_GRADES = ["seen", "own-probe", "document", "system-of-record", "verified"];
const PER_ROW = 4;

const shortId = (id: string) => id.slice(0, 8);
const num = (n: number) => String(n).padStart(2, "0");

function freshness(iso: string | null): string {
  if (!iso) return "no dated material yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "no dated material yet";
  if (d.toDateString() === new Date().toDateString()) return "updated today";
  return `updated ${d.getMonth() + 1}/${d.getDate()}`;
}

function GradeChip({ grade }: { grade: string | null | undefined }) {
  const g = String(grade ?? "").toLowerCase();
  if (!g) return null;
  const seen = SEEN_GRADES.includes(g);
  return <span className={`chip ${seen ? "seen" : "told"}`}>{seen ? "SEEN" : "TOLD"} {DOT} {g}</span>;
}

type TocItem = {
  key: string;
  n: string;
  title: string;
  meta: string;
  render: () => JSX.Element;
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
    callWorld<LaneDossierPayload>("lane", { slug: active })
      .then((d) => live && setDoss(d))
      .catch((e: Error) => live && setDossErr(e.message));
    return () => {
      live = false;
    };
  }, [active]);

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

  const lanes = rows ?? [];
  const activeIndex = lanes.findIndex((r) => r.slug === active);

  // Rows of four; the row holding the active tab is the front row, the rest peek.
  const chunks: LaneRow[][] = [];
  for (let i = 0; i < lanes.length; i += PER_ROW) chunks.push(lanes.slice(i, i + PER_ROW));
  const frontRow = activeIndex >= 0 ? Math.floor(activeIndex / PER_ROW) : chunks.length - 1;

  const toc = useMemo<TocItem[]>(() => {
    if (!doss) return [];
    const items: TocItem[] = [];
    const sections = doss.narrative?.sections ?? [];
    const narrativeIds = doss.narrative ? [doss.narrative.id] : [];

    sections.forEach((s, i) => {
      const key = `s-${i + 1}`;
      items.push({
        key,
        n: `\u00a7 ${i + 1}`,
        title: s.heading,
        meta: `${s.body.trim().split(/\s+/).length} words`,
        render: () => (
          <>
            <p>{s.body}</p>
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
          <p>No people or organisations on the record are named in this lane's material yet.</p>
        ) : (
          <>
            {doss.entities.map((e) => (
              <div key={e.id}>
                <h4>{e.name}</h4>
                <div className="chips">
                  <span className="chip">{e.etype}</span>
                  {e.tag && <span className="chip">{e.tag}</span>}
                  {e.status && <span className="chip">{e.status}</span>}
                  {e.sensitivity && <span className="chip told">{e.sensitivity}</span>}
                  <span className="chip">record {DOT} {shortId(e.id)}</span>
                </div>
              </div>
            ))}
            <Ask section="People & entities" ids={doss.entities.map((e) => e.id)} />
          </>
        ),
    });

    items.push({
      key: "threads",
      n: `\u00a7 ${base + 2}`,
      title: "Open threads",
      meta: doss.threads.length ? `${doss.threads.length} standing` : "none standing",
      render: () =>
        doss.threads.length === 0 ? (
          <p>
            No open threads match this lane by name. Threads are matched to lanes by name, so a thread worded
            differently will not appear here.
          </p>
        ) : (
          <>
            {doss.threads.map((t) => (
              <div key={t.id}>
                <h4>{t.title}</h4>
                {t.trigger && <p>{t.trigger}</p>}
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
                <p>{m.body_md}</p>
                <div className="chips">
                  {m.category && <span className="chip">{m.category}</span>}
                  {m.status && <span className="chip">{m.status}</span>}
                  {m.created_by && <span className="chip told">TOLD {DOT} {m.created_by}</span>}
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
      meta: doss.narrative ? "how this lane got here" : "not written yet",
      render: () =>
        !doss.narrative ? (
          <p>
            No narrative has been written for this lane yet. The record entries above are what your COB holds so
            far.
          </p>
        ) : (
          <>
            <h4>{doss.narrative.title}</h4>
            {(doss.narrative.sections ?? []).map((s, i) => (
              <p key={i}>{s.body}</p>
            ))}
            <div className="chips">
              <GradeChip grade={doss.narrative.grade} />
              <span className="chip">narrative {DOT} {shortId(doss.narrative.id)}</span>
            </div>
            <Ask section="The storyline" ids={narrativeIds} />
          </>
        ),
    });

    return items;
  }, [doss, Ask]);

  const activeRow = activeIndex >= 0 ? lanes[activeIndex] : null;

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

  const Listen = () => (
    <button className="tab listen" disabled aria-disabled="true">
      <span className="no">{DOT}</span>Next lane files itself
    </button>
  );

  return (
    <HqShell>
      <div className="wld">
        <div className="crumb">HQ {DOT} 02 {DOT} the world</div>
        <h1>The World</h1>
        <p className="psub">
          One folder per lane, filed exactly like the cabinet on the front page. Tap a tab to pull its folder; the
          folder opens on its table of contents; every line expands into the full record. New lanes file themselves
          the moment your world grows one. Anything here changes by telling your COB.
        </p>

        {err && <div className="plain">The cabinet could not be read: {err}</div>}
        {!err && rows === null && <div className="plain">Reading your lanes.</div>}
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
                    {ri === chunks.length - 1 && <Listen />}
                  </div>
                ),
              )}
              <div className="trow front">
                {(chunks[frontRow] ?? []).map((row) => (
                  <Tab key={row.slug} row={row} n={lanes.indexOf(row) + 1} />
                ))}
                {frontRow === chunks.length - 1 && <Listen />}
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
                            {DOT} {activeRow.open_thread_count} open{" "}
                            {activeRow.open_thread_count === 1 ? "thread" : "threads"} matched by lane name
                          </>
                        )}{" "}
                        {DOT} {freshness(activeRow.updated_at)} {DOT}{" "}
                        {activeRow.has_narrative
                          ? "narrative maintained by your COB, cited to its sources"
                          : "no narrative written yet"}
                      </>
                    )}
                  </div>

                  {dossErr && <p className="plain">This lane dossier could not be read: {dossErr}</p>}
                  {!dossErr && !doss && <p className="plain">Opening the folder.</p>}

                  {doss && (
                    <>
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
                    </>
                  )}
                </motion.div>
              </div>
            </div>
          </>
        )}

        <p className="foot">
          Read-only surface {DOT} lanes derived from your own registers {DOT} narrative from your storyline register{" "}
          {DOT} entries from your memory register {DOT} threads matched by lane name {DOT} your COB is the only pen
        </p>
      </div>
    </HqShell>
  );
}

export default WorldCabinet;
