/** THE LANE DOSSIER · /hq/world/lane/:slug
 *
 * The index on top, the encyclopedia below: the full lane narrative, then
 * every memory entry in full, then the open threads. Nothing is summarised
 * away and nothing here writes. Editing is a chat handoff to the COB.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { HqShell } from "@/components/hq/HqShell";
import { useToast } from "@/hooks/use-toast";
import {
  callWorld,
  composeChangeRequest,
  type LaneDossierPayload,
} from "@/lib/world-lanes";
import "@/hq-next/styles/hq-lanes.css";

const DOT = "\u00b7";
const SEEN_GRADES = ["seen", "own-probe", "document", "system-of-record", "verified"];

const shortId = (id: string) => id.slice(0, 8);

function gradeChip(grade: string | null | undefined) {
  const g = String(grade ?? "").toLowerCase();
  if (!g) return null;
  const seen = SEEN_GRADES.includes(g);
  return <span className={`chip ${seen ? "seen" : "told"}`}>{seen ? "SEEN" : "TOLD"} {DOT} {g}</span>;
}

export function LaneDossier() {
  const { slug = "" } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState<LaneDossierPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setErr(null);
    callWorld<LaneDossierPayload>("lane", { slug })
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [slug]);

  const ask = async (section: string, recordIds: string[]) => {
    if (!data) return;
    const message = composeChangeRequest({ lane: data.lane, section, recordIds });
    try {
      await navigator.clipboard.writeText(message);
      toast({
        title: "Copied for your COB",
        description: "Paste this into your COB conversation and say what should change.",
      });
    } catch {
      toast({
        title: "Copy it manually",
        description: message,
      });
    }
  };

  const sections = useMemo(() => data?.narrative?.sections ?? [], [data]);

  const toc = useMemo(() => {
    if (!data) return [];
    const items: Array<{ id: string; title: string; desc: string }> = [];
    sections.forEach((s, i) => {
      items.push({
        id: `s-${i}`,
        title: s.heading,
        desc: s.body.replace(/\s+/g, " ").trim().slice(0, 90) || "narrative section",
      });
    });
    items.push({
      id: "records",
      title: "The record entries",
      desc: `${data.memories.length} ${data.memories.length === 1 ? "entry" : "entries"} in full`,
    });
    items.push({
      id: "threads",
      title: "Open threads",
      desc: data.threads.length ? `${data.threads.length} standing` : "none standing",
    });
    items.push({
      id: "entities",
      title: "People & entities",
      desc: data.entities.length
        ? data.entities.slice(0, 3).map((e) => e.name).join(` ${DOT} `)
        : "none linked to this lane yet",
    });
    return items;
  }, [data, sections]);

  return (
    <HqShell>
      <div className="wld">
        <Link className="backlink" to="/hq/world">
          &larr; The cabinet
        </Link>

        {err && <div className="plain">This lane dossier could not be read: {err}</div>}
        {!err && !data && <div className="plain">Opening the dossier.</div>}

        {data && (
          <div className="doss">
            <div className="strip">
              <span>
                Lane dossier {DOT} <span style={{ color: "var(--ink)" }}>{data.lane}</span>
              </span>
              <b>For Principal {DOT} Confidential</b>
            </div>

            <div className="dhead">
              <div className="k">{data.lane}</div>
              <h2>The {data.lane} lane, in full</h2>
              <div className="rule" />
            </div>

            <div className="toc">
              {toc.map((t, i) => (
                <a key={t.id} href={`#${t.id}`}>
                  <div className="tn">&sect; {i + 1}</div>
                  <div className="tt">{t.title}</div>
                  <div className="td">{t.desc}</div>
                </a>
              ))}
            </div>

            <div className="ency">
              {!data.narrative && (
                <p>
                  No narrative has been written for this lane yet. The record entries below are what your COB holds
                  so far.
                </p>
              )}

              {sections.map((s, i) => (
                <section key={`s-${i}`}>
                  <h3 id={`s-${i}`}>
                    <span className="no">&sect; {i + 1}</span>
                    {s.heading}
                  </h3>
                  <p>{s.body}</p>
                  <div className="chips">
                    {gradeChip(data.narrative?.grade)}
                    {(data.narrative?.cites ?? []).slice(0, 8).map((c, ci) => (
                      <span className="chip" key={`c-${ci}`}>
                        {typeof c === "string" ? shortId(c) : JSON.stringify(c).slice(0, 24)}
                      </span>
                    ))}
                  </div>
                  <button className="ask" onClick={() => ask(s.heading, data.narrative ? [data.narrative.id] : [])}>
                    Tell your COB to change something here &rarr;
                  </button>
                </section>
              ))}

              <h3 id="records">
                <span className="no">&sect; {sections.length + 1}</span>
                The record entries
              </h3>
              {data.memories.length === 0 && <p>No entries are recorded against this lane yet.</p>}
              {data.memories.map((m) => (
                <div key={m.id}>
                  <h4>{m.title}</h4>
                  <p>{m.body_md}</p>
                  <div className="chips">
                    {m.category && <span className="chip">{m.category}</span>}
                    {m.status && <span className="chip">{m.status}</span>}
                    {m.created_by && <span className="chip told">TOLD {DOT} {m.created_by}</span>}
                    <span className="chip">memory {shortId(m.id)}</span>
                  </div>
                  <button className="ask" onClick={() => ask(m.title, [m.id])}>
                    Tell your COB to change something here &rarr;
                  </button>
                </div>
              ))}

              <h3 id="threads">
                <span className="no">&sect; {sections.length + 2}</span>
                Open threads
              </h3>
              {data.threads.length === 0 ? (
                <p>
                  No open threads match this lane by name. Threads are matched to lanes by name, so a thread worded
                  differently will not appear here.
                </p>
              ) : (
                data.threads.map((t) => (
                  <div key={t.id}>
                    <h4>{t.title}</h4>
                    {t.trigger && <p>{t.trigger}</p>}
                    <div className="chips">
                      <span className="chip open">open</span>
                      {t.owner && <span className="chip">{t.owner}</span>}
                      {t.state && <span className="chip">{t.state}</span>}
                      <span className="chip">thread {shortId(t.id)}</span>
                    </div>
                    <button className="ask" onClick={() => ask(`Open thread: ${t.title}`, [t.id])}>
                      Tell your COB to change something here &rarr;
                    </button>
                  </div>
                ))
              )}

              <h3 id="entities">
                <span className="no">&sect; {sections.length + 3}</span>
                People &amp; entities
              </h3>
              {data.entities.length === 0 ? (
                <p>No people or organisations on the record are named in this lane's material yet.</p>
              ) : (
                <div className="chips">
                  {data.entities.map((e) => (
                    <span className="chip" key={e.id}>
                      {e.etype} {DOT} {e.name}
                    </span>
                  ))}
                </div>
              )}

              <p className="foot">
                Read-only surface {DOT} narrative from your storyline register {DOT} entries from your memory
                register {DOT} threads matched by lane name {DOT} your COB is the only pen
              </p>
            </div>
          </div>
        )}
      </div>
    </HqShell>
  );
}

export default LaneDossier;
