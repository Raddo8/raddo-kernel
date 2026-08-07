/** THE BRIEF · /hq/world/brief/:id
 *
 * A full page on one subject: a person, a company, a case, or a property.
 * Everything on this page is read from your own records, server-side, and keyed
 * to the signed-in principal. Nothing here writes: changes are a chat handoff.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion, type Transition } from "framer-motion";

import { HqShell } from "@/components/hq/HqShell";
import { useToast } from "@/hooks/use-toast";
import {
  callWorld,
  composeChangeRequest,
  sourceLine,
  subjectKind,
  type BriefPayload,
} from "@/lib/world-lanes";
import { datedLines, daysAway, humanDate, linkify, loudestClock, type LinkTarget } from "@/lib/world-wiki";
import "@/hq-next/styles/hq-lanes.css";
import { useCobLabel } from "@/lib/cob-identity";

const DOT = "\u00b7";
const EASE: Transition["ease"] = [0.22, 1, 0.36, 1];
const num = (n: number) => String(n).padStart(2, "0");

const CONFIDENCE_COPY: Record<string, string> = {
  high: "Very sure",
  medium: "Fairly sure",
  low: "Not very sure",
};

export function EntityBrief() {
  const COB = useCobLabel();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { toast } = useToast();
  const [data, setData] = useState<BriefPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setErr(null);
    // A valid subject id is a uuid. Anything else (a stray link, the route
    // pattern itself) is a bad address, not a server problem.
    const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!valid) {
      setErr("not_found");
      return;
    }
    callWorld<BriefPayload>("brief", { entity_id: id })
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [id]);


  const targets = useMemo<LinkTarget[]>(
    () => (data?.connections ?? []).map((c) => ({ id: c.entity_id, name: c.name })),
    [data],
  );

  const Ilink = useCallback(
    (target: LinkTarget, key: string) => (
      <button key={key} className="ilink" onClick={() => navigate(`/hq/world/brief/${target.id}`)}>
        {target.name}
      </button>
    ),
    [navigate],
  );

  const timeline = useMemo(() => {
    if (!data) return [] as Array<{ key: string; when: string; what: string; source: string; late: boolean }>;
    const rows = [
      ...(data.events ?? []).map((e) => ({
        key: `e-${e.id}`,
        iso: e.date,
        what: e.what,
        source: e.evidence ? `${COB} read this in your own records` : "on your calendar of events",
      })),
      ...data.claims.map((c) => ({
        key: `c-${c.id}`,
        iso: c.observed_at,
        what: [c.predicate, c.value_text].filter(Boolean).join(": ") || "Recorded on the file.",
        source: sourceLine(c.grade),
      })),
      ...data.mentions.map((m) => ({
        key: `m-${m.id}`,
        iso: m.updated_at ?? m.created_at,
        what: `${m.title}${m.lane ? ` (${m.lane})` : ""}`,
        source: sourceLine(null, m.created_by),
      })),
    ];
    return rows
      .sort((a, b) => String(b.iso ?? "").localeCompare(String(a.iso ?? "")))
      .map((r) => ({ key: r.key, when: humanDate(r.iso, true), what: r.what, source: r.source, late: false }));
  }, [data]);

  const typedLinks = useMemo(
    () => (data?.connections ?? []).filter((c) => c.typed),
    [data],
  );
  const looseLinks = useMemo(
    () => (data?.connections ?? []).filter((c) => !c.typed),
    [data],
  );

  const clock = useMemo(() => {
    if (!data) return null;
    const lines = [
      ...data.claims.map((c) => String(c.value_text ?? "")),
      ...data.mentions.map((m) => `${m.title}. ${m.body_md}`),
    ].flatMap((b) => datedLines(b));
    return loudestClock(lines);
  }, [data]);

  const ask = useCallback(async () => {
    if (!data) return;
    const message = composeChangeRequest({
      lane: `the brief on ${data.entity.name}`,
      section: "This brief",
      recordIds: [data.entity.id],
    });
    try {
      await navigator.clipboard.writeText(message);
      toast({ title: `Copied for ${COB}`, description: `Paste this into your ${COB} conversation.` });
    } catch {
      toast({ title: "Copy it manually", description: message });
    }
  }, [data, toast]);

  const read = data?.read ?? null;

  return (
    <HqShell>
      <div className="wld">
        <div className="crumb">HQ {DOT} 02 {DOT} the world {DOT} brief</div>

        <button className="backbtn" onClick={() => navigate("/hq/world")}>
          &larr; Back to your folders
        </button>

        {err && (
          <p className="plain">
            {err === "not_found" || err === "entity_not_found"
              ? "We could not find that subject. It may have been merged or removed. Go back to your folders and open it from there."
              : "We could not open this brief just now."}
          </p>
        )}
        {!err && !data && <p className="plain">Opening the brief.</p>}


        {data && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.42, ease: EASE }}
          >
            <div className="bhead">
              <div className="bk">Brief {DOT} {subjectKind(data.entity.etype)}</div>
              <h2>{data.entity.name}</h2>
              <div className="bsub">
                {data.entity.tag ? `${data.entity.tag} ${DOT} ` : ""}
                shows up in {data.counts.folders} {data.counts.folders === 1 ? "folder" : "folders"} {DOT}{" "}
                {data.counts.facts} {data.counts.facts === 1 ? "fact" : "facts"} on file
              </div>
            </div>

            <div className="article">
              <div>
                <div className="exsec">
                  <div className="exhead">In short</div>
                  {read?.synopsis ? (
                    <p className="inshort">{linkify(read.synopsis, targets, Ilink)}</p>
                  ) : (
                    <p className="nowrite">
                      {COB} has not written a short version on {data.entity.name} yet. What it has is below.
                    </p>
                  )}
                </div>

                <div className="exsec">
                  <div className="exhead">What {COB} concludes</div>
                  {read && read.judgments.length > 0 ? (
                    read.judgments.map((j, i) => (
                      <div className="kj" key={i}>
                        <div className="kjn">{num(i + 1)} {DOT} conclusion</div>
                        <div className="kjc">{linkify(j.claim, targets, Ilink)}</div>
                        {j.reasoning && <div className="kjr">{linkify(j.reasoning, targets, Ilink)}</div>}
                        <div className="kjfoot">
                          {j.confidence && (
                            <span className={`pill ${j.confidence}`} title={`How sure ${COB} is about this.`}>
                              {CONFIDENCE_COPY[j.confidence]}
                            </span>
                          )}
                          {j.sources.map((s, si) => (
                            <span className="pill" key={si} title="Where this came from.">
                              from {DOT} {s.length > 24 ? s.slice(0, 8) : s}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="nowrite">{COB} has not written its read on this subject yet.</p>
                  )}
                </div>

                {read && read.actions.length > 0 && (
                  <div className="exsec">
                    <div className="exhead">What {COB} recommends</div>
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
                  </div>
                )}

                <div className="exsec">
                  <div className="exhead">What happened, in order</div>
                  {timeline.length === 0 ? (
                    <p className="nowrite">Nothing dated has been written down about this subject yet.</p>
                  ) : (
                    <table className="wtab">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>What happened</th>
                          <th>Where this came from</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timeline.map((t) => (
                          <tr key={t.key}>
                            <td className="d">{t.when}</td>
                            <td>{linkify(t.what, targets, Ilink)}</td>
                            <td className="d">{t.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <button className="ask" onClick={ask}>
                    Tell {COB} to change something here &rarr;
                  </button>
                </div>
              </div>

              <div>
                <div className="infobox">
                  <div className="ih">At a glance</div>
                  <div className="irow">
                    <span className="k">What this is</span>
                    <span className="v">{subjectKind(data.entity.etype)}</span>
                  </div>
                  {data.entity.tag && (
                    <div className="irow">
                      <span className="k">Role</span>
                      <span className="v">{data.entity.tag}</span>
                    </div>
                  )}
                  <div className="irow">
                    <span className="k">Facts on file</span>
                    <span className="v">
                      <b>{data.counts.facts}</b>
                    </span>
                  </div>
                  <div className="irow">
                    <span className="k">In folders</span>
                    <span className="v">
                      <b>{data.counts.folders}</b>
                    </span>
                  </div>
                  {data.hub && data.hub.folders >= 3 && (
                    <div className="irow">
                      <span className="k">Shows up a lot</span>
                      <span className="v">appears across {data.hub.folders} folders</span>
                    </div>
                  )}
                  <div className="irow">
                    <span className="k">Last updated</span>
                    <span className="v">{humanDate(data.entity.updated_at)}</span>
                  </div>
                  {clock && (
                    <div className="irow alert">
                      <span className="k">Next clock</span>
                      <span className="v">
                        {clock.label}
                        {daysAway(clock.date) !== null && ` ${DOT} ${daysAway(clock.date)} days`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="connbox">
                  <div className="ch">Connected to</div>
                  {data.connections.length === 0 && data.folders.length === 0 && (
                    <div className="wsempty">Nothing is linked to this subject yet.</div>
                  )}
                  {typedLinks.map((c) => (
                    <button
                      className="crow"
                      key={c.id}
                      onClick={() => navigate(`/hq/world/brief/${c.entity_id}`)}
                      title={c.evidence ?? `${COB} has not saved a sentence for this link yet.`}
                    >
                      <span className="crel">
                        {c.phrase}
                        {c.hub_folders && c.hub_folders >= 3
                          ? ` ${DOT} appears across ${c.hub_folders} folders`
                          : ""}
                      </span>
                      {c.name}
                      {c.evidence && <span className="ev">{c.evidence}</span>}
                    </button>
                  ))}
                  {looseLinks.length > 0 && <div className="csub">Also appears with</div>}
                  {looseLinks.map((c) => (
                    <button
                      className="crow"
                      key={c.id}
                      onClick={() => navigate(`/hq/world/brief/${c.entity_id}`)}
                      title={c.evidence ?? "They show up in the same notes."}
                    >
                      <span className="crel">{subjectKind(c.etype)}</span>
                      {c.name}
                    </button>
                  ))}
                  {data.folders.map((f) => (
                    <button className="crow" key={f.slug} onClick={() => navigate(`/hq/world#${f.slug}`)}>
                      <span className="crel">
                        folder {DOT} {f.fact_count} {f.fact_count === 1 ? "note" : "notes"}
                      </span>
                      {f.lane}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </HqShell>
  );
}

export default EntityBrief;
