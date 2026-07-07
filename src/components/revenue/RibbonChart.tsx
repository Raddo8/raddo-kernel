import { useMemo, useState, useRef } from "react";
import { format } from "date-fns";
import {
  Schedule, amt, fmtUsd, expandOccurrences, COMMITTED_STATUSES, EXPECTED_STATUSES,
  type OccurrenceOverride, type OverrideIndex,
} from "@/lib/revenue-math";
import { assignColors } from "@/lib/account-colors";
import { Pencil } from "lucide-react";

export type BandBy = "account" | "stage" | "status";

export interface RibbonBucket {
  key: string;
  label: string;
  sub: string;
  start: Date;
  end: Date;
}

interface Props {
  buckets: RibbonBucket[];
  schedules: Schedule[];
  band: BandBy;
  showForecast: boolean;
  itemStateName: (itemId: string | null) => string;
  itemStageProb: (itemId: string | null) => number;
  accountName: (id: string) => string;
  onSegmentClick?: (payload: { seriesKey: string; seriesLabel: string; bucket: RibbonBucket }) => void;
  onOccurrenceEdit?: (payload: {
    schedule: Schedule; baseDate: Date; amount: number; date: Date; override: OccurrenceOverride | null;
  }) => void;
  overridesByScheduleId?: OverrideIndex;
}

interface OccEntry {
  s: Schedule; v: number; baseDate: Date; date: Date; override: OccurrenceOverride | null;
}

interface Segment {
  key: string;
  label: string;
  value: number;
  entries: OccEntry[];
}

interface BucketAgg { bucket: RibbonBucket; segments: Segment[]; total: number; }

function aggregate(props: Props): BucketAgg[] {
  const { buckets, schedules, band, showForecast, itemStateName, itemStageProb, accountName, overridesByScheduleId = {} } = props;
  return buckets.map(b => {
    const bySeries = new Map<string, Segment>();
    const push = (key: string, label: string, value: number, entry: OccEntry) => {
      if (value <= 0) return;
      let seg = bySeries.get(key);
      if (!seg) { seg = { key, label, value: 0, entries: [] }; bySeries.set(key, seg); }
      seg.value += value;
      seg.entries.push(entry);
    };

    for (const s of schedules) {
      if (s.status === "cancelled") continue;
      const occs = expandOccurrences(s, b.start, b.end, overridesByScheduleId[s.id] || []);
      for (const o of occs) {
        const isCommitted = o.committed;
        const isExpected = o.expected;
        const entry: OccEntry = { s, v: o.amount, baseDate: o.baseDate, date: o.date, override: o.override };
        if (band === "account") {
          if (!isCommitted && !isExpected) continue;
          push(s.account_id, accountName(s.account_id) || "—", o.amount, entry);
        } else if (band === "stage") {
          if (!isCommitted && !isExpected) continue;
          const stage = s.item_id ? (itemStateName(s.item_id) || "unlinked") : "unlinked";
          push(stage, stage.replace(/_/g, " "), o.amount, entry);
        } else {
          if (isCommitted) push("committed", "Committed", o.amount, entry);
          else if (isExpected) {
            push("expected", "Expected", o.amount, entry);
            if (showForecast) {
              const p = itemStageProb(s.item_id);
              const weighted = o.amount * p;
              if (weighted > 0) push("forecast", "Forecast (weighted)", weighted, { ...entry, v: weighted });
            }
          }
        }
      }
    }

    const segments = Array.from(bySeries.values()).sort((a, z) => z.value - a.value || a.key.localeCompare(z.key));
    const total = segments.reduce((a, s) => a + s.value, 0);
    return { bucket: b, segments, total };
  });
}

const H = 320;
const PAD_T = 24;
const PAD_B = 44;
const COL_W = 56;
const GAP = 64;

export default function RibbonChart(props: Props) {
  const aggs = useMemo(() => aggregate(props), [props]);

  const seriesKeys = useMemo(() => {
    const s = new Set<string>();
    for (const a of aggs) for (const seg of a.segments) s.add(seg.key);
    return Array.from(s);
  }, [aggs]);

  const colorMap = useMemo(() => assignColors(seriesKeys), [seriesKeys]);
  const colorFor = (k: string) => colorMap[k] || "#5F5E5A";

  const maxTotal = Math.max(1, ...aggs.map(a => a.total));
  const innerH = H - PAD_T - PAD_B;
  const yFor = (v: number) => innerH - (v / maxTotal) * innerH;

  const width = aggs.length * COL_W + Math.max(0, aggs.length - 1) * GAP + 32;
  const colX = (i: number) => 16 + i * (COL_W + GAP);

  const built = useMemo(() => aggs.map(a => {
    let cumulative = 0;
    const rects = a.segments.map(seg => {
      const yBottom = PAD_T + yFor(cumulative);
      const yTop = PAD_T + yFor(cumulative + seg.value);
      cumulative += seg.value;
      return { seg, yTop, yBottom };
    });
    return { agg: a, rects };
  }), [aggs, maxTotal]);

  const ribbons = useMemo(() => {
    const out: { d: string; color: string; key: string }[] = [];
    for (let i = 0; i < built.length - 1; i++) {
      const L = built[i]; const R = built[i + 1];
      const xL = colX(i) + COL_W;
      const xR = colX(i + 1);
      const dx = (xR - xL) / 2;
      const leftMap = new Map(L.rects.map(r => [r.seg.key, r]));
      const rightMap = new Map(R.rects.map(r => [r.seg.key, r]));
      for (const [key, lr] of leftMap) {
        const rr = rightMap.get(key);
        if (!rr) continue;
        const path =
          `M ${xL} ${lr.yTop} ` +
          `C ${xL + dx} ${lr.yTop} ${xR - dx} ${rr.yTop} ${xR} ${rr.yTop} ` +
          `L ${xR} ${rr.yBottom} ` +
          `C ${xR - dx} ${rr.yBottom} ${xL + dx} ${lr.yBottom} ${xL} ${lr.yBottom} Z`;
        out.push({ d: path, color: colorFor(key), key: `${i}-${key}` });
      }
    }
    return out;
  }, [built]);

  const [pinned, setPinned] = useState<{ seg: Segment; bucket: RibbonBucket; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const onSegClick = (e: React.MouseEvent, seg: Segment, bucket: RibbonBucket) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPinned({ seg, bucket, x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 });
    props.onSegmentClick?.({ seriesKey: seg.key, seriesLabel: seg.label, bucket });
  };

  if (aggs.length === 0) return null;

  return (
    <div className="relative border border-border rounded bg-muted/10">
      <div className="overflow-x-auto">
        <svg ref={svgRef} width={width} height={H} className="block">
          <g>
            {ribbons.map(r => (
              <path key={r.key} d={r.d} fill={r.color} fillOpacity={0.28} stroke="none" />
            ))}
          </g>

          {built.map(({ agg, rects }, i) => {
            const x = colX(i);
            return (
              <g key={agg.bucket.key}>
                {rects.map(({ seg, yTop, yBottom }) => {
                  const h = Math.max(1, yBottom - yTop);
                  const showLabel = h >= 18;
                  const pct = agg.total > 0 ? (seg.value / agg.total) * 100 : 0;
                  return (
                    <g key={seg.key}
                       className="cursor-pointer"
                       onClick={(e) => onSegClick(e, seg, agg.bucket)}
                    >
                      <rect
                        x={x} y={yTop} width={COL_W} height={h}
                        fill={colorFor(seg.key)} fillOpacity={0.92}
                        stroke="hsl(var(--background))" strokeWidth={0.5}
                      />
                      {showLabel && (
                        <text
                          x={x + COL_W / 2} y={yTop + h / 2 + 3}
                          textAnchor="middle"
                          className="pointer-events-none"
                          fontSize={9}
                          fontFamily="ui-monospace, monospace"
                          fill="white"
                        >
                          {fmtUsd(seg.value)}{pct >= 8 ? ` · ${pct.toFixed(0)}%` : ""}
                        </text>
                      )}
                    </g>
                  );
                })}
                <text x={x + COL_W / 2} y={PAD_T + yFor(agg.total) - 6}
                      textAnchor="middle" fontSize={10} fontFamily="ui-monospace, monospace"
                      fill="hsl(var(--foreground))">
                  {agg.total > 0 ? fmtUsd(agg.total) : ""}
                </text>
                <text x={x + COL_W / 2} y={H - PAD_B + 16} textAnchor="middle"
                      fontSize={10} fontFamily="ui-monospace, monospace"
                      fill="hsl(var(--muted-foreground))">{agg.bucket.label}</text>
                <text x={x + COL_W / 2} y={H - PAD_B + 30} textAnchor="middle"
                      fontSize={9} fontFamily="ui-monospace, monospace"
                      fill="hsl(var(--muted-foreground))">{agg.bucket.sub}</text>
              </g>
            );
          })}

          <line x1={0} x2={width} y1={PAD_T + innerH} y2={PAD_T + innerH}
                stroke="hsl(var(--border))" strokeWidth={1} />
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 border-t border-border text-[10px] font-mono">
        {seriesKeys.map(k => {
          const label = built.flatMap(b => b.rects).find(r => r.seg.key === k)?.seg.label || k;
          return (
            <span key={k} className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: colorFor(k) }} />
              {label}
            </span>
          );
        })}
      </div>

      {pinned && (
        <div
          className="absolute z-20 bg-popover border border-border rounded shadow-lg p-2 max-w-xs text-xs font-mono"
          style={{ left: pinned.x, top: pinned.y }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{pinned.seg.label}</span>
            <button className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setPinned(null)}>close</button>
          </div>
          <div className="text-[10px] text-muted-foreground">{pinned.bucket.label} · {pinned.bucket.sub}</div>
          <div className="mt-1">{fmtUsd(pinned.seg.value)}</div>
          <div className="mt-1 space-y-1 max-h-64 overflow-y-auto">
            {pinned.seg.entries.map((e, i) => (
              <div key={i} className="flex items-center gap-2 border-t border-border/60 pt-1">
                <span className="flex-1 truncate">
                  <span className="text-foreground">{e.s.description}</span>
                  <span className="text-muted-foreground"> · {format(e.date, "MMM d")}</span>
                  {e.override && <span className="ml-1 text-dossier-brass">· override</span>}
                </span>
                <span>{fmtUsd(e.v)}</span>
                {props.onOccurrenceEdit && (
                  <button
                    className="text-muted-foreground hover:text-dossier-brass"
                    title="Edit this month"
                    onClick={() => props.onOccurrenceEdit?.({
                      schedule: e.s, baseDate: e.baseDate, amount: e.v, date: e.date, override: e.override,
                    })}
                  >
                    <Pencil size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
