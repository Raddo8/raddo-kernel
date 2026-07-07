import { useMemo } from "react";
import { startOfMonth, endOfMonth, addMonths, isSameMonth, format } from "date-fns";
import {
  Schedule, bucketize, fmtUsd, type OverrideIndex,
} from "@/lib/revenue-math";

interface Props {
  quarterStart: Date;
  schedules: Schedule[];
  overridesByScheduleId: OverrideIndex;
  stageProbForItem: (itemId: string | null) => number;
}

/**
 * Monthly summary strip · sits above/below the 13-week ribbon in Quarter view.
 * Numbers derive from the same shared `bucketize` used by the ribbon and ledger.
 */
export default function MonthStrip({ quarterStart, schedules, overridesByScheduleId, stageProbForItem }: Props) {
  const months = useMemo(() => {
    // Cover all months touched by the 13-week window (usually 3-4).
    const first = startOfMonth(quarterStart);
    const out: { start: Date; end: Date }[] = [];
    for (let i = 0; i < 4; i++) {
      const start = addMonths(first, i);
      out.push({ start, end: endOfMonth(start) });
    }
    return out;
  }, [quarterStart]);

  const cards = useMemo(() => months.map(m => {
    const b = bucketize(schedules, { start: m.start, end: m.end }, stageProbForItem, overridesByScheduleId);
    const mrr = schedules.reduce((a, s) => {
      if (s.counted === false) return a;
      if (s.status === "cancelled") return a;
      if (s.cadence !== "monthly") return a;
      // Count subscriptions that have an occurrence landing in this month.
      const has = (overridesByScheduleId[s.id] || []).some(o => isSameMonth(new Date(o.occurrence_month), m.start));
      // Fall back to simple "active/expected in month" via bucketize rows.
      const inMonth = b.rows.some(r => r.schedule.id === s.id);
      return inMonth ? a + Number(s.amount_usd || 0) : a;
    }, 0);
    const total = b.committed + b.expected;
    return { month: m.start, committed: b.committed, expected: b.expected, total, mrr };
  }), [months, schedules, overridesByScheduleId, stageProbForItem]);

  return (
    <div className="border border-dossier-brass/30 rounded bg-muted/10 p-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
        Monthly summary · same source as weekly buckets
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}>
        {cards.map(c => (
          <div key={c.month.toISOString()} className="border border-border rounded p-2 bg-background/40">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {format(c.month, "MMMM yyyy")}
            </div>
            <div className="text-lg font-mono mt-1">{fmtUsd(c.total)}</div>
            <div className="text-[10px] font-mono mt-1 space-y-0.5">
              <div><span className="text-status-green">committed</span> {fmtUsd(c.committed)}</div>
              <div><span className="text-dossier-brass">expected</span> {fmtUsd(c.expected)}</div>
              <div className="pt-1 border-t border-border/60"><span className="text-muted-foreground">MRR in month</span> {fmtUsd(c.mrr)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
