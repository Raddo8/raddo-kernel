import { useMemo, useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { Schedule, amt, fmtUsd, scheduleInstances, COMMITTED_STATUSES, EXPECTED_STATUSES } from "@/lib/revenue-math";
import { assignColors } from "@/lib/account-colors";

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
  /** Resolve pursuit item_id → state name (for stage band + weighted forecast). */
  itemStateName: (itemId: string | null) => string;
  /** Resolve pursuit item_id → stage probability 0..1 (for forecast weighting). */
  itemStageProb: (itemId: string | null) => number;
  /** Resolve account_id → display name. */
  accountName: (id: string) => string;
  /** Segment click → filter ledger. */
  onSegmentClick?: (payload: { seriesKey: string; seriesLabel: string; bucket: RibbonBucket }) => void;
}

interface Segment {
  key: string;         // series key (account_id | state_name | status_kind)
  label: string;       // human label
  value: number;
  schedules: { s: Schedule; v: number }[];
}

interface BucketAgg {
  bucket: RibbonBucket;
  segments: Segment[];  // in stable sort order (by size desc, ties by key)
  total: number;
}

/* ---------- Aggregation ---------- */

function aggregate(props: Props): BucketAgg[] {
  const { buckets, schedules, band, showForecast, itemStateName, itemStageProb, accountName } = props;
  return buckets.map(b => {
    const bySeries = new Map<string, Segment>();
    const push = (key: string, label: string, value: number, s: Schedule) => {
      if (value <= 0) return;
      let seg = bySeries.get(key);
      if (!seg) { seg = { key, label, value: 0, schedules: [] }; bySeries.set(key, seg); }
      seg.value += value;
      seg.schedules.push({ s, v: value });
    };

    for (const s of schedules) {
      if (s.status === "cancelled") continue;
      const hits = scheduleInstances(s, b.start, b.end);
      if (hits.length === 0) continue;
      const v = amt(s);
      const isCommitted = COMMITTED_STATUSES.includes(s.status);
      const isExpected = EXPECTED_STATUSES.includes(s.status);

      for (const _ of hits) {
        if (band === "account") {
          if (!isCommitted && !isExpected) continue;
          const key = s.account_id;
          push(key, accountName(key) || "—", v, s);
        } else if (band === "stage") {
          if (!isCommitted && !isExpected) continue;
          const stage = s.item_id ? (itemStateName(s.item_id) || "unlinked") : "unlinked";
          push(stage, stage.replace(/_/g, " "), v, s);
        } else {
          // status band
          if (isCommitted) push("committed", "Committed", v, s);
          else if (isExpected) {
            push("expected", "Expected", v, s);
            if (showForecast) {
              const p = itemStageProb(s.item_id);
              const weighted = v * p;
              if (weighted > 0) push("forecast", "Forecast (weighted)", weighted, s);
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

/* ---------- Chart ---------- */

const H = 320;             // chart height
const PAD_T = 24;
const PAD_B = 44;
const COL_W = 56;          // column body width
const GAP = 64;            // gap between columns (ribbon zone)

export default function RibbonChart(props: Props) {
  const aggs = useMemo(() => aggregate(props), [props]);

  // All series keys across all buckets (stable palette)
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

  // Build per-bucket segment rectangles with cumulative y (stack from bottom)
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

  // Ribbon paths: for each consecutive pair, for each series present in both,
  // connect the segment bands with a smooth cubic bezier (top+bottom edges).
  const ribbons = useMemo(() => {
    const out: { d: string; color: string; key: string; label: string; left: number; right: number }[] = [];
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
        out.push({ d: path, color: colorFor(key), key: `${i}-${key}`, label: lr.seg.label, left: lr.seg.value, right: rr.seg.value });
      }
    }
    return out;
  }, [built]);

  const [hover, setHover] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const onSegHover = (e: React.MouseEvent, seg: Segment, bucket: RibbonBucket) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top + 12,
      content: (
        <div className="text-xs font-mono">
          <div className="font-medium">{seg.label}</div>
          <div className="text-muted-foreground">{bucket.label} · {bucket.sub}</div>
          <div className="mt-1">{fmtUsd(seg.value)} · {((seg.value / (aggs.find(a => a.bucket.key === bucket.key)?.total || 1)) * 100).toFixed(0)}%</div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {seg.schedules.slice(0, 5).map(({ s, v }, i) => (
              <div key={i}>{s.description} · {fmtUsd(v)} · <span className="uppercase">{s.status}</span></div>
            ))}
            {seg.schedules.length > 5 && <div>+{seg.schedules.length - 5} more</div>}
          </div>
        </div>
      ),
    });
  };

  if (aggs.length === 0) return null;

  return (
    <div className="relative border border-border rounded bg-muted/10">
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          width={width}
          height={H}
          className="block"
          onMouseLeave={() => setHover(null)}
        >
          {/* Ribbons behind columns */}
          <g style={{ mixBlendMode: "normal" }}>
            {ribbons.map(r => (
              <path
                key={r.key}
                d={r.d}
                fill={r.color}
                fillOpacity={0.28}
                stroke="none"
              />
            ))}
          </g>

          {/* Stacked columns */}
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
                       onMouseMove={(e) => onSegHover(e, seg, agg.bucket)}
                       onClick={() => props.onSegmentClick?.({ seriesKey: seg.key, seriesLabel: seg.label, bucket: agg.bucket })}
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
                {/* Total on top */}
                <text
                  x={x + COL_W / 2}
                  y={PAD_T + yFor(agg.total) - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="ui-monospace, monospace"
                  fill="hsl(var(--foreground))"
                >
                  {agg.total > 0 ? fmtUsd(agg.total) : ""}
                </text>
                {/* X-axis label */}
                <text x={x + COL_W / 2} y={H - PAD_B + 16} textAnchor="middle"
                      fontSize={10} fontFamily="ui-monospace, monospace"
                      fill="hsl(var(--muted-foreground))">{agg.bucket.label}</text>
                <text x={x + COL_W / 2} y={H - PAD_B + 30} textAnchor="middle"
                      fontSize={9} fontFamily="ui-monospace, monospace"
                      fill="hsl(var(--muted-foreground))">{agg.bucket.sub}</text>
              </g>
            );
          })}

          {/* Baseline */}
          <line x1={0} x2={width} y1={PAD_T + innerH} y2={PAD_T + innerH}
                stroke="hsl(var(--border))" strokeWidth={1} />
        </svg>
      </div>

      {/* Legend */}
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

      {hover && (
        <div
          className="absolute z-10 pointer-events-none bg-popover border border-border rounded shadow-lg p-2 max-w-xs"
          style={{ left: hover.x, top: hover.y }}
        >
          {hover.content}
        </div>
      )}
    </div>
  );
}
