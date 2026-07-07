/**
 * Revenue math · single source of truth for pipeline / fiscal calendar / forecast.
 *
 * DOCTRINE: money facts derive from `revenue_schedules` + `revenue_occurrence_overrides`.
 * `items.metadata.pricing` is historical seed context only and is used as a fallback
 * ONLY for pursuits that have zero associated schedules.
 *
 * OCCURRENCE OVERRIDES: every consumer (calendar, ribbon, ledger, MRR, forecast,
 * board rollup) MUST run schedules through `expandOccurrences` so a per-month
 * override (skip / move / adjust_amount / mark_paid) is applied exactly once,
 * everywhere.
 */
import {
  addDays, addMonths, differenceInCalendarDays, isBefore,
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
  /** When false, the schedule is EXCLUDED from every revenue total everywhere. */
  counted?: boolean;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_invoice_id?: string | null;
  stripe_payment_link?: string | null;
  metadata?: any;
  accounts?: { id: string; name: string } | null;
}

export type OverrideKind = "skip" | "move" | "adjust_amount" | "mark_paid";

export interface OccurrenceOverride {
  id: string;
  schedule_id: string;
  workspace_id: string;
  occurrence_month: string;         // YYYY-MM-DD (first of month)
  override_kind: OverrideKind;
  new_date: string | null;
  new_amount_usd: number | string | null;
  note: string | null;
  created_at?: string;
}

export type OverrideIndex = Record<string, OccurrenceOverride[]>;

export function indexOverrides(rows: OccurrenceOverride[] | null | undefined): OverrideIndex {
  const idx: OverrideIndex = {};
  for (const r of rows || []) (idx[r.schedule_id] ||= []).push(r);
  return idx;
}

export const COMMITTED_STATUSES: Status[] = ["active", "invoiced", "paid"];
export const EXPECTED_STATUSES: Status[] = ["expected", "agreement_pending"];

export const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function amt(s: Schedule): number {
  const v = typeof s.amount_usd === "string" ? parseFloat(s.amount_usd) : s.amount_usd;
  return Number.isFinite(v) ? v : 0;
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

export function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/* ---------- Fiscal quarter helpers ---------- */

export function fiscalQuarterOf(date: Date, fyStartMonth: number): { fyStart: Date; q: 1|2|3|4; qStart: Date; fyLabel: string; qLabel: string } {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const fyStartYear = m >= fyStartMonth ? y : y - 1;
  const fyStart = new Date(fyStartYear, fyStartMonth - 1, 1);
  const monthsIntoFy = (date.getFullYear() - fyStart.getFullYear()) * 12 + (date.getMonth() - fyStart.getMonth());
  const qIdx = Math.floor(monthsIntoFy / 3);
  const qStart = new Date(fyStart.getFullYear(), fyStart.getMonth() + qIdx * 3, 1);
  const q = ((qIdx + 1) as 1|2|3|4);
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
    cols.push({ start, end, label: `W${i + 1}` });
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

/* ---------- Occurrence expansion (SHARED) ---------- */

export interface Occurrence {
  schedule: Schedule;
  /** Date this occurrence lands after overrides are applied. */
  date: Date;
  /** Original (pre-move) date the recurrence produced. */
  baseDate: Date;
  /** Effective dollar amount for this occurrence. */
  amount: number;
  /** monthKey used to look up overrides. Derived from baseDate. */
  monthKey: string;
  /** Applied override, if any. */
  override: OccurrenceOverride | null;
  /** True when this occurrence should be treated as committed (paid/active/invoiced/mark_paid). */
  committed: boolean;
  /** True when this occurrence is expected/pipeline. */
  expected: boolean;
}

function baseDates(s: Schedule): Date[] {
  const anchorRaw = s.next_due ?? s.start_date;
  if (!anchorRaw) return [];
  const anchor = parseISO(anchorRaw);
  if (s.kind === "one_time" || s.cadence === "once") return [anchor];
  // monthly subscription — generate over a wide horizon (2y back / 3y forward)
  const endBound = s.end_date ? parseISO(s.end_date) : null;
  const horizonStart = addMonths(new Date(), -24);
  const horizonEnd = addMonths(new Date(), 36);
  const out: Date[] = [];
  // walk backwards from anchor to horizonStart
  let back = new Date(anchor);
  while (!isBefore(back, horizonStart)) {
    out.unshift(new Date(back));
    back = addMonths(back, -1);
  }
  // forwards
  let fwd = addMonths(anchor, 1);
  while (isBefore(fwd, horizonEnd)) {
    if (endBound && isBefore(endBound, fwd)) break;
    out.push(new Date(fwd));
    fwd = addMonths(fwd, 1);
  }
  return out;
}

export function expandOccurrences(
  s: Schedule,
  from: Date,
  to: Date,
  overrides: OccurrenceOverride[] = [],
): Occurrence[] {
  if (s.status === "cancelled") return [];
  if (s.counted === false) return [];
  const overrideByMonth = new Map<string, OccurrenceOverride>();
  for (const o of overrides) overrideByMonth.set(o.occurrence_month.slice(0, 10), o);

  const base = baseDates(s);
  const out: Occurrence[] = [];
  for (const b of base) {
    const key = monthKey(b);
    const ov = overrideByMonth.get(key) ?? null;
    if (ov?.override_kind === "skip") continue;

    let date = b;
    let amount = amt(s);
    let forcedCommitted = false;

    if (ov?.override_kind === "move" && ov.new_date) date = parseISO(ov.new_date);
    if (ov?.override_kind === "adjust_amount") {
      const n = num(ov.new_amount_usd);
      if (n !== null) amount = n;
    }
    if (ov?.override_kind === "mark_paid") forcedCommitted = true;

    if (!isWithinInterval(date, { start: from, end: to })) continue;

    const isCommitted = forcedCommitted || COMMITTED_STATUSES.includes(s.status);
    const isExpected = !forcedCommitted && EXPECTED_STATUSES.includes(s.status);

    out.push({
      schedule: s, date, baseDate: b, amount, monthKey: key,
      override: ov, committed: isCommitted, expected: isExpected,
    });
  }
  return out;
}

/**
 * Legacy: does this schedule land at least once in [from,to]? Overrides are honored
 * when supplied so filter-by-bucket logic stays consistent with the visual.
 */
export function scheduleInstances(
  s: Schedule, from: Date, to: Date, overrides: OccurrenceOverride[] = [],
): Date[] {
  return expandOccurrences(s, from, to, overrides).map(o => o.date);
}

/* ---------- Bucketing ---------- */

export interface BucketTotals {
  committed: number;
  expected: number;
  forecast: number;
  rows: {
    schedule: Schedule; when: Date; committed: boolean; expected: boolean; weighted: number;
    amount: number; override: OccurrenceOverride | null; monthKey: string; baseDate: Date;
  }[];
}

export function bucketize(
  schedules: Schedule[],
  window: { start: Date; end: Date },
  stageProbabilityForItem: (itemId: string | null) => number,
  overridesByScheduleId: OverrideIndex = {},
): BucketTotals {
  let committed = 0, expected = 0, forecast = 0;
  const rows: BucketTotals["rows"] = [];
  for (const s of schedules) {
    const occs = expandOccurrences(s, window.start, window.end, overridesByScheduleId[s.id] || []);
    for (const o of occs) {
      const v = o.amount;
      if (o.committed) { committed += v; forecast += v; }
      let weighted = 0;
      if (o.expected) {
        expected += v;
        const p = stageProbabilityForItem(s.item_id) / 100;
        weighted = v * p;
        forecast += weighted;
      }
      rows.push({
        schedule: s, when: o.date, committed: o.committed, expected: o.expected,
        weighted, amount: v, override: o.override, monthKey: o.monthKey, baseDate: o.baseDate,
      });
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
