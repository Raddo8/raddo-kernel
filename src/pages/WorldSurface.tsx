/** THE WORLD · /hq/world
 *
 * W1c. Every byte on this surface comes from the live graph through the
 * world-graph edge function (actions: delta, entities, sources, profile,
 * govern, merge). Nothing is hand authored, nothing is hardcoded.
 *
 * Render law:
 *  · privileged / third-party-npi never reach the client (function withholds
 *    them); this file does not special-case around that.
 *  · sensitive rows render muted with a SENSITIVE · HELD WITH CARE chip.
 *  · flagged / voided / superseded claims never render in profiles.
 *  · grade renders verbatim in the provenance line.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import "@/hq-next/styles/hq-design.css";
import "@/hq-next/styles/hq-world.css";

/* ------------------------------------------------------------- contracts */

interface DeltaRow {
  claim_id: string;
  subject_id: string;
  predicate: string;
  value_text: string | null;
  source_ref: string | null;
  grade: string | null;
  sensitivity: string | null;
  observed_at: string | null;
}

interface EntityRow {
  id: string;
  etype: string;
  name: string;
  tag: string | null;
  status: string | null;
  sensitivity: string | null;
  updated_at: string | null;
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

interface ClaimRow extends DeltaRow {
  id: string;
  status: string | null;
  object_id: string | null;
  confidence: number | null;
  miner: string | null;
  wave: number | null;
}

interface EdgeRow {
  id: string;
  src_id: string;
  dst_id: string;
  etype: string;
  meta: Record<string, unknown> | null;
}

interface ProfilePayload {
  entity: EntityRow & { meta?: Record<string, unknown> | null };
  claims: ClaimRow[];
  edges: EdgeRow[];
}

type Register = "delta" | "profiles" | "sources";

type NotedState = { verdict: string; text: string };

/* --------------------------------------------------------------- helpers */

async function callWorld<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("world-graph", {
    body: { action, ...body },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(String(data?.error ?? "world_graph_error"));
  return data as T;
}

const TYPE_LABEL: Record<string, string> = {
  person: "PERSON",
  business: "BUSINESS",
  org: "BUSINESS",
  organization: "BUSINESS",
  company: "BUSINESS",
  case: "CASE",
  matter: "CASE",
  property: "PROPERTY",
  asset: "PROPERTY",
};

function typeLabel(etype: string | null | undefined): string {
  const key = String(etype ?? "").toLowerCase();
  return TYPE_LABEL[key] ?? (key.replace(/[_-]+/g, " ").toUpperCase() || "ENTITY");
}

/** Predicate + value read as one plain sentence fragment. */
function claimText(predicate: string, value: string | null): string {
  const p = String(predicate ?? "").replace(/[_-]+/g, " ").trim();
  const v = (value ?? "").trim();
  if (!v) return p;
  return `${p} \u00b7 ${v}`;
}

function provenance(row: { source_ref?: string | null; grade?: string | null; observed_at?: string | null }): string {
  const bits: string[] = [];
  if (row.source_ref) bits.push(row.source_ref);
  if (row.grade) bits.push(row.grade);
  if (row.observed_at) bits.push(new Date(row.observed_at).toISOString().slice(0, 10));
  return bits.join(`  ${DOT}  `);
}

const DOT = "\u00b7";

const isSensitive = (s: string | null | undefined) => String(s ?? "") === "sensitive";

/* -------------------------------------------------------------- fragments */

function SensitiveChip() {
  return <span className="g warn">Sensitive {DOT} held with care</span>;
}

function Chips({ children }: { children: React.ReactNode }) {
  return <div className="crow">{children}</div>;
}

/* ------------------------------------------------------------ delta card */

function DeltaClaimCard({
  row,
  entities,
  noted,
  onGovern,
  onMerge,
}: {
  row: DeltaRow;
  entities: Map<string, EntityRow>;
  noted: NotedState | undefined;
  onGovern: (claimId: string, action: "confirm" | "flag" | "explain", note?: string) => Promise<void>;
  onMerge: (claimId: string, entityId: string, intoId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const sensitive = isSensitive(row.sensitivity);
  const mergeQuestion = row.predicate === "same_as_candidate";
  const other = mergeQuestion && row.value_text ? entities.get(row.value_text) : undefined;
  const subject = entities.get(row.subject_id);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`wcard ${sensitive ? "muted" : ""}`}>
      <Chips>
        {!noted && <span className="g brass">New</span>}
        {sensitive && <SensitiveChip />}
        {mergeQuestion && <span className="g navy">Merge question</span>}
      </Chips>
      <p className="claim" style={{ marginTop: 10 }}>
        {mergeQuestion
          ? `Is ${subject?.name ?? "this record"} the same as ${other?.name ?? "an existing record"}?`
          : claimText(row.predicate, row.value_text)}
      </p>
      <p className="prov">{provenance(row) || "no source reference recorded"}</p>

      {noted ? (
        <p className="noted">
          Noted {DOT} {noted.verdict}. Written to your record as: {noted.text}
        </p>
      ) : mergeQuestion ? (
        <div className="arail">
          <button
            className="ab primary"
            disabled={busy || !row.value_text}
            onClick={() => run(() => onMerge(row.claim_id, row.subject_id, String(row.value_text)))}
          >
            Keep as one
          </button>
          <button className="ab" disabled={busy} onClick={() => run(() => onGovern(row.claim_id, "flag"))}>
            Keep separate
          </button>
        </div>
      ) : (
        <>
          <div className="arail">
            <button className="ab primary" disabled={busy} onClick={() => run(() => onGovern(row.claim_id, "confirm"))}>
              Confirm into my record
            </button>
            <button className="ab" disabled={busy} onClick={() => run(() => onGovern(row.claim_id, "flag"))}>
              Flag as wrong
            </button>
            <button className="ab" disabled={busy} onClick={() => setNoteOpen((v) => !v)}>
              Explain
            </button>
          </div>
          {noteOpen && (
            <div className="noteform">
              <input
                type="text"
                value={note}
                placeholder="One line of context"
                aria-label="Explanation note"
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                className="ab"
                disabled={busy || !note.trim()}
                onClick={() => run(() => onGovern(row.claim_id, "explain", note.trim()))}
              >
                Record note
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export function WorldSurface() {
  const [register, setRegister] = useState<Register>("delta");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [delta, setDelta] = useState<DeltaRow[]>([]);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [cid, setCid] = useState<string>("");
  const [noted, setNoted] = useState<Record<string, NotedState>>({});

  const [query, setQuery] = useState("");
  const [typeTab, setTypeTab] = useState<string>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [d, e, s] = await Promise.all([
        callWorld<{ rows: DeltaRow[]; cid: string }>("delta"),
        callWorld<{ rows: EntityRow[] }>("entities"),
        callWorld<{ rows: SourceRow[] }>("sources"),
      ]);
      setDelta(d.rows ?? []);
      setEntities(e.rows ?? []);
      setSources(s.rows ?? []);
      setCid(d.cid ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "read_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openId) {
      setProfile(null);
      setProfileErr(null);
      return;
    }
    let live = true;
    setProfile(null);
    setProfileErr(null);
    callWorld<ProfilePayload>("profile", { entity_id: openId })
      .then((p) => live && setProfile(p))
      .catch((e) => live && setProfileErr(e instanceof Error ? e.message : "profile_failed"));
    return () => {
      live = false;
    };
  }, [openId]);

  const entityMap = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  const pending = useMemo(() => delta.filter((r) => !noted[r.claim_id]), [delta, noted]);

  const grouped = useMemo(() => {
    const m = new Map<string, DeltaRow[]>();
    for (const r of delta) {
      const list = m.get(r.subject_id) ?? [];
      list.push(r);
      m.set(r.subject_id, list);
    }
    return [...m.entries()].sort((a, b) => {
      const an = entityMap.get(a[0])?.name ?? "";
      const bn = entityMap.get(b[0])?.name ?? "";
      return an.localeCompare(bn);
    });
  }, [delta, entityMap]);

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entities) {
      const k = typeLabel(e.etype);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entities]);

  const visibleEntities = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entities.filter((e) => {
      if (typeTab !== "ALL" && typeLabel(e.etype) !== typeTab) return false;
      if (!q) return true;
      return `${e.name} ${e.tag ?? ""} ${e.etype}`.toLowerCase().includes(q);
    });
  }, [entities, query, typeTab]);

  /* ------------------------------------------------------------- actions */

  const handleGovern = async (claimId: string, action: "confirm" | "flag" | "explain", note?: string) => {
    try {
      const res = await callWorld<{ claim_status: string; governing_claim_id: string }>("govern", {
        claim_id: claimId,
        action,
        note: note ?? null,
      });
      setNoted((prev) => ({
        ...prev,
        [claimId]: {
          verdict: `${action} \u00b7 claim now ${res.claim_status}`,
          text: note ? `${action}: ${note}` : action,
        },
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "govern_failed");
    }
  };

  const handleMerge = async (claimId: string, entityId: string, intoId: string) => {
    try {
      await callWorld<{ claim_id: string }>("merge", { entity_id: entityId, into_id: intoId });
      setNoted((prev) => ({
        ...prev,
        [claimId]: { verdict: "kept as one", text: "merged_into (client-asserted)" },
      }));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "merge_failed");
    }
  };

  /* -------------------------------------------------------------- render */

  const profileClaims = (profile?.claims ?? []).filter((c) =>
    ["staged", "confirmed"].includes(String(c.status ?? "")),
  );
  const openItems = profileClaims.filter((c) => c.predicate === "open_item");
  const facts = profileClaims.filter((c) => c.predicate !== "open_item");

  return (
    <div className="hqd world">
      <div className="shell">
        <nav className="rail" aria-label="World registers">
          <button className={`rb ${register === "delta" ? "on" : ""}`} onClick={() => setRegister("delta")}>
            The Delta <span className="n">{pending.length}</span>
          </button>
          <button className={`rb ${register === "profiles" ? "on" : ""}`} onClick={() => setRegister("profiles")}>
            The Profiles <span className="n">{entities.length}</span>
          </button>
          <button className={`rb ${register === "sources" ? "on" : ""}`} onClick={() => setRegister("sources")}>
            The Sources <span className="n">{sources.length}</span>
          </button>
          <p className="rail-note">{cid ? `Tenant ${cid}` : "Tenant resolving"}</p>
        </nav>

        <main>
          {err && (
            <div className="empty" role="alert" style={{ marginTop: 0 }}>
              Could not complete that read or write: {err}
            </div>
          )}

          {register === "delta" && (
            <section>
              <header className="head">
                <p className="kick">Register one</p>
                <h1>The Delta</h1>
                <p>
                  New claims mined from your record, waiting on your word. Confirm what is right, flag what is wrong,
                  explain what needs context. Every ruling is written back as your own claim.
                </p>
              </header>

              {loading && <div className="empty">Reading the graph.</div>}
              {!loading && grouped.length === 0 && <div className="empty">Nothing staged. The delta is clear.</div>}

              {grouped.map(([subjectId, rows]) => {
                const ent = entityMap.get(subjectId);
                return (
                  <div key={subjectId}>
                    <p className="sub">
                      {ent ? `${ent.name} \u00b7 ${typeLabel(ent.etype)}` : "Unattached subject"} {DOT} {rows.length}
                    </p>
                    <div className="wgrid">
                      {rows.map((r) => (
                        <DeltaClaimCard
                          key={r.claim_id}
                          row={r}
                          entities={entityMap}
                          noted={noted[r.claim_id]}
                          onGovern={handleGovern}
                          onMerge={handleMerge}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {register === "profiles" && !openId && (
            <section>
              <header className="head">
                <p className="kick">Register two</p>
                <h1>The Profiles</h1>
                <p>Every person, business, case, and property the graph currently holds for you.</p>
              </header>

              <div className="tabs">
                <button className={`tab ${typeTab === "ALL" ? "on" : ""}`} onClick={() => setTypeTab("ALL")}>
                  All {entities.length}
                </button>
                {typeCounts.map(([label, n]) => (
                  <button
                    key={label}
                    className={`tab ${typeTab === label ? "on" : ""}`}
                    onClick={() => setTypeTab(label)}
                  >
                    {label} {n}
                  </button>
                ))}
              </div>

              <div className="tabs">
                <input
                  type="search"
                  value={query}
                  aria-label="Search profiles"
                  placeholder="Search by name or tag"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              {loading && <div className="empty">Reading the graph.</div>}
              {!loading && visibleEntities.length === 0 && <div className="empty">No records match that search.</div>}

              <div className="wgrid">
                {visibleEntities.map((e) => (
                  <button
                    key={e.id}
                    className={`wcard ${isSensitive(e.sensitivity) ? "muted" : ""}`}
                    onClick={() => setOpenId(e.id)}
                  >
                    <p className="nm">{e.name}</p>
                    <Chips>
                      <span className="g navy">{typeLabel(e.etype)}</span>
                      {e.tag && <span className="g">{e.tag}</span>}
                      {isSensitive(e.sensitivity) && <SensitiveChip />}
                    </Chips>
                  </button>
                ))}
              </div>
            </section>
          )}

          {register === "profiles" && openId && (
            <section>
              <div className="tabs" style={{ marginTop: 0 }}>
                <button className="tab" onClick={() => setOpenId(null)}>
                  Back to profiles
                </button>
              </div>

              {profileErr && <div className="empty">This record is not available: {profileErr}</div>}
              {!profile && !profileErr && <div className="empty">Reading the record.</div>}

              {profile && (
                <>
                  <header className="head" style={{ marginTop: 18 }}>
                    <p className="kick">{typeLabel(profile.entity.etype)}</p>
                    <h1>{profile.entity.name}</h1>
                    <Chips>
                      {profile.entity.tag && <span className="g">{profile.entity.tag}</span>}
                      {profile.entity.status && <span className="g navy">{profile.entity.status}</span>}
                      {isSensitive(profile.entity.sensitivity) && <SensitiveChip />}
                    </Chips>
                  </header>

                  <p className="sub">Facts on the record {DOT} {facts.length}</p>
                  {facts.length === 0 && <div className="empty">No facts recorded yet.</div>}
                  <div className="wgrid">
                    {facts.map((c) => (
                      <div key={c.id} className={`wcard ${isSensitive(c.sensitivity) ? "muted" : ""}`}>
                        <Chips>
                          {c.status === "confirmed" ? (
                            <span className="g navy">Confirmed</span>
                          ) : (
                            <span className="g brass">New</span>
                          )}
                          {isSensitive(c.sensitivity) && <SensitiveChip />}
                        </Chips>
                        <p className="claim" style={{ marginTop: 10 }}>
                          {claimText(c.predicate, c.value_text)}
                        </p>
                        <p className="prov">{provenance(c) || "no source reference recorded"}</p>
                      </div>
                    ))}
                  </div>

                  {openItems.length > 0 && (
                    <>
                      <p className="sub">Open items {DOT} {openItems.length}</p>
                      <div className="wgrid">
                        {openItems.map((c) => (
                          <div key={c.id} className="openitem">
                            <p className="claim">{c.value_text ?? "open item"}</p>
                            <p className="prov">{provenance(c) || "no source reference recorded"}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <p className="sub">Related {DOT} {profile.edges.length}</p>
                  {profile.edges.length === 0 && <div className="empty">No relationships recorded.</div>}
                  <div className="tabs">
                    {profile.edges.map((edge) => {
                      const otherId = edge.src_id === profile.entity.id ? edge.dst_id : edge.src_id;
                      const other = entityMap.get(otherId);
                      return (
                        <button key={edge.id} className="relchip" onClick={() => setOpenId(otherId)}>
                          {String(edge.etype ?? "linked").replace(/[_-]+/g, " ")} {DOT} {other?.name ?? "record"}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {register === "sources" && (
            <section>
              <header className="head">
                <p className="kick">Register three</p>
                <h1>The Sources</h1>
                <p>Where the record came from, and when it was last read.</p>
              </header>

              {loading && <div className="empty">Reading the graph.</div>}
              {!loading && sources.length === 0 && <div className="empty">No sources connected yet.</div>}

              <div className="wgrid">
                {sources.map((s) => {
                  const miner = typeof s.meta?.miner === "string" ? (s.meta.miner as string) : null;
                  return (
                    <div key={s.id} className="wcard">
                      <p className="nm">{s.label ?? s.kind}</p>
                      <Chips>
                        <span className="g navy">{String(s.kind).toUpperCase()}</span>
                        {s.scope && <span className="g">{s.scope}</span>}
                      </Chips>
                      <p className="prov">
                        {miner ? `miner ${miner}` : "miner not recorded"}
                        {`  ${DOT}  `}wave {s.last_wave ?? 0}
                        {`  ${DOT}  `}
                        {s.last_mined_at ? `last mined ${new Date(s.last_mined_at).toISOString().slice(0, 10)}` : "never mined"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <p className="wfoot">
            HQ Design {DOT} Light {DOT} Every claim from the mined record {DOT} Augmentation over automation
          </p>
        </main>
      </div>
    </div>
  );
}

export default WorldSurface;
