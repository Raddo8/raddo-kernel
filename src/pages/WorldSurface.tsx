/** THE WORLD · /hq/world
 *
 * W1d. The principal-approved template, rendered live. Every byte on this
 * surface comes from the world-graph edge function (actions: claims, entities,
 * edges, sources, profile, govern, merge). Nothing is hand authored.
 *
 * Render law:
 *  · privileged / third-party-npi never reach the client (the function
 *    withholds them); this file does not special-case around that.
 *  · sensitive rows render muted with a SENSITIVE · HELD WITH CARE chip.
 *  · flagged / voided / superseded claims never render in profiles.
 *  · grade renders verbatim in the provenance line.
 *
 * Speed law: every govern interaction transitions the UI immediately and
 * reconciles in the background, rolling back with a visible notice on failure.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import "@/hq-next/styles/hq-world.css";

const DOT = "\u00b7";

/* ------------------------------------------------------------- contracts */

interface EntityRow {
  id: string;
  etype: string;
  name: string;
  tag: string | null;
  status: string | null;
  sensitivity: string | null;
  resolution_keys?: unknown;
  updated_at?: string | null;
}

interface ClaimRow {
  id: string;
  subject_id: string;
  object_id: string | null;
  predicate: string;
  value_text: string | null;
  source_id: string | null;
  source_ref: string | null;
  miner: string | null;
  wave: number | null;
  grade: string | null;
  status: string | null;
  sensitivity: string | null;
  synthetic?: boolean | null;
  observed_at: string | null;
}

interface SourceRow {
  id: string;
  kind: string;
  label: string | null;
  scope: string | null;
  last_wave: number | null;
  last_mined_at: string | null;
  meta: Record<string, unknown> | null;
}

interface EdgeRow { id: string; src_id: string; dst_id: string; etype: string | null }

interface ProfilePayload { entity: EntityRow; claims: ClaimRow[]; edges: EdgeRow[] }

type Noted = { verdict: string; note: string | null; governing_ids: string[]; at: number };

type View =
  | { kind: "delta" }
  | { kind: "area"; id: string }
  | { kind: "profiles"; type: string }
  | { kind: "profile"; id: string }
  | { kind: "source"; id: string };

/* --------------------------------------------------------------- helpers */

async function callWorld<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("world-graph", { body: { ...body, action } });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(String(data?.error ?? "world_graph_error"));
  return data as T;
}

const TYPE_LABEL: Record<string, string> = {
  person: "PERSON",
  organization: "BUSINESS",
  org: "BUSINESS",
  business: "BUSINESS",
  company: "BUSINESS",
  case: "CASE",
  matter: "CASE",
  property: "PROPERTY",
  place: "PROPERTY",
  asset: "PROPERTY",
};

const typeLabel = (etype: string | null | undefined): string => {
  const key = String(etype ?? "").toLowerCase();
  return TYPE_LABEL[key] ?? (key.replace(/[_-]+/g, " ").toUpperCase() || "ENTITY");
};

const isSensitive = (s: string | null | undefined) => String(s ?? "") === "sensitive";

function claimText(c: ClaimRow): string {
  const v = (c.value_text ?? "").trim();
  const p = String(c.predicate ?? "").replace(/[_-]+/g, " ").trim();
  if (!v) return p;
  return v;
}

function provenance(c: ClaimRow): string {
  const bits: string[] = [];
  if (c.source_ref) bits.push(c.source_ref);
  if (c.grade) bits.push(c.grade);
  if (c.wave != null) bits.push(`wave ${c.wave}`);
  if (c.observed_at) bits.push(new Date(c.observed_at).toISOString().slice(0, 10));
  return bits.join(`  ${DOT}  `) || "no source reference recorded";
}

const headline = (text: string, n = 110) => (text.length <= n ? text : `${text.slice(0, n).trimEnd()}…`);

/** World areas are derived from the entity resolution-key slugs, then spread
 * one hop along the edges. Anything the rules do not claim keeps a home in the
 * catch-all area. No membership is authored by hand. */
const AREA_RULES: Array<{ id: string; title: string; blurb: string; test: (slug: string, etype: string) => boolean }> = [
  {
    id: "family",
    title: "The family",
    blurb: "The people the rest of it is for.",
    test: (s) => /^(jake-|janie-|burkett-children|tim-uncle|dan-burkett|prop-bronco)/.test(s),
  },
  {
    id: "faith",
    title: "The faith",
    blurb: "The center of gravity outside the work.",
    test: (s) => /(mercy|church|faith)/.test(s),
  },
  {
    id: "legacy",
    title: "The legacy",
    blurb: "What was built, and what survives it.",
    test: (s) => /(biscuit|kickback|stockyards|tbb|trademark)/.test(s),
  },
  {
    id: "war",
    title: "The war",
    blurb: "The adversaries, the forums, and the clocks.",
    test: (s, e) => /(beard|fortress|westdale|herrin|buncher|indest|turner|majestic)/.test(s) || /^case[-_]/.test(s) || e.toLowerCase() === "case",
  },
  {
    id: "estate",
    title: "The estate",
    blurb: "What is held, and who holds paper on it.",
    test: (s) => /(818|clydesdale|private-lender|williamson|capital|concepts)/.test(s),
  },
  {
    id: "venture",
    title: "The venture",
    blurb: "The active front and the revenue behind it.",
    test: (s) => /(cob-venture|pinnacle|pipeline|sky-ranch|blackfriar|darnell|aaron|reif|huggins)/.test(s),
  },
];

const CATCH_ALL = { id: "rest", title: "The rest of the record", blurb: "Everything the areas have not claimed yet." };

function slugsOf(e: EntityRow): string[] {
  const raw = e.resolution_keys;
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((k) => String(k).toLowerCase());
}

function deriveAreas(entities: EntityRow[], edges: EdgeRow[]): Map<string, string> {
  const area = new Map<string, string>();
  for (const e of entities) {
    const slugs = slugsOf(e);
    const rule = AREA_RULES.find((r) => slugs.some((s) => r.test(s, e.etype)));
    if (rule) area.set(e.id, rule.id);
  }
  // one hop along the edges for anything unclaimed
  for (const e of entities) {
    if (area.has(e.id)) continue;
    const tally = new Map<string, number>();
    for (const edge of edges) {
      const other = edge.src_id === e.id ? edge.dst_id : edge.dst_id === e.id ? edge.src_id : null;
      if (!other) continue;
      const a = area.get(other);
      if (a) tally.set(a, (tally.get(a) ?? 0) + 1);
    }
    const best = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];
    area.set(e.id, best ? best[0] : CATCH_ALL.id);
  }
  return area;
}

/* ------------------------------------------------------------ components */

const Badges = ({ children }: { children: React.ReactNode }) => <>{children}</>;

const SensChip = () => <span className="badge b-sens">Sensitive {DOT} held with care</span>;

/* ----------------------------------------------------------------- page */

export function WorldSurface() {
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [view, setView] = useState<View>({ kind: "delta" });
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [noted, setNoted] = useState<Record<string, Noted>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"cards" | "table">("cards");
  const [sortKey, setSortKey] = useState<string>("subject");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [history, setHistory] = useState<Array<{ ids: string[]; governing: string[] }>>([]);

  const includeSynthetic = typeof window !== "undefined" && /(?:\?|&)synthetic=1(?:&|$)/.test(window.location.search);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [ents, cls, eds, srcs] = await Promise.all([
        callWorld<{ rows: EntityRow[] }>("entities"),
        callWorld<{ rows: ClaimRow[] }>("claims", { include_synthetic: includeSynthetic }),
        callWorld<{ rows: EdgeRow[] }>("edges"),
        callWorld<{ rows: SourceRow[] }>("sources"),
      ]);
      setEntities(ents.rows ?? []);
      setClaims(cls.rows ?? []);
      setEdges(eds.rows ?? []);
      setSources(srcs.rows ?? []);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "read_failed");
    } finally {
      setLoading(false);
    }
  }, [includeSynthetic]);

  useEffect(() => { void load(); }, [load]);

  const entityMap = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const areaOf = useMemo(() => deriveAreas(entities, edges), [entities, edges]);
  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const areas = useMemo(() => {
    const defs = [...AREA_RULES, CATCH_ALL];
    return defs
      .map((d) => ({
        ...d,
        entities: entities.filter((e) => areaOf.get(e.id) === d.id),
      }))
      .filter((d) => d.entities.length > 0);
  }, [entities, areaOf]);

  const claimsBySubject = useMemo(() => {
    const m = new Map<string, ClaimRow[]>();
    for (const c of claims) {
      if (c.predicate === "governs") continue;
      const list = m.get(c.subject_id) ?? [];
      list.push(c);
      m.set(c.subject_id, list);
    }
    return m;
  }, [claims]);

  const stagedAll = useMemo(
    () => claims.filter((c) => c.status === "staged" && c.predicate !== "governs"),
    [claims],
  );
  const mergeQuestions = useMemo(() => stagedAll.filter((c) => c.predicate === "same_as_candidate"), [stagedAll]);
  const deltaClaims = useMemo(
    () => stagedAll.filter((c) => c.predicate !== "same_as_candidate" && !noted[c.id]),
    [stagedAll, noted],
  );
  const totalStaged = stagedAll.filter((c) => c.predicate !== "same_as_candidate").length;
  const ruledCount = totalStaged - deltaClaims.length;

  const claimCountBySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of claims) m.set(c.source_id ?? "", (m.get(c.source_id ?? "") ?? 0) + 1);
    return m;
  }, [claims]);

  /* ------------------------------------------------------- govern (fast) */

  const rule = useCallback(
    async (ids: string[], verdict: "confirm" | "flag" | "explain", note?: string) => {
      if (ids.length === 0) return;
      const at = Date.now();
      setNoted((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = { verdict, note: note ?? null, governing_ids: [], at };
        return next;
      });
      setSelected({});
      setNotice(null);
      try {
        const res = await callWorld<{ governing_claim_ids: string[] }>("govern", {
          claim_ids: ids,
          verdict,
          note: note ?? null,
        });
        const gov = res.governing_claim_ids ?? [];
        setNoted((prev) => {
          const next = { ...prev };
          for (const id of ids) if (next[id]) next[id] = { ...next[id], governing_ids: gov };
          return next;
        });
        setHistory((h) => [...h, { ids, governing: gov }]);
        // The claim's stored status is left alone in local state on purpose:
        // the ruled/total meter needs a stable denominator, and `noted` is the
        // authority for what has your word on it.
      } catch (e) {
        setNoted((prev) => {
          const next = { ...prev };
          for (const id of ids) delete next[id];
          return next;
        });
        setNotice(
          `That did not stick: ${e instanceof Error ? e.message : "write failed"}. Nothing was written to your record.`,
        );
      }
    },
    [],
  );

  const undo = useCallback(async (ids: string[], governing: string[]) => {
    const snapshot: Record<string, Noted> = {};
    setNoted((prev) => {
      const next = { ...prev };
      for (const id of ids) { if (next[id]) snapshot[id] = next[id]; delete next[id]; }
      return next;
    });
    setHistory((h) => h.filter((x) => x.ids.join() !== ids.join()));
    try {
      await callWorld("govern", { claim_ids: ids, verdict: "undo", governing_ids: governing });
    } catch (e) {
      setNoted((prev) => ({ ...prev, ...snapshot }));
      setNotice(`The undo did not stick: ${e instanceof Error ? e.message : "write failed"}.`);
    }
  }, []);

  const doMerge = useCallback(async (claim: ClaimRow, keepAsOne: boolean) => {
    const at = Date.now();
    setNoted((prev) => ({ ...prev, [claim.id]: { verdict: keepAsOne ? "merged" : "separate", note: null, governing_ids: [], at } }));
    try {
      if (keepAsOne && claim.value_text) {
        await callWorld("merge", { entity_id: claim.subject_id, into_id: claim.value_text });
      }
      await callWorld("govern", { claim_ids: [claim.id], verdict: keepAsOne ? "confirm" : "flag" });
      await load();
    } catch (e) {
      setNoted((prev) => { const n = { ...prev }; delete n[claim.id]; return n; });
      setNotice(`That did not stick: ${e instanceof Error ? e.message : "write failed"}.`);
    }
  }, [load]);

  /* ------------------------------------------------------------- profile */

  useEffect(() => {
    if (view.kind !== "profile") { setProfile(null); setProfileErr(null); return; }
    let live = true;
    setProfile(null);
    setProfileErr(null);
    callWorld<ProfilePayload>("profile", { entity_id: view.id })
      .then((p) => { if (live) setProfile(p); })
      .catch((e) => { if (live) setProfileErr(e instanceof Error ? e.message : "profile_failed"); });
    return () => { live = false; };
  }, [view]);

  /* ---------------------------------------------------------------- rail */

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entities) m.set(typeLabel(e.etype), (m.get(typeLabel(e.etype)) ?? 0) + 1);
    return m;
  }, [entities]);

  const waves = useMemo(() => {
    const w = sources.map((s) => Number(s.last_wave ?? 0));
    return w.length ? Math.max(...w) : 0;
  }, [sources]);

  /* ----------------------------------------------------------- delta view */

  const deltaGroups = useMemo(() => {
    const byArea = new Map<string, Map<string, ClaimRow[]>>();
    for (const c of deltaClaims) {
      const a = areaOf.get(c.subject_id) ?? CATCH_ALL.id;
      const byEntity = byArea.get(a) ?? new Map<string, ClaimRow[]>();
      const list = byEntity.get(c.subject_id) ?? [];
      list.push(c);
      byEntity.set(c.subject_id, list);
      byArea.set(a, byEntity);
    }
    const order = [...AREA_RULES.map((r) => r.id), CATCH_ALL.id];
    return order
      .filter((a) => byArea.has(a))
      .map((a) => {
        const def = [...AREA_RULES, CATCH_ALL].find((d) => d.id === a)!;
        const entries = [...byArea.get(a)!.entries()].map(([eid, rows]) => ({ eid, rows }));
        const count = entries.reduce((n, e) => n + e.rows.length, 0);
        return { id: a, title: def.title, entries, count };
      });
  }, [deltaClaims, areaOf]);

  const tableRows = useMemo(() => {
    const rows = [...deltaClaims];
    const get = (c: ClaimRow) => {
      switch (sortKey) {
        case "claim": return claimText(c).toLowerCase();
        case "subject": return (entityMap.get(c.subject_id)?.name ?? "").toLowerCase();
        case "source": return (sourceMap.get(c.source_id ?? "")?.label ?? c.source_ref ?? "").toLowerCase();
        case "grade": return String(c.grade ?? "");
        case "wave": return Number(c.wave ?? 0);
        default: return "";
      }
    };
    rows.sort((a, b) => {
      const av = get(a); const bv = get(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
    return rows;
  }, [deltaClaims, sortKey, sortDir, entityMap, sourceMap]);

  const toggleSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  };

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const confirmAllRemaining = () => {
    const ids = deltaClaims.map((c) => c.id);
    if (ids.length === 0) return;
    if (window.confirm(`Confirm ${ids.length} claims into your record`)) void rule(ids, "confirm");
  };

  const notedList = useMemo(
    () => Object.entries(noted).sort((a, b) => b[1].at - a[1].at),
    [noted],
  );

  /* ---------------------------------------------------------------- render */

  const railBtn = (label: string, active: boolean, onClick: () => void, count?: number, isNew?: boolean) => (
    <button key={label} className={active ? "on" : ""} onClick={onClick}>
      {label}
      {count != null && (isNew ? <span className="newdot">{count}</span> : <span className="cnt">{count}</span>)}
    </button>
  );

  const claimCard = (c: ClaimRow, withRail: boolean) => {
    const n = noted[c.id];
    const sens = isSensitive(c.sensitivity);
    return (
      <div key={c.id} className={`card ${c.status === "staged" && !n ? "new" : ""} ${sens ? "dim" : ""}`}>
        <Badges>
          {c.status === "staged" && !n && <span className="badge b-new">New</span>}
          {c.status === "confirmed" && <span className="badge b-conf">Confirmed</span>}
          {sens && <SensChip />}
          {c.synthetic && <span className="badge b-gap">Synthetic</span>}
        </Badges>
        {claimText(c)}
        <span className="prov">{provenance(c)}</span>
        {n && (
          <div className="approve">
            <span className="notedline">Noted {DOT} {n.verdict}{n.note ? ` ${DOT} ${n.note}` : ""}</span>
            <button onClick={() => void undo([c.id], n.governing_ids)}>Undo</button>
          </div>
        )}
        {withRail && !n && (
          <>
            <div className="approve">
              <button className="primary" onClick={() => void rule([c.id], "confirm")}>Confirm into my record</button>
              <button onClick={() => void rule([c.id], "flag")}>Flag as wrong</button>
              <button onClick={() => { setNoteFor(c.id); setNoteText(""); }}>Explain</button>
            </div>
            {noteFor === c.id && (
              <div className="noteform">
                <input
                  type="text"
                  value={noteText}
                  aria-label="What is wrong with this"
                  placeholder="What is wrong with this"
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <button className="wbtn primary" onClick={() => { void rule([c.id], "explain", noteText.trim() || null as unknown as string); setNoteFor(null); }}>
                  Record it
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="cobworld">
      <header className="wh">
        <div className="k mono">Chief of Business {DOT} the indexed narrative</div>
        <h1>COB-HQ {DOT} Your World</h1>
        <div className="s">
          {loading
            ? "Reading the record."
            : `${entities.length} records ${DOT} ${claims.length} claims from the mined record ${DOT} waves through ${waves} ${DOT} new material is called out until you confirm it`}
        </div>
      </header>

      <div className="wrap">
        <nav className="wn" aria-label="World registers">
          <div className="lbl">Awaiting your word</div>
          {railBtn("The Delta", view.kind === "delta", () => setView({ kind: "delta" }), deltaClaims.length, true)}

          <div className="lbl">Your world</div>
          {areas.map((a) =>
            railBtn(a.title, view.kind === "area" && view.id === a.id, () => setView({ kind: "area", id: a.id }), a.entities.length),
          )}

          <div className="lbl">The profiles</div>
          {railBtn("All profiles", view.kind === "profiles" && view.type === "ALL", () => setView({ kind: "profiles", type: "ALL" }), entities.length)}
          {[...typeCounts.entries()].map(([t, n]) =>
            railBtn(t, view.kind === "profiles" && view.type === t, () => setView({ kind: "profiles", type: t }), n),
          )}

          <div className="lbl">The record</div>
          {sources.map((s) =>
            railBtn(
              s.label ?? s.kind,
              view.kind === "source" && view.id === s.id,
              () => setView({ kind: "source", id: s.id }),
              claimCountBySource.get(s.id) ?? 0,
            ),
          )}
        </nav>

        <main className="wm">
          {loadErr && <div className="notice">The record could not be read: {loadErr}</div>}
          {notice && <div className="notice">{notice}</div>}

          {/* ------------------------------------------------------ DELTA */}
          {view.kind === "delta" && (
            <section>
              <h2>The Delta {DOT} awaiting your word</h2>
              <p className="sub">
                New material found in the record since your last word. Rule on it, and it becomes yours.
              </p>

              <div className="rrbar">
                <span className="metert">{ruledCount} of {totalStaged} ruled</span>
                <span className="meter"><i style={{ width: `${totalStaged ? (ruledCount / totalStaged) * 100 : 0}%` }} /></span>
                <button className={`wbtn ${mode === "cards" ? "primary" : ""}`} onClick={() => setMode("cards")}>Cards</button>
                <button className={`wbtn ${mode === "table" ? "primary" : ""}`} onClick={() => setMode("table")}>Table</button>
                {selectedIds.length > 0 && (
                  <button className="wbtn primary" onClick={() => void rule(selectedIds, "confirm")}>
                    Confirm selected ({selectedIds.length})
                  </button>
                )}
                <button className="wbtn" onClick={confirmAllRemaining} disabled={deltaClaims.length === 0}>
                  Confirm all remaining
                </button>
                {history.length > 0 && (
                  <button
                    className="wbtn"
                    onClick={() => { const last = history[history.length - 1]; void undo(last.ids, last.governing); }}
                  >
                    Undo last
                  </button>
                )}
              </div>

              {mergeQuestions.filter((c) => !noted[c.id]).map((c) => {
                const subj = entityMap.get(c.subject_id);
                const other = entityMap.get(String(c.value_text ?? ""));
                return (
                  <div key={c.id} className="card new">
                    <span className="badge b-new">Merge question</span>
                    Is {subj?.name ?? "this record"} the same as {other?.name ?? "an existing record"}?
                    <span className="prov">{provenance(c)}</span>
                    <div className="approve">
                      <button className="primary" onClick={() => void doMerge(c, true)}>Keep as one</button>
                      <button onClick={() => void doMerge(c, false)}>Keep separate</button>
                    </div>
                  </div>
                );
              })}

              {!loading && deltaClaims.length === 0 && (
                <div className="empty">Nothing is waiting on you. Every claim in the record has your word on it.</div>
              )}

              {mode === "cards" && deltaGroups.map((g) => (
                <div key={g.id} className="grp">
                  <button className="grph" onClick={() => setOpenGroups((o) => ({ ...o, [g.id]: !o[g.id] }))}>
                    <span className="gn">{openGroups[g.id] ? "−" : "+"} {g.title}</span>
                    <span className="gn">{g.count} items</span>
                    <span className="gnames">
                      {g.entries.slice(0, 5).map((e) => entityMap.get(e.eid)?.name ?? "record").join(` ${DOT} `)}
                      {g.entries.length > 5 ? ` ${DOT} +${g.entries.length - 5} more` : ""}
                    </span>
                    <span
                      className="wbtn"
                      role="button"
                      tabIndex={0}
                      onClick={(ev) => { ev.stopPropagation(); void rule(g.entries.flatMap((e) => e.rows.map((r) => r.id)), "confirm"); }}
                      onKeyDown={(ev) => { if (ev.key === "Enter") { ev.stopPropagation(); void rule(g.entries.flatMap((e) => e.rows.map((r) => r.id)), "confirm"); } }}
                    >
                      Confirm all in group
                    </span>
                  </button>
                  {openGroups[g.id] && (
                    <div className="grpb">
                      {g.entries.map((e) => (
                        <div key={e.eid}>
                          <div className="psec">{entityMap.get(e.eid)?.name ?? "record"} {DOT} {e.rows.length}</div>
                          {e.rows.map((c) => (
                            <div key={c.id} className="rrow">
                              <input
                                type="checkbox"
                                aria-label="Select claim"
                                checked={!!selected[c.id]}
                                onChange={(ev) => setSelected((s) => ({ ...s, [c.id]: ev.target.checked }))}
                              />
                              <div className="hl" onClick={() => setExpanded((x) => ({ ...x, [c.id]: !x[c.id] }))}>
                                {expanded[c.id] ? claimText(c) : headline(claimText(c))}
                                {expanded[c.id] && <span className="prov">{provenance(c)}</span>}
                                {expanded[c.id] && (
                                  <div className="approve">
                                    <button className="primary" onClick={(ev) => { ev.stopPropagation(); void rule([c.id], "confirm"); }}>Confirm into my record</button>
                                    <button onClick={(ev) => { ev.stopPropagation(); void rule([c.id], "flag"); }}>Flag as wrong</button>
                                    <button onClick={(ev) => { ev.stopPropagation(); setNoteFor(c.id); setNoteText(""); }}>Explain</button>
                                  </div>
                                )}
                                {noteFor === c.id && (
                                  <div className="noteform" onClick={(ev) => ev.stopPropagation()}>
                                    <input
                                      type="text"
                                      aria-label="What is wrong with this"
                                      placeholder="What is wrong with this"
                                      value={noteText}
                                      onChange={(ev) => setNoteText(ev.target.value)}
                                    />
                                    <button className="wbtn primary" onClick={() => { void rule([c.id], "explain", noteText.trim()); setNoteFor(null); }}>Record it</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {mode === "table" && deltaClaims.length > 0 && (
                <table className="wtable">
                  <thead>
                    <tr>
                      <th onClick={() => toggleSort("claim")}>Claim</th>
                      <th onClick={() => toggleSort("subject")}>Subject</th>
                      <th onClick={() => toggleSort("source")}>Source</th>
                      <th onClick={() => toggleSort("grade")}>Grade</th>
                      <th onClick={() => toggleSort("wave")}>Wave</th>
                      <th aria-label="Select" />
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((c) => (
                      <tr key={c.id}>
                        <td onClick={() => setExpanded((x) => ({ ...x, [c.id]: !x[c.id] }))} style={{ cursor: "pointer" }}>
                          {expanded[c.id] ? claimText(c) : headline(claimText(c), 90)}
                          {expanded[c.id] && <span className="prov">{provenance(c)}</span>}
                        </td>
                        <td>{entityMap.get(c.subject_id)?.name ?? "record"}</td>
                        <td className="m">{sourceMap.get(c.source_id ?? "")?.label ?? c.source_ref ?? "not recorded"}</td>
                        <td className="m">{c.grade ?? ""}</td>
                        <td className="m">{c.wave ?? 0}</td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label="Select claim"
                            checked={!!selected[c.id]}
                            onChange={(ev) => setSelected((s) => ({ ...s, [c.id]: ev.target.checked }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {notedList.length > 0 && (
                <>
                  <div className="psec">Your word, recorded {DOT} {notedList.length}</div>
                  {notedList.slice(0, 20).map(([id, n]) => {
                    const c = claims.find((x) => x.id === id);
                    return (
                      <div key={id} className="card">
                        <span className="badge b-conf">{n.verdict}</span>
                        {c ? headline(claimText(c)) : "claim"}
                        <div className="approve">
                          <button onClick={() => void undo([id], n.governing_ids)}>Undo</button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </section>
          )}

          {/* ------------------------------------------------------- AREA */}
          {view.kind === "area" && (() => {
            const def = areas.find((a) => a.id === view.id);
            if (!def) return <div className="empty">This area holds nothing yet.</div>;
            const areaClaims = def.entities.flatMap((e) => claimsBySubject.get(e.id) ?? []);
            const confirmed = areaClaims.filter((c) => c.status === "confirmed");
            const fresh = areaClaims.filter((c) => c.status === "staged" && c.predicate !== "same_as_candidate" && !noted[c.id]);
            return (
              <section>
                <h2>{def.title}</h2>
                <p className="sub">{def.blurb}</p>

                <div className="psec">The web around it</div>
                <div className="relrow">
                  {def.entities.map((e) => (
                    <button key={e.id} className="plink" onClick={() => setView({ kind: "profile", id: e.id })}>
                      {e.name}
                    </button>
                  ))}
                </div>

                {fresh.length > 0 && (
                  <>
                    <div className="psec">New here {DOT} {fresh.length}</div>
                    {fresh.slice(0, 6).map((c) => claimCard(c, true))}
                    {fresh.length > 6 && (
                      <button className="wbtn" onClick={() => setView({ kind: "delta" })}>
                        See all {fresh.length} in the Delta
                      </button>
                    )}
                  </>
                )}

                <div className="psec">On the record {DOT} {confirmed.length}</div>
                {confirmed.length === 0 && <div className="empty">Nothing confirmed here yet.</div>}
                {confirmed.map((c) => claimCard(c, false))}
              </section>
            );
          })()}

          {/* --------------------------------------------------- PROFILES */}
          {view.kind === "profiles" && (
            <section>
              <h2>The Profiles</h2>
              <p className="sub">Every record the graph holds, and the web around each one.</p>
              <input
                className="psearch"
                type="search"
                aria-label="Search the profiles"
                placeholder="Search the profiles"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="ptabs">
                {["ALL", ...typeCounts.keys()].map((t) => (
                  <button key={t} className={`ptab ${view.type === t ? "on" : ""}`} onClick={() => setView({ kind: "profiles", type: t })}>
                    {t} {t === "ALL" ? entities.length : typeCounts.get(t)}
                  </button>
                ))}
              </div>
              <div className="pgrid">
                {entities
                  .filter((e) => view.type === "ALL" || typeLabel(e.etype) === view.type)
                  .filter((e) => {
                    const n = search.trim().toLowerCase();
                    return !n || e.name.toLowerCase().includes(n) || String(e.tag ?? "").toLowerCase().includes(n);
                  })
                  .map((e) => (
                    <button key={e.id} className="pcard" onClick={() => setView({ kind: "profile", id: e.id })}>
                      <div className="ptype">{typeLabel(e.etype)}</div>
                      <div className="pname">{e.name}</div>
                      {e.tag && <div className="ptag">{e.tag}</div>}
                      {isSensitive(e.sensitivity) && <div style={{ marginTop: 7 }}><SensChip /></div>}
                    </button>
                  ))}
              </div>
            </section>
          )}

          {/* ---------------------------------------------------- PROFILE */}
          {view.kind === "profile" && (
            <section>
              <button className="backbtn" onClick={() => setView({ kind: "profiles", type: "ALL" })}>← All profiles</button>
              {profileErr && <div className="empty">This record is not available: {profileErr}</div>}
              {!profile && !profileErr && <div className="empty">Reading the record.</div>}
              {profile && (() => {
                const visible = profile.claims.filter((c) => c.predicate !== "governs" && ["staged", "confirmed"].includes(String(c.status)));
                const openItems = visible.filter((c) => c.predicate === "open_item");
                const facts = visible.filter((c) => c.predicate !== "open_item" && c.predicate !== "same_as_candidate");
                return (
                  <>
                    <div className="ptype">{typeLabel(profile.entity.etype)}</div>
                    <h2>{profile.entity.name}</h2>
                    <p className="sub">{profile.entity.tag ?? ""}</p>
                    {isSensitive(profile.entity.sensitivity) && <div style={{ marginBottom: 12 }}><SensChip /></div>}

                    <div className="psec">Facts on the record {DOT} {facts.length}</div>
                    {facts.length === 0 && <div className="empty">No facts recorded yet.</div>}
                    {facts.map((c) => claimCard(c, c.status === "staged"))}

                    {openItems.length > 0 && (
                      <>
                        <div className="psec">Open items {DOT} {openItems.length}</div>
                        {openItems.map((c) => (
                          <div key={c.id} className="openit">
                            {claimText(c)}
                            <span className="prov">{provenance(c)}</span>
                          </div>
                        ))}
                      </>
                    )}

                    <div className="psec">The web around it {DOT} {profile.edges.length}</div>
                    {profile.edges.length === 0 && <div className="empty">No relationships recorded.</div>}
                    <div className="relrow">
                      {profile.edges.map((edge) => {
                        const otherId = edge.src_id === profile.entity.id ? edge.dst_id : edge.src_id;
                        const other = entityMap.get(otherId);
                        return (
                          <button key={edge.id} className="plink" onClick={() => setView({ kind: "profile", id: otherId })}>
                            {String(edge.etype ?? "linked").replace(/[_-]+/g, " ")} {DOT} {other?.name ?? "record"}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </section>
          )}

          {/* ----------------------------------------------------- SOURCE */}
          {view.kind === "source" && (() => {
            const s = sourceMap.get(view.id);
            if (!s) return <div className="empty">That source is not on the record.</div>;
            const rows = claims.filter((c) => c.source_id === s.id && c.predicate !== "governs");
            const miner = typeof s.meta?.miner === "string" ? (s.meta.miner as string) : null;
            return (
              <section>
                <div className="ptype">{String(s.kind).toUpperCase()}</div>
                <h2>{s.label ?? s.kind}</h2>
                <p className="sub">
                  {miner ? `miner ${miner}` : "miner not recorded"} {DOT} wave {s.last_wave ?? 0} {DOT}{" "}
                  {s.last_mined_at ? `last mined ${new Date(s.last_mined_at).toISOString().slice(0, 10)}` : "never mined"} {DOT} {rows.length} claims
                </p>
                {rows.length === 0 && <div className="empty">No claims carry this source yet.</div>}
                {rows.slice(0, 100).map((c) => claimCard(c, c.status === "staged"))}
              </section>
            );
          })()}

          <footer className="wf mono">
            HQ Design {DOT} Light {DOT} Every claim from the mined record {DOT} Augmentation over automation
          </footer>
        </main>
      </div>
    </div>
  );
}

export default WorldSurface;
