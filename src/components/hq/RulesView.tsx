/** RULES · the second view on /hq/memories.
 *
 * Titles and state only. One line per rule, all detail in the shared drawer.
 * The client never writes to the rules themselves: every action files a
 * request through requestAction, which records the ask and nothing more.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { InspectorDrawer, InspectorField } from "@/components/hq/InspectorDrawer";
import { supabase } from "@/integrations/supabase/client";
import { requestAction } from "@/lib/hq-request-action";
import { hqAct } from "@/lib/hq-act";
import "@/hq-next/styles/hq-live.css";
import "@/hq-next/styles/hq-rules.css";

const DOT = "\u00b7";

export interface MineRule {
  id: string;
  title: string;
  scope: "LOCKED" | "SITUATIONAL" | string;
  status: "active" | "queued" | "pending-confirm" | "retired" | string;
  governs: boolean;
  age_days: number;
  rank: number | null;
  body_len: number | null;
  flagged: boolean;
}

export interface CanonRule {
  rule_id: string;
  title: string;
  tier: 1 | 2 | 3 | number;
  status: string;
  governs: boolean;
  version: number | string | null;
  superseded: boolean;
  ratified: boolean;
  age_days: number;
}

export interface RuleRelation {
  relation_id: string;
  kind: string;
  note: string | null;
  state: string;
  a_id: string;
  a_title: string;
  b_id: string;
  b_title: string;
}

interface RulesPayload {
  ok: boolean;
  cid?: string;
  mine?: MineRule[];
  canon?: CanonRule[];
  relations?: RuleRelation[];
  counts?: {
    mine_total: number;
    mine_governing: number;
    canon_total: number;
    canon_governing: number;
    flagged: number;
  };
}

const statusWord = (s: string): string => {
  switch (s.toLowerCase()) {
    case "active":
      return "in force";
    case "queued":
      return "waiting";
    case "pending-confirm":
      return "needs your yes";
    case "retired":
      return "retired";
    case "draft":
      return "draft";
    case "superseded":
      return "replaced";
    default:
      return s.toLowerCase();
  }
};

const ageWord = (d: number | null | undefined) =>
  d === null || d === undefined ? "no age" : `${d} ${d === 1 ? "day" : "days"} old`;

type Selection =
  | { kind: "mine"; row: MineRule }
  | { kind: "canon"; row: CanonRule }
  | null;

export function RulesView({ unauthenticated }: { unauthenticated: React.ReactNode }) {
  const [data, setData] = useState<RulesPayload | null>(null);
  const [failed, setFailed] = useState(false);

  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "LOCKED" | "SITUATIONAL">("all");
  const [status, setStatus] = useState<"all" | "active" | "queued" | "pending-confirm">("all");
  const [showRetired, setShowRetired] = useState(false);

  const [sel, setSel] = useState<Selection>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  /** Ranking asks for a number before it runs; nothing else on this view does. */
  const [rankAsk, setRankAsk] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void supabase
      .rpc("hq_rules_read")
      .then(({ data: d, error }) => {
        if (!live) return;
        if (error) {
          setFailed(true);
          return;
        }
        setData((d ?? { ok: false }) as unknown as RulesPayload);
      });
    return () => {
      live = false;
    };
  }, [nonce]);

  const mine = useMemo(() => data?.mine ?? [], [data]);
  const canon = useMemo(() => data?.canon ?? [], [data]);
  const relations = useMemo(() => data?.relations ?? [], [data]);

  const keep = useCallback(
    (r: MineRule) => {
      if (!showRetired && r.status === "retired") return false;
      if (scope !== "all" && r.scope !== scope) return false;
      if (status !== "all" && r.status !== status) return false;
      if (q.trim() && !r.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    },
    [q, scope, showRetired, status],
  );

  const governing = useMemo(() => mine.filter((r) => r.governs && keep(r)), [keep, mine]);
  const waiting = useMemo(
    () => mine.filter((r) => !r.governs && (r.status === "queued" || r.status === "pending-confirm") && keep(r)),
    [keep, mine],
  );
  const canonShown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return canon.filter((c) => {
      if (!showRetired && (c.status === "RETIRED" || c.status === "SUPERSEDED")) return false;
      if (qq && !String(c.title).toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [canon, q, showRetired]);

  const canonTiers = useMemo(() => {
    const map = new Map<number, CanonRule[]>();
    for (const c of canonShown) map.set(c.tier, [...(map.get(c.tier) ?? []), c]);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [canonShown]);

  const selRelations = useMemo(() => {
    if (!sel || sel.kind !== "mine") return [];
    return relations.filter((r) => r.a_id === sel.row.id || r.b_id === sel.row.id);
  }, [relations, sel]);

  const file = useCallback(
    async (action: string, params: Record<string, unknown>, title: string) => {
      setBusy(true);
      const res = await requestAction(action, params, title);
      setBusy(false);
      setSaid(res.line);
    },
    [],
  );

  /** Confirm, retire, restore and rank are the client's own authority: they
   *  take effect on the press. Rewording and sorting out an overlap need
   *  judgment, so those still go to the COB as a request. */
  const act = useCallback(
    async (action: string, id: string, params: Record<string, unknown> = {}) => {
      setBusy(true);
      const res = await hqAct(action, id, params);
      setBusy(false);
      setRankAsk(null);
      setSaid(res.human);
      if (res.ok) setNonce((n) => n + 1);
    },
    [],
  );


  if (failed || (data && data.ok === false)) return <>{unauthenticated}</>;
  if (!data) return <p className="plain">Opening your rules.</p>;

  const counts = data.counts ?? {
    mine_total: mine.length,
    mine_governing: governing.length,
    canon_total: canon.length,
    canon_governing: 0,
    flagged: relations.length,
  };

  const Row = ({ r }: { r: MineRule }) => (
    <button
      type="button"
      className="rrow"
      onClick={() => {
        setSel({ kind: "mine", row: r });
        setSaid(null);
      }}
    >
      <span className="rt">{r.title}</span>
      <span className={`rb${r.governs ? " gov" : ""}`}>{r.scope.toLowerCase()}</span>
      <span className="rb">{statusWord(r.status)}</span>
      <span className="rage">{ageWord(r.age_days)}</span>
      <span className="rflag">{r.flagged ? "\u25C6" : ""}</span>
    </button>
  );

  return (
    <div className="rules">
      <div className="rhead">
        <span className="rbig">{counts.mine_governing}</span>
        <span className="rsub">
          of {counts.mine_total} rules actually govern today
        </span>
        <span className="rsub">
          {counts.flagged} {counts.flagged === 1 ? "overlap" : "overlaps"} to sort out {DOT}{" "}
          {counts.canon_total} fleet rules
        </span>
      </div>

      <div className="rtools">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a word to find a rule"
          aria-label="Find a rule"
        />
        {(["all", "LOCKED", "SITUATIONAL"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`rtog${scope === s ? " on" : ""}`}
            aria-pressed={scope === s}
            onClick={() => setScope(s)}
          >
            {s === "all" ? "Any scope" : s.toLowerCase()}
          </button>
        ))}
        {(["all", "active", "queued", "pending-confirm"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`rtog${status === s ? " on" : ""}`}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s === "all" ? "Any state" : statusWord(s)}
          </button>
        ))}
        <button
          type="button"
          className={`rtog${showRetired ? " on" : ""}`}
          aria-pressed={showRetired}
          onClick={() => setShowRetired((v) => !v)}
        >
          Show retired
        </button>
      </div>

      <div className="rgroup">
        <div className="rgt">These govern</div>
        {governing.length === 0 && <div className="rempty">None match.</div>}
        {governing.map((r) => (
          <Row key={r.id} r={r} />
        ))}
      </div>

      <div className="rgroup">
        <div className="rgt">These do not govern yet</div>
        {waiting.length === 0 && <div className="rempty">None match.</div>}
        {waiting.map((r) => (
          <Row key={r.id} r={r} />
        ))}
      </div>

      <div className="rgroup">
        <div className="rgt">Fleet canon</div>
        {canonTiers.length === 0 && <div className="rempty">None match.</div>}
        {canonTiers.map(([tier, rowsForTier]) => (
          <div key={tier}>
            <div className="rtier">Tier {tier}</div>
            {rowsForTier.map((c) => (
              <button
                key={c.rule_id}
                type="button"
                className="rrow"
                onClick={() => {
                  setSel({ kind: "canon", row: c });
                  setSaid(null);
                }}
              >
                <span className="rt">{c.title}</span>
                <span className={`rb${c.governs ? " gov" : ""}`}>tier {c.tier}</span>
                <span className="rb">{statusWord(c.status)}</span>
                <span className="rage">{ageWord(c.age_days)}</span>
                <span className="rflag" />
              </button>
            ))}
          </div>
        ))}
      </div>

      <InspectorDrawer
        open={sel !== null}
        title={sel ? sel.kind === "mine" ? sel.row.title : sel.row.title : ""}
        subtitle={
          sel
            ? sel.kind === "mine"
              ? `${sel.row.scope.toLowerCase()} ${DOT} ${statusWord(sel.row.status)}`
              : `fleet canon ${DOT} tier ${sel.row.tier}`
            : undefined
        }
        onClose={() => {
          setSel(null);
          setSaid(null);
        }}
      >
        {sel?.kind === "mine" && (
          <>
            <InspectorField k="Scope" v={sel.row.scope.toLowerCase()} />
            <InspectorField k="State" v={statusWord(sel.row.status)} />
            <InspectorField k="Age" v={ageWord(sel.row.age_days)} />
            <InspectorField k="Rank" v={sel.row.rank ?? "not ranked"} />
            <InspectorField
              k="Rule text"
              v={
                sel.row.body_len
                  ? `${sel.row.body_len} characters. This read does not return the text.`
                  : "No text on file."
              }
            />

            {selRelations.length > 0 && (
              <>
                <h3>Named with other rules</h3>
                {selRelations.map((rel) => {
                  const other = rel.a_id === sel.row.id ? rel.b_title : rel.a_title;
                  return (
                    <div key={rel.relation_id}>
                      <InspectorField k={rel.kind} v={`${other}${rel.note ? ` ${DOT} ${rel.note}` : ""}`} />
                      {said === null && (
                        <div className="rax">
                          <button
                            type="button"
                            className="ghost"
                            disabled={busy}
                            onClick={() =>
                              void file(
                                "rule.resolve_overlap",
                                { relation_id: rel.relation_id },
                                `Resolve overlap: ${rel.a_title} and ${rel.b_title}`,
                              )
                            }
                          >
                            Resolve this overlap
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {said === null ? (
              <div className="rax">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void file("rule.confirm", { directive_id: sel.row.id }, `Confirm: ${sel.row.title}`)
                  }
                >
                  Confirm into force
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() =>
                    void file("rule.reword", { directive_id: sel.row.id }, `Reword: ${sel.row.title}`)
                  }
                >
                  Reword this rule
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() =>
                    void file("rule.retire", { directive_id: sel.row.id }, `Retire: ${sel.row.title}`)
                  }
                >
                  Retire this rule
                </button>
              </div>
            ) : (
              <p className="rsaid">{said}</p>
            )}
          </>
        )}

        {sel?.kind === "canon" && (
          <>
            <InspectorField k="Tier" v={`tier ${sel.row.tier}`} />
            <InspectorField k="State" v={statusWord(sel.row.status)} />
            <InspectorField k="Age" v={ageWord(sel.row.age_days)} />
            <InspectorField k="Version" v={sel.row.version ?? "none"} />
            <InspectorField k="Replaced" v={sel.row.superseded ? "yes" : "no"} />
            <InspectorField k="Signed off" v={sel.row.ratified ? "yes" : "no"} />
            <p className="rsaid">Fleet rules are set for the whole fleet. You can read them here, and only the fleet can change them.</p>
          </>
        )}
      </InspectorDrawer>
    </div>
  );
}

export default RulesView;
