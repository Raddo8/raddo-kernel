/** RegisterPage · the one page shape every HQ register uses.
 *
 * Governing rule for HQ pages: titles and state, never blocks of prose. One
 * line per row; all detail lives in the shared InspectorDrawer. Verbs run
 * through hq_act and take effect on the press — the sentence the database
 * returns is rendered verbatim.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import HqShell from "@/components/hq/HqShell";
import { InspectorDrawer, InspectorField } from "@/components/hq/InspectorDrawer";
import { supabase } from "@/integrations/supabase/client";
import { hqAct } from "@/lib/hq-act";
import "@/hq-next/styles/hq-live.css";
import "@/hq-next/styles/hq-registers.css";

export const DOT = "\u00b7";

export interface RegisterVerb<T> {
  /** hq_act action key, e.g. "task.close". */
  action: string;
  label: string;
  ghost?: boolean;
  /** Hide the verb when it makes no sense for this row. */
  show?: (row: T) => boolean;
  /** Fixed params. */
  params?: (row: T) => Record<string, unknown>;
  /** Ask for one value before the verb runs. */
  ask?: { key: string; label: string; placeholder?: string };
}

export interface RegisterSpec<T> {
  /** SECURITY DEFINER read function. Takes p_limit, returns {ok,cid,counts,items}. */
  rpc: string;
  crumb: string;
  heading: string;
  /** Plain-words line under the heading. */
  sub: string;
  limit?: number;
  /** The count this page leads with. */
  leadKey: string;
  leadWords: (n: number) => string;
  /** The rest of the counts, in reading order. */
  kpis: { key: string; label: string }[];
  idOf: (row: T) => string;
  titleOf: (row: T) => string;
  /** Up to three short state cells, right of the title. */
  cells: (row: T) => { text: string; mark?: boolean }[];
  fields: (row: T) => { k: string; v: ReactNode }[];
  verbs: RegisterVerb<T>[];
  /** Word match for the find box. */
  haystack: (row: T) => string;
  emptyWords: string;
}

interface Payload<T> {
  ok: boolean;
  reason?: string;
  cid?: string;
  counts?: Record<string, number | null>;
  items?: T[];
}

export function RegisterPage<T>({ spec }: { spec: RegisterSpec<T> }) {
  const [data, setData] = useState<Payload<T> | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<T | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<{ verb: RegisterVerb<T>; value: string } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    void supabase
      .rpc(spec.rpc as never, { p_limit: spec.limit ?? 200 } as never)
      .then(({ data: d, error }) => {
        if (!live) return;
        if (error) {
          setFailed(true);
          return;
        }
        setData((d ?? { ok: false }) as unknown as Payload<T>);
      });
    return () => {
      live = false;
    };
  }, [spec.rpc, spec.limit, nonce]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((r) => spec.haystack(r).toLowerCase().includes(needle));
  }, [items, q, spec]);

  const run = useCallback(
    async (verb: RegisterVerb<T>, row: T, extra: Record<string, unknown> = {}) => {
      setBusy(true);
      const res = await hqAct(verb.action, spec.idOf(row), {
        ...(verb.params ? verb.params(row) : {}),
        ...extra,
      });
      setBusy(false);
      setAsking(null);
      setSaid(res.human);
      if (res.ok) setNonce((n) => n + 1);
    },
    [spec],
  );

  const signedOut = (
    <div className="lv">
      <p className="lv-sub">You are signed out. Sign in and your {spec.heading.toLowerCase()} come back.</p>
    </div>
  );

  let body: ReactNode;
  if (failed || (data && data.ok === false)) {
    body = signedOut;
  } else if (!data) {
    body = (
      <div className="lv">
        <p className="lv-sub">Opening your {spec.heading.toLowerCase()}.</p>
      </div>
    );
  } else {
    const counts = data.counts ?? {};
    const lead = Number(counts[spec.leadKey] ?? 0);
    body = (
      <div className="lv">
        <div className="lv-crumb">{spec.crumb}</div>
        <h1 className="lv-h1">{spec.heading}</h1>
        <p className="lv-sub">{spec.sub}</p>

        <div className="reg-lead">
          <span className="reg-big">{lead}</span>
          <span className="reg-lead-words">{spec.leadWords(lead)}</span>
        </div>

        <div className="reg-kpis">
          {spec.kpis.map((k) => (
            <span className="reg-kpi" key={k.key}>
              <b>{counts[k.key] ?? 0}</b> {k.label}
            </span>
          ))}
        </div>

        <div className="reg-tools">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a word to find one"
            aria-label={`Find in ${spec.heading}`}
          />
        </div>

        <div className="reg-rows">
          {shown.length === 0 && <div className="reg-empty">{spec.emptyWords}</div>}
          {shown.map((row) => (
            <button
              key={spec.idOf(row)}
              type="button"
              className="reg-row"
              onClick={() => {
                setSel(row);
                setSaid(null);
                setAsking(null);
              }}
            >
              <span className="reg-t">{spec.titleOf(row)}</span>
              {spec.cells(row).map((c, i) => (
                <span key={i} className={`reg-c${c.mark ? " mark" : ""}`}>
                  {c.text}
                </span>
              ))}
            </button>
          ))}
        </div>

        <InspectorDrawer
          open={sel !== null}
          title={sel ? spec.titleOf(sel) : ""}
          subtitle={sel ? spec.cells(sel).map((c) => c.text).filter(Boolean).join(` ${DOT} `) : undefined}
          onClose={() => {
            setSel(null);
            setSaid(null);
            setAsking(null);
          }}
        >
          {sel && (
            <>
              {spec.fields(sel).map((f) => (
                <InspectorField key={f.k} k={f.k} v={f.v} />
              ))}

              {asking ? (
                <div className="reg-prompt">
                  <input
                    autoFocus
                    value={asking.value}
                    placeholder={asking.verb.ask?.placeholder ?? ""}
                    aria-label={asking.verb.ask?.label ?? asking.verb.label}
                    onChange={(e) => setAsking({ verb: asking.verb, value: e.target.value })}
                  />
                  <button
                    type="button"
                    disabled={busy || !asking.value.trim()}
                    onClick={() =>
                      void run(asking.verb, sel, { [asking.verb.ask!.key]: asking.value.trim() })
                    }
                  >
                    {asking.verb.label}
                  </button>
                  <button type="button" className="ghost" onClick={() => setAsking(null)}>
                    Never mind
                  </button>
                </div>
              ) : (
                <div className="reg-acts">
                  {spec.verbs
                    .filter((v) => (v.show ? v.show(sel) : true))
                    .map((v) => (
                      <button
                        key={v.action}
                        type="button"
                        className={v.ghost ? "ghost" : undefined}
                        disabled={busy}
                        onClick={() => {
                          setSaid(null);
                          if (v.ask) setAsking({ verb: v, value: "" });
                          else void run(v, sel);
                        }}
                      >
                        {v.label}
                      </button>
                    ))}
                </div>
              )}

              {said && <p className="reg-said">{said}</p>}
            </>
          )}
        </InspectorDrawer>
      </div>
    );
  }

  return <HqShell>{body}</HqShell>;
}

export default RegisterPage;

/** Shared word helpers. Every page says days and minutes the same way. */
export const days = (n: number | null | undefined) =>
  n === null || n === undefined ? "no age" : `${n} ${n === 1 ? "day" : "days"} old`;

export const mins = (n: number | null | undefined) =>
  n === null || n === undefined ? "no length" : `${n} ${n === 1 ? "minute" : "minutes"}`;

export const when = (iso: string | null | undefined) => {
  if (!iso) return "no date";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "no date"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
