/**
 * Invoicing helpers. Invoices are DERIVED from revenue_schedules occurrences
 * via the shared occurrence engine — never bypass `expandOccurrences`.
 *
 * Numbering: gapless per-workspace per-year via SQL RPC `next_invoice_number`.
 * ONE invoice per account per billing period by default; schedules flagged
 * `invoice_separately` are emitted as their own invoice (still one per period
 * per schedule).
 *
 * Uncounted schedules (counted=false) NEVER produce invoices, mirroring
 * Pass 04's revenue-math contract.
 */
import { addDays, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { writeTimelineEvent } from "@/lib/timeline-events";
import {
  amt, expandOccurrences, indexOverrides,
  type OccurrenceOverride, type Schedule,
} from "@/lib/revenue-math";

export type InvoiceStatus =
  | "draft" | "auto_draft" | "issued" | "sent" | "paid" | "overdue" | "void";
export type PaidVia = "stripe" | "bank" | "manual";
export type BillingMode = "manual" | "auto_draft";

export interface InvoiceLineItem {
  schedule_id: string;
  occurrence_date: string;    // YYYY-MM-DD
  description: string;
  amount_usd: number;
}

export interface Invoice {
  id: string;
  workspace_id: string;
  account_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  billing_period: string;     // YYYY-MM-01
  billing_mode: BillingMode;
  line_items: InvoiceLineItem[];
  subtotal: number | string;
  total: number | string;
  status: InvoiceStatus;
  paid_at: string | null;
  paid_via: PaidVia | null;
  paid_note: string | null;
  void_reason: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_link: string | null;
  notes: string | null;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
  accounts?: { id: string; name: string; billing_mode?: BillingMode } | null;
}

export function invoiceStatusTone(s: InvoiceStatus): string {
  switch (s) {
    case "paid": return "border-status-green/40 text-status-green";
    case "issued": case "sent": return "border-dossier-brass/50 text-dossier-brass";
    case "overdue": return "border-status-red/50 text-status-red";
    case "void": return "border-border text-muted-foreground line-through";
    case "auto_draft": return "border-dossier-brass/30 text-dossier-brass/80";
    default: return "border-border text-muted-foreground";
  }
}

export function invoiceStatusLabel(s: InvoiceStatus): string {
  return s.replace(/_/g, " ");
}

/**
 * Reserve the next invoice number for a workspace (gapless, per year).
 * SECURITY DEFINER RPC — checks membership server-side.
 */
export async function nextInvoiceNumber(workspaceId: string): Promise<string> {
  const { data, error } = await (supabase as any).rpc("next_invoice_number", {
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
  return String(data);
}

/** Default net terms in days. */
export const DEFAULT_NET_DAYS = 14;

/** Compute the line items for one (account, billing_period) draft. */
export function buildLineItems(params: {
  schedules: Schedule[];
  overrides: OccurrenceOverride[];
  billingPeriod: Date;              // any date in the month
}): { lines: InvoiceLineItem[]; subtotal: number } {
  const from = startOfMonth(params.billingPeriod);
  const to = endOfMonth(params.billingPeriod);
  const byId = indexOverrides(params.overrides);
  const lines: InvoiceLineItem[] = [];
  let subtotal = 0;
  for (const s of params.schedules) {
    if (s.counted === false) continue;
    if (s.status === "cancelled") continue;
    const occs = expandOccurrences(s, from, to, byId[s.id] || []);
    for (const o of occs) {
      lines.push({
        schedule_id: s.id,
        occurrence_date: format(o.date, "yyyy-MM-dd"),
        description: s.description,
        amount_usd: o.amount,
      });
      subtotal += o.amount;
    }
  }
  return { lines, subtotal };
}

/** Return the set of {account_id, invoice_separately_schedule_id} groupings for a month. */
function groupSchedules(schedules: Schedule[]): {
  accountsCombined: Map<string, Schedule[]>;
  separate: Schedule[];
} {
  const combined = new Map<string, Schedule[]>();
  const separate: Schedule[] = [];
  for (const s of schedules) {
    if ((s as any).invoice_separately) separate.push(s);
    else {
      const arr = combined.get(s.account_id) || [];
      arr.push(s);
      combined.set(s.account_id, arr);
    }
  }
  return { accountsCombined: combined, separate };
}

/**
 * Generate DRAFT invoices for a month across a workspace. Idempotent per
 * (account_id, billing_period) for combined drafts and per
 * (schedule_id, billing_period) for schedules flagged invoice_separately.
 * Returns the newly created invoice count.
 */
export async function generateDraftsForMonth(params: {
  workspaceId: string;
  billingPeriod: Date;
  accountIdFilter?: string;    // if provided, only that account
  actorEmail?: string | null;
}): Promise<{ created: number; skipped: number }> {
  const monthKey = format(startOfMonth(params.billingPeriod), "yyyy-MM-dd");

  // Load schedules for this workspace (optionally filtered by account).
  let sq: any = (supabase as any).from("revenue_schedules")
    .select("*").eq("workspace_id", params.workspaceId);
  if (params.accountIdFilter) sq = sq.eq("account_id", params.accountIdFilter);
  const { data: schedules, error: sErr } = await sq;
  if (sErr) throw sErr;

  const { data: overrides } = await (supabase as any).from("revenue_occurrence_overrides")
    .select("*").eq("workspace_id", params.workspaceId)
    .eq("occurrence_month", monthKey);

  // Existing invoices for this period — for idempotency.
  const { data: existing } = await (supabase as any).from("invoices")
    .select("id, account_id, line_items")
    .eq("workspace_id", params.workspaceId)
    .eq("billing_period", monthKey);
  const existingByAccount = new Map<string, any[]>();
  for (const inv of existing || []) {
    const arr = existingByAccount.get(inv.account_id) || [];
    arr.push(inv);
    existingByAccount.set(inv.account_id, arr);
  }
  const existingSeparateSchedule = new Set<string>();
  for (const inv of existing || []) {
    const lines = (inv.line_items || []) as InvoiceLineItem[];
    if (lines.length === 1) existingSeparateSchedule.add(lines[0].schedule_id);
  }

  // Load account billing_mode for defaults.
  const { data: accounts } = await (supabase as any).from("accounts")
    .select("id, billing_mode").eq("workspace_id", params.workspaceId);
  const modeByAccount = new Map<string, BillingMode>();
  for (const a of accounts || []) modeByAccount.set(a.id, (a.billing_mode || "manual") as BillingMode);

  const { accountsCombined, separate } = groupSchedules((schedules || []) as Schedule[]);

  let created = 0, skipped = 0;

  // Combined per-account invoices
  for (const [accountId, accSchedules] of accountsCombined.entries()) {
    // Skip account if it already has any combined invoice (not a single-line separate)
    const existingCombined = (existingByAccount.get(accountId) || []).find(
      (inv) => (inv.line_items || []).length !== 1
        || !((inv.line_items || [])[0]?.schedule_id
             && separate.some((s) => s.id === (inv.line_items || [])[0]?.schedule_id))
    );
    if (existingCombined) { skipped++; continue; }

    const { lines, subtotal } = buildLineItems({
      schedules: accSchedules,
      overrides: (overrides || []) as OccurrenceOverride[],
      billingPeriod: params.billingPeriod,
    });
    if (lines.length === 0) continue;

    const mode = modeByAccount.get(accountId) ?? "manual";
    await insertInvoice({
      workspaceId: params.workspaceId,
      accountId,
      billingPeriod: monthKey,
      lines, subtotal, mode,
      actorEmail: params.actorEmail ?? null,
    });
    created++;
  }

  // Separate schedules → one invoice each per period
  for (const s of separate) {
    if (existingSeparateSchedule.has(s.id)) { skipped++; continue; }
    const { lines, subtotal } = buildLineItems({
      schedules: [s],
      overrides: (overrides || []) as OccurrenceOverride[],
      billingPeriod: params.billingPeriod,
    });
    if (lines.length === 0) continue;
    const mode = modeByAccount.get(s.account_id) ?? "manual";
    await insertInvoice({
      workspaceId: params.workspaceId,
      accountId: s.account_id,
      billingPeriod: monthKey,
      lines, subtotal, mode,
      actorEmail: params.actorEmail ?? null,
      notes: `Invoiced separately · ${s.description}`,
    });
    created++;
  }

  return { created, skipped };
}

async function insertInvoice(args: {
  workspaceId: string;
  accountId: string;
  billingPeriod: string;
  lines: InvoiceLineItem[];
  subtotal: number;
  mode: BillingMode;
  actorEmail: string | null;
  notes?: string;
}) {
  const number = await nextInvoiceNumber(args.workspaceId);
  const issue = new Date();
  const due = addDays(issue, DEFAULT_NET_DAYS);
  const status: InvoiceStatus = args.mode === "auto_draft" ? "auto_draft" : "draft";
  const { data, error } = await (supabase as any).from("invoices").insert({
    workspace_id: args.workspaceId,
    account_id: args.accountId,
    invoice_number: number,
    issue_date: format(issue, "yyyy-MM-dd"),
    due_date: format(due, "yyyy-MM-dd"),
    billing_period: args.billingPeriod,
    billing_mode: args.mode,
    line_items: args.lines,
    subtotal: args.subtotal,
    total: args.subtotal,
    status,
    notes: args.notes ?? null,
    created_by: args.actorEmail,
  }).select("id, invoice_number").maybeSingle();
  if (error) throw error;
  await writeTimelineEvent({
    accountId: args.accountId,
    direction: "system",
    channel: "system",
    summary: `Invoice ${data?.invoice_number} drafted (${status.replace("_", " ")})`,
    rawJson: { invoice_id: data?.id, billing_period: args.billingPeriod, subtotal: args.subtotal, mode: args.mode },
  });
  return data;
}

/** Mark an invoice paid (manual · bank · or explicit stripe backfill). */
export async function markInvoicePaid(params: {
  invoice: Invoice;
  paidVia: PaidVia;
  note?: string;
  actorEmail?: string | null;
}): Promise<boolean> {
  const { error } = await (supabase as any).from("invoices").update({
    status: "paid",
    paid_at: new Date().toISOString(),
    paid_via: params.paidVia,
    paid_note: params.note ?? null,
  }).eq("id", params.invoice.id);
  if (error) return false;
  await writeTimelineEvent({
    accountId: params.invoice.account_id,
    direction: "system",
    channel: "system",
    summary: `Invoice ${params.invoice.invoice_number} marked paid via ${params.paidVia}`,
    body: params.note || null,
    rawJson: { invoice_id: params.invoice.id, paid_via: params.paidVia, actor: params.actorEmail ?? null },
  });
  return true;
}

/** Void an invoice with a reason. */
export async function voidInvoice(params: {
  invoice: Invoice; reason: string; actorEmail?: string | null;
}): Promise<boolean> {
  if (!params.reason.trim()) return false;
  const { error } = await (supabase as any).from("invoices").update({
    status: "void", void_reason: params.reason.trim(),
  }).eq("id", params.invoice.id);
  if (error) return false;
  await writeTimelineEvent({
    accountId: params.invoice.account_id,
    direction: "system",
    channel: "system",
    summary: `Invoice ${params.invoice.invoice_number} voided`,
    body: params.reason,
    rawJson: { invoice_id: params.invoice.id, actor: params.actorEmail ?? null },
  });
  return true;
}

/** Issue a draft (draft/auto_draft → issued). */
export async function issueInvoice(params: {
  invoice: Invoice; actorEmail?: string | null;
}): Promise<boolean> {
  const { error } = await (supabase as any).from("invoices").update({
    status: "issued", issue_date: format(new Date(), "yyyy-MM-dd"),
  }).eq("id", params.invoice.id);
  if (error) return false;
  await writeTimelineEvent({
    accountId: params.invoice.account_id,
    direction: "system",
    channel: "system",
    summary: `Invoice ${params.invoice.invoice_number} issued`,
    rawJson: { invoice_id: params.invoice.id, actor: params.actorEmail ?? null },
  });
  return true;
}

/** Bulk sweep: flip past-due unpaid invoices to overdue. */
export async function sweepOverdue(workspaceId: string): Promise<number> {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data, error } = await (supabase as any).from("invoices")
    .update({ status: "overdue" })
    .eq("workspace_id", workspaceId)
    .in("status", ["issued", "sent"])
    .lt("due_date", today)
    .select("id, account_id, invoice_number");
  if (error) return 0;
  for (const inv of data || []) {
    await writeTimelineEvent({
      accountId: inv.account_id,
      direction: "system",
      channel: "system",
      summary: `Invoice ${inv.invoice_number} now overdue`,
      rawJson: { invoice_id: inv.id },
    });
  }
  return (data || []).length;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try { return format(parseISO(iso), "MMM d, yyyy"); } catch { return iso; }
}
