/**
 * Revenue math · single source of truth for pipeline / fiscal calendar / forecast.
 *
 * DOCTRINE: money facts derive from `revenue_schedules`. `items.metadata.pricing`
 * is historical seed context only and is used as a fallback ONLY for pursuits
 * that have zero associated schedules.
 */
import {
  addDays, addMonths, addWeeks, differenceInCalendarDays, isBefore, isSameMonth,
  parseISO, startOfMonth, startOfWeek, isWithinInterval,
} from "date-fns";

export type Kind = "one_time" | "subscription";
export type Cadence = "once" | "monthly";
export type Status =
  | "expected" | "agreement_pending" | "invoiced" | "active"
  | "paid" | "overdue" | "cancelled";

export interface Schedule {
  id: string;
  workspace_id: string;
  account_id: string;
  item_id: string | null;
  kind: Kind;
  description: string;
  amount_usd: number | string;
  cadence: Cadence;
  start_date: string | null;
  end_date: string | null;
  next_due: string | null;
  status: Status;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_invoice_id?: string | null;
  stripe_payment_link?: string | null;
  metadata?: any;
  accounts?: { id: string; name: string } | null;
}

export const COMMITTED_STATUSES: Status[] = ["active", "invoiced", "paid"];
export const EXPECTED_STATUSES: Status[] = ["expected", "agreement_pending"];

export const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function amt(s: Schedule): number {
  const v = typeof s.amount_usd === "string" ? parseFloat(s.amount_usd) : s.amount_usd;
  return Number.isFinite(v) ? v : 0;
}

/* ---------- Fiscal quarter helpers ---------- */

export function fiscalQuarterOf(date: Date, fyStartMonth: number): { fyStart: Date; q: 1|2|3|4; qStart: Date; fyLabel: string; qLabel: string } {
  // fyStartMonth: 1..12
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const fyStartYear = m >= fyStartMonth ? y : y - 1;
  const fyStart = new Date(fyStartYear, fyStartMonth - 1, 1);
  const monthsIntoFy = (date.getFullYear() - fyStart.getFullYear()) * 12 + (date.getMonth() - fyStart.getMonth());
  const qIdx = Math.floor(monthsIntoFy / 3); // 0..3
  const qStart = new Date(fyStart.getFullYear(), fyStart.getMonth() + qIdx * 3, 1);
  const q = ((qIdx + 1) as 1|2|3|4);
  // FY label uses the calendar year the fiscal year ENDS in.
  const fyEndYear = fyStart.getFullYear() + (fyStartMonth === 1 ? 0 : 1);
  const fyLabel = `FY${String(fyEndYear).slice(-2)}`;
  return { fyStart, q, qStart, fyLabel, qLabel: `Q${q} ${fyLabel}` };
}

export function shiftFiscalQuarter(qStart: Date, delta: number): Date {
  return addMonths(qStart, delta * 3);
}

export function weekColumns(qStart: Date, weeks = 13): { start: Date; end: Date; label: string }[] {
  const cols: { start: Date; end: Date; label: string }[] = [];
  let cursor = startOfWeek(qStart, { weekStartsOn: 1 });
  for (let i = 0; i < weeks; i++) {
    const start = cursor;
    const end = addDays(cursor, 7);
    cols.push({
      start,
      end,
      label: `W${i + 1}`,
    });
    cursor = end;
  }
  return cols;
}

export function monthColumns(from: Date, months = 6): { start: Date; end: Date }[] {
  const first = startOfMonth(from);
  return Array.from({ length: months }, (_, i) => {
    const start = addMonths(first, i);
    return { start, end: addMonths(start, 1) };
  });
}

/* ---------- Bucketing ---------- */

/**
 * Instances of when a schedule "lands". For a one-time: a single date (start_date
 * or next_due). For a subscription: the monthly next_due anchor, projected forward
 * across every month in [start, end] that falls inside [from, to].
 */
export function scheduleInstances(s: Schedule, from: Date, to: Date): Date[] {
  if (s.status === "cancelled") return [];
  const anchorRaw = s.next_due ?? s.start_date;
  if (!anchorRaw) return [];
  const anchor = parseISO(anchorRaw);
  const endBound = s.end_date ? parseISO(s.end_date) : null;

  if (s.kind === "one_time" || s.cadence === "once") {
    if (isWithinInterval(anchor, { start: from, end: to })) return [anchor];
    return [];
  }

  // monthly subscription — walk months from anchor (or from window start if anchor is earlier)
  const out: Date[] = [];
  // start walking at anchor, then move backwards/forwards to align with window
  let cursor = new Date(anchor);
  // Wind forward until inside window
  while (isBefore(cursor, from)) cursor = addMonths(cursor, 1);
  while (isBefore(cursor, to) || +cursor === +to) {
    if (endBound && isBefore(endBound, cursor)) break;
    out.push(new Date(cursor));
    cursor = addMonths(cursor, 1);
  }
  return out;
}

export interface BucketTotals {
  committed: number;
  expected: number;
  forecast: number; // committed + weighted(expected)
  rows: { schedule: Schedule; when: Date; committed: boolean; expected: boolean; weighted: number }[];
}

export function bucketize(
  schedules: Schedule[],
  window: { start: Date; end: Date },
  stageProbabilityForItem: (itemId: string | null) => number,
): BucketTotals {
  let committed = 0, expected = 0, forecast = 0;
  const rows: BucketTotals["rows"] = [];
  for (const s of schedules) {
    const hits = scheduleInstances(s, window.start, window.end);
    for (const when of hits) {
      const v = amt(s);
      const isCommitted = COMMITTED_STATUSES.includes(s.status);
      const isExpected = EXPECTED_STATUSES.includes(s.status);
      if (isCommitted) { committed += v; forecast += v; }
      let weighted = 0;
      if (isExpected) {
        expected += v;
        const p = stageProbabilityForItem(s.item_id) / 100;
        weighted = v * p;
        forecast += weighted;
      }
      rows.push({ schedule: s, when, committed: isCommitted, expected: isExpected, weighted });
    }
  }
  return { committed, expected, forecast, rows };
}

/* ---------- Metadata fallback for pursuits without a schedule ---------- */

export interface FallbackPricing { oneTime: number; monthly: number }

export function pricingFromMetadata(pricing: any): FallbackPricing {
  const out = { oneTime: 0, monthly: 0 };
  if (!pricing || typeof pricing !== "object") return out;
  for (const [k, raw] of Object.entries(pricing)) {
    const v = typeof raw === "string" ? parseFloat(raw) : (raw as number);
    if (!Number.isFinite(v)) continue;
    if (/monthly/i.test(k)) out.monthly += v;
    else out.oneTime += v;
  }
  return out;
}

/* ---------- Pipeline rollup (board) ---------- */

export interface StageRollup {
  oneTime: number;
  monthly: number;
  weightedOneTime: number;
  weightedMonthly: number;
  fromFallback: boolean;
}

export function pipelineRollup(params: {
  pursuits: { id: string; state_id: string; state_name?: string | null; metadata?: any }[];
  schedulesByItem: Record<string, Schedule[]>;
  stageProbabilityByStateName: (name: string) => number;
  stateNameById: (id: string) => string | null;
}): Record<string, StageRollup> {
  const per: Record<string, StageRollup> = {};
  for (const p of params.pursuits) {
    const bucket = per[p.state_id] ||= { oneTime: 0, monthly: 0, weightedOneTime: 0, weightedMonthly: 0, fromFallback: false };
    const schedules = params.schedulesByItem[p.id] || [];
    const stateName = p.state_name ?? params.stateNameById(p.state_id) ?? "";
    const prob = params.stageProbabilityByStateName(stateName) / 100;
    if (schedules.length > 0) {
      for (const s of schedules) {
        if (s.status === "cancelled") continue;
        const v = amt(s);
        if (s.kind === "one_time") { bucket.oneTime += v; bucket.weightedOneTime += v * prob; }
        else if (s.kind === "subscription") { bucket.monthly += v; bucket.weightedMonthly += v * prob; }
      }
    } else {
      const fb = pricingFromMetadata(p.metadata?.pricing);
      if (fb.oneTime || fb.monthly) {
        bucket.fromFallback = true;
        bucket.oneTime += fb.oneTime;
        bucket.monthly += fb.monthly;
        bucket.weightedOneTime += fb.oneTime * prob;
        bucket.weightedMonthly += fb.monthly * prob;
      }
    }
  }
  return per;
}

export function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  return differenceInCalendarDays(parseISO(dateIso), new Date());
}
