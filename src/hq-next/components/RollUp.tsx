/** ROLL UP ROW · /hq is where the other pages surface.
 *
 * One card each for Your World, Memories and BOB Blueprints. Each card carries a
 * live count and the single most recent item from that page, and the whole card
 * navigates. Read only: nothing here writes.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { callWorld, type LaneRow } from "@/lib/world-lanes";
import "../styles/rollup.css";

interface CardState {
  count: number | null;
  latest: string | null;
  when: string | null;
  failed: boolean;
}

const BLANK: CardState = { count: null, latest: null, when: null, failed: false };

function when(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function newest<T>(rows: T[], key: (r: T) => string | null | undefined): T | null {
  let best: T | null = null;
  let bestT = -Infinity;
  for (const r of rows) {
    const v = key(r);
    const t = v ? new Date(v).getTime() : NaN;
    if (Number.isFinite(t) && t > bestT) {
      bestT = t;
      best = r;
    }
  }
  return best ?? rows[0] ?? null;
}

export function RollUp() {
  const nav = useNavigate();
  const [world, setWorld] = useState<CardState>(BLANK);
  const [mem, setMem] = useState<CardState>(BLANK);
  const [bob, setBob] = useState<CardState>(BLANK);

  useEffect(() => {
    let live = true;

    void callWorld<{ rows: LaneRow[] }>("lanes")
      .then((d) => {
        if (!live) return;
        const rows = d.rows ?? [];
        const top = newest(rows, (r) => r.updated_at);
        setWorld({
          count: rows.length,
          latest: top ? top.label : null,
          when: when(top?.updated_at),
          failed: false,
        });
      })
      .catch(() => live && setWorld({ ...BLANK, failed: true }));

    const rpc = (fn: string, args?: Record<string, unknown>) =>
      (
        supabase as never as {
          rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc(fn, args);

    void rpc("hq_memory_read", { p_limit: 500, p_offset: 0 })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) throw new Error("memory_read_failed");
        const rows = (data ?? []) as { title: string; created_at?: string | null; updated_at?: string | null }[];
        const top = newest(rows, (r) => r.updated_at ?? r.created_at);
        setMem({
          count: rows.length,
          latest: top?.title ?? null,
          when: when(top?.updated_at ?? top?.created_at),
          failed: false,
        });
      })
      .catch(() => live && setMem({ ...BLANK, failed: true }));

    void rpc("hq_blueprints_read")
      .then(({ data, error }) => {
        if (!live) return;
        if (error) throw new Error("blueprints_read_failed");
        const rows = (data ?? []) as { title: string; updated_at?: string | null }[];
        const top = newest(rows, (r) => r.updated_at);
        setBob({
          count: rows.length,
          latest: top?.title ?? null,
          when: when(top?.updated_at),
          failed: false,
        });
      })
      .catch(() => live && setBob({ ...BLANK, failed: true }));

    return () => {
      live = false;
    };
  }, []);

  const cards: { k: string; label: string; to: string; blurb: string; s: CardState }[] = [
    { k: "w", label: "Your World", to: "/hq/world", blurb: "folders", s: world },
    { k: "m", label: "Memories", to: "/hq/memories", blurb: "memories", s: mem },
    { k: "b", label: "BOB \u00b7 Blueprints", to: "/hq/blueprints", blurb: "plans", s: bob },
  ];

  return (
    <div className="rollup" aria-label="Your pages">
      {cards.map((c) => (
        <button key={c.k} type="button" className="ru-card" onClick={() => nav(c.to)}>
          <span className="ru-k">{c.label}</span>
          <span className="ru-n">{c.s.count === null ? (c.s.failed ? "\u2014" : "") : c.s.count}</span>
          <span className="ru-b">{c.blurb}</span>
          <span className="ru-l">
            {c.s.failed
              ? "this card could not read its page just now"
              : c.s.latest
                ? c.s.latest
                : c.s.count === 0
                  ? "nothing here yet"
                  : ""}
          </span>
          {c.s.when && <span className="ru-w">last touched {c.s.when}</span>}
        </button>
      ))}
    </div>
  );
}

export default RollUp;
