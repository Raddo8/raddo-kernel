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

/**
 * Parse a YYYY-MM string as the first-of-month in LOCAL time.
 * Never construct `new Date("YYYY-MM-01T00:00:00Z")` for month pickers —
 * UTC midnight resolves to the previous month for any zone west of UTC,
 * which is what caused the June→May "Period" offset bug.
 */
export function parseMonthInputLocal(monthStr: string): Date {
  const [yyyy, mm] = monthStr.split("-").map((v) => parseInt(v, 10));
  return new Date(yyyy, (mm || 1) - 1, 1);
}

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
}): Promise<{
  created: number;
  skipped: number;
  details: { invoice_number: string; account_id: string; billing_period: string; due_date: string; total: number }[];
}> {
  // OFFSET-FIX: derive the selected month strictly in LOCAL time.
  // If the caller passes any Date that lands on the 1st (any zone), startOfMonth
  // in local time yields the intended first-of-month, so the derived monthKey and
  // occurrence-window [monthStart, monthEnd] are the SAME month the user picked.
  const monthStart = startOfMonth(params.billingPeriod);
  const monthEnd = endOfMonth(params.billingPeriod);
  const monthKey = format(monthStart, "yyyy-MM-dd");

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
  const details: { invoice_number: string; account_id: string; billing_period: string; due_date: string; total: number }[] = [];

  // Combined per-account invoices
  for (const [accountId, accSchedules] of accountsCombined.entries()) {
    const existingCombined = (existingByAccount.get(accountId) || []).find(
      (inv) => (inv.line_items || []).length !== 1
        || !((inv.line_items || [])[0]?.schedule_id
             && separate.some((s) => s.id === (inv.line_items || [])[0]?.schedule_id))
    );
    if (existingCombined) { skipped++; continue; }

    const { lines, subtotal } = buildLineItems({
      schedules: accSchedules,
      overrides: (overrides || []) as OccurrenceOverride[],
      billingPeriod: monthStart,
    });
    if (lines.length === 0) continue;

    const mode = modeByAccount.get(accountId) ?? "manual";
    const dueDate = earliestOccurrenceOrFallback(lines, monthEnd);
    const inv = await insertInvoice({
      workspaceId: params.workspaceId,
      accountId,
      billingPeriod: monthKey,
      dueDate,
      lines, subtotal, mode,
      actorEmail: params.actorEmail ?? null,
    });
    created++;
    if (inv) details.push({ invoice_number: inv.invoice_number, account_id: accountId, billing_period: monthKey, due_date: dueDate, total: subtotal });
  }

  // Separate schedules → one invoice each per period
  for (const s of separate) {
    if (existingSeparateSchedule.has(s.id)) { skipped++; continue; }
    const { lines, subtotal } = buildLineItems({
      schedules: [s],
      overrides: (overrides || []) as OccurrenceOverride[],
      billingPeriod: monthStart,
    });
    if (lines.length === 0) continue;
    const mode = modeByAccount.get(s.account_id) ?? "manual";
    const dueDate = earliestOccurrenceOrFallback(lines, monthEnd);
    const inv = await insertInvoice({
      workspaceId: params.workspaceId,
      accountId: s.account_id,
      billingPeriod: monthKey,
      dueDate,
      lines, subtotal, mode,
      actorEmail: params.actorEmail ?? null,
      notes: `Invoiced separately · ${s.description}`,
    });
    created++;
    if (inv) details.push({ invoice_number: inv.invoice_number, account_id: s.account_id, billing_period: monthKey, due_date: dueDate, total: subtotal });
  }

  return { created, skipped, details };
}

function earliestOccurrenceOrFallback(lines: InvoiceLineItem[], monthEnd: Date): string {
  const dates = lines.map((l) => l.occurrence_date).filter(Boolean).sort();
  if (dates.length > 0) return dates[0];
  return format(monthEnd, "yyyy-MM-dd");
}

async function insertInvoice(args: {
  workspaceId: string;
  accountId: string;
  billingPeriod: string;
  /** Due date computed from the occurrence itself (not issue+net). */
  dueDate: string;
  lines: InvoiceLineItem[];
  subtotal: number;
  mode: BillingMode;
  actorEmail: string | null;
  notes?: string;
}) {
  const number = await nextInvoiceNumber(args.workspaceId);
  const issue = new Date();
  const status: InvoiceStatus = args.mode === "auto_draft" ? "auto_draft" : "draft";
  const { data, error } = await (supabase as any).from("invoices").insert({
    workspace_id: args.workspaceId,
    account_id: args.accountId,
    invoice_number: number,
    issue_date: format(issue, "yyyy-MM-dd"),
    due_date: args.dueDate,
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
    rawJson: { invoice_id: data?.id, billing_period: args.billingPeriod, due_date: args.dueDate, subtotal: args.subtotal, mode: args.mode },
  });
  return data as { id: string; invoice_number: string } | null;
}

/** Update editable fields on an invoice. Financials locked once paid/void; dates always editable. */
export async function updateInvoiceEditable(params: {
  invoice: Invoice;
  patch: {
    issue_date?: string;
    due_date?: string;
    billing_period?: string;
    notes?: string | null;
    line_items?: InvoiceLineItem[];
  };
  actorEmail?: string | null;
}): Promise<boolean> {
  const locked = params.invoice.status === "paid" || params.invoice.status === "void";
  const patch: any = {};
  if (params.patch.issue_date !== undefined) patch.issue_date = params.patch.issue_date;
  if (params.patch.due_date !== undefined) patch.due_date = params.patch.due_date;
  if (!locked) {
    if (params.patch.billing_period !== undefined) patch.billing_period = params.patch.billing_period;
    if (params.patch.notes !== undefined) patch.notes = params.patch.notes;
    if (params.patch.line_items !== undefined) {
      patch.line_items = params.patch.line_items;
      const sub = params.patch.line_items.reduce((n, l) => n + Number(l.amount_usd || 0), 0);
      patch.subtotal = sub;
      patch.total = sub;
    }
  }
  if (Object.keys(patch).length === 0) return true;
  const { error } = await (supabase as any).from("invoices").update(patch).eq("id", params.invoice.id);
  if (error) return false;
  await writeTimelineEvent({
    accountId: params.invoice.account_id,
    direction: "system",
    channel: "system",
    summary: `Invoice ${params.invoice.invoice_number} edited`,
    rawJson: { invoice_id: params.invoice.id, patch, actor: params.actorEmail ?? null },
  });
  return true;
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

export function fmtMoneyPlain(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Build a draft outbound "here is your invoice" email. Nothing is sent — the UI
 * offers copy + mailto so the operator addresses it themselves.
 */
export function buildIssueEmailDraft(params: {
  invoice: Invoice;
  accountName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  remittance?: string | null;
  workspaceName?: string | null;
}): { to: string; subject: string; body: string } {
  const inv = params.invoice;
  const periodLabel = (() => {
    try { return format(parseISO(inv.billing_period), "MMMM yyyy"); } catch { return inv.billing_period; }
  })();
  const dueLabel = fmtDate(inv.due_date);
  const total = Number(inv.total ?? inv.subtotal ?? 0);
  const greetName = params.contactName?.trim() || "there";
  const signOff = params.workspaceName?.trim() || "COB Technologies LLC";

  const sections: string[] = [];

  // Greeting + one-line intent
  sections.push(
    `Hi ${greetName},\n\n` +
    `Invoice ${inv.invoice_number} for ${params.accountName} is ready. ` +
    `Details are below.`
  );

  // Invoice details block — one label per line, no fake column padding
  sections.push(
    `Invoice details\n` +
    `Invoice number: ${inv.invoice_number}\n` +
    `Billing period: ${periodLabel}\n` +
    `Amount due: ${fmtMoneyPlain(total)}\n` +
    `Due date: ${dueLabel}`
  );

  // Remittance / wiring — each line stands on its own
  const remit = (params.remittance || "").trim();
  if (remit) {
    sections.push(`Remittance / wiring instructions\n${remit}`);
  }

  // Pay online — clearly separated
  if (inv.stripe_payment_link) {
    sections.push(`Pay online\n${inv.stripe_payment_link}`);
  }

  // Notes (optional)
  if (inv.notes) {
    sections.push(`Notes\n${inv.notes}`);
  }

  // Close
  sections.push(
    `Any questions, just reply to this email.\n\n` +
    `Thank you,\n${signOff}`
  );

  // Join with blank lines between sections; trim trailing whitespace per line
  const body = sections
    .join("\n\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n");

  return {
    to: params.contactEmail?.trim() || "",
    subject: `Invoice ${inv.invoice_number} · ${params.accountName} · ${periodLabel}`,
    body,
  };
}

export function mailtoUrl(draft: { to: string; subject: string; body: string }): string {
  const q = new URLSearchParams({ subject: draft.subject, body: draft.body });
  return `mailto:${encodeURIComponent(draft.to)}?${q.toString()}`;
}

/* ---------------- Stripe payment link (hybrid rail) ---------------- */

export interface PaymentsStatus {
  stripe_connected: boolean;
  stripe_test_mode: boolean | null;
}

export async function checkPaymentsStatus(): Promise<PaymentsStatus> {
  try {
    const { data, error } = await supabase.functions.invoke("stripe-payments-admin", {
      body: { action: "status" },
    });
    if (error) return { stripe_connected: false, stripe_test_mode: null };
    return {
      stripe_connected: Boolean((data as any)?.connected),
      stripe_test_mode: (data as any)?.test_mode ?? null,
    };
  } catch {
    return { stripe_connected: false, stripe_test_mode: null };
  }
}

/** Create a Stripe Payment Link tied to this invoice. Idempotent — reuses an existing link. */
export async function createInvoicePaymentLink(invoiceId: string): Promise<{ url: string } | { error: string }> {
  const { data, error } = await supabase.functions.invoke("stripe-payments-admin", {
    body: { action: "create_invoice_payment_link", invoice_id: invoiceId },
  });
  if (error) {
    // supabase-js swallows the body on non-2xx; try to read it.
    const anyErr = error as any;
    const details = anyErr?.context ? await anyErr.context.text().catch(() => "") : "";
    return { error: details || anyErr.message || "Failed to create payment link" };
  }
  if ((data as any)?.error) return { error: (data as any).error };
  const url = (data as any)?.url as string | undefined;
  if (!url) return { error: "No URL returned" };
  return { url };
}

/* ---------------- Branded email send (Resend) ---------------- */

export interface SendInvoiceEmailResult {
  ok: boolean;
  messageId?: string | null;
  to?: string;
  error?: string;
  detail?: string;
}

export async function sendInvoiceEmail(params: {
  invoiceId: string;
  to?: string;
  subject?: string;
  message?: string;
}): Promise<SendInvoiceEmailResult> {
  const { data, error } = await supabase.functions.invoke("send-invoice-email", {
    body: {
      invoice_id: params.invoiceId,
      to: params.to?.trim() || undefined,
      subject: params.subject?.trim() || undefined,
      message: params.message?.trim() || undefined,
      confirmed: true,
    },
  });
  if (error) {
    const anyErr = error as any;
    const bodyText = anyErr?.context ? await anyErr.context.text().catch(() => "") : "";
    let parsed: any = {};
    try { parsed = bodyText ? JSON.parse(bodyText) : {}; } catch { /* raw text */ }
    return {
      ok: false,
      error: parsed?.error || anyErr.message || "send_failed",
      detail: parsed?.detail || bodyText || undefined,
    };
  }
  if ((data as any)?.success === false) {
    return { ok: false, error: (data as any).error, detail: (data as any).detail };
  }
  return {
    ok: true,
    messageId: (data as any)?.messageId ?? null,
    to: (data as any)?.to,
  };
}

