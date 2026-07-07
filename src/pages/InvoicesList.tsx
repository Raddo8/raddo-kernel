import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import { useWorkspaceSettings, DEFAULT_INVOICE_STARTING_NUMBER } from "@/lib/workspace-settings";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Printer, Copy, RefreshCw, Ban, Check, Send, Pencil, Settings, Mail, ExternalLink,
} from "lucide-react";
import { fmtUsd } from "@/lib/revenue-math";
import {
  generateDraftsForMonth, invoiceStatusTone, invoiceStatusLabel, fmtDate,
  markInvoicePaid, voidInvoice, issueInvoice, sweepOverdue,
  updateInvoiceEditable, buildIssueEmailDraft, mailtoUrl, fmtMoneyPlain,
  parseMonthInputLocal,
  createInvoicePaymentLink, sendInvoiceEmail, checkPaymentsStatus,
  type Invoice, type InvoiceStatus, type PaidVia, type InvoiceLineItem,
  type PaymentsStatus,
} from "@/lib/invoices";
import InvoiceDocument from "@/components/invoice/InvoiceDocument";

const STATUS_FILTERS: (InvoiceStatus | "all")[] = [
  "all", "draft", "auto_draft", "issued", "sent", "paid", "overdue", "void",
];

type AccountLite = {
  id: string; name: string;
  billing_mode?: "manual" | "auto_draft";
  primary_contact_id?: string | null;
  metadata?: any;
};
type ContactLite = { name: string | null; email: string | null };

export default function InvoicesList() {
  const { workspace, userEmail } = useWorkspace();
  const { settings, save: saveSettings } = useWorkspaceSettings(workspace?.id ?? null);
  const remittance = (settings?.invoicing?.remittance ?? "").toString();
  const startingNumber = Number(settings?.invoicing?.starting_number ?? DEFAULT_INVOICE_STARTING_NUMBER);

  const [rows, setRows] = useState<Invoice[]>([]);
  const [accounts, setAccounts] = useState<Record<string, AccountLite>>({});
  const [contacts, setContacts] = useState<Record<string, ContactLite>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [accountFilter, setAccountFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [payDialog, setPayDialog] = useState<Invoice | null>(null);
  const [voidDialog, setVoidDialog] = useState<Invoice | null>(null);
  const [editDialog, setEditDialog] = useState<Invoice | null>(null);
  const [issueDialog, setIssueDialog] = useState<Invoice | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paidVia, setPaidVia] = useState<PaidVia>("bank");
  const [paidNote, setPaidNote] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [paymentsStatus, setPaymentsStatus] = useState<PaymentsStatus | null>(null);

  const load = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    const [{ data: invs }, { data: accs }] = await Promise.all([
      (supabase as any).from("invoices")
        .select("*, accounts!inner(id, name, billing_mode, primary_contact_id, metadata)")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false }),
      (supabase as any).from("accounts")
        .select("id, name, billing_mode, primary_contact_id, metadata")
        .eq("workspace_id", workspace.id),
    ]);
    setRows((invs || []) as Invoice[]);
    const accMap: Record<string, AccountLite> = {};
    for (const a of accs || []) accMap[a.id] = a;
    setAccounts(accMap);
    const contactIds = (accs || []).map((a: any) => a.primary_contact_id).filter(Boolean);
    const contactByAccount: Record<string, ContactLite> = {};
    if (contactIds.length) {
      const { data: cs } = await (supabase as any).from("contacts")
        .select("id, name, email").in("id", contactIds);
      const cMap: Record<string, any> = {};
      for (const c of cs || []) cMap[c.id] = c;
      for (const a of accs || []) {
        if (a.primary_contact_id && cMap[a.primary_contact_id]) {
          contactByAccount[a.id] = cMap[a.primary_contact_id];
        }
      }
    }
    // Fallback: metadata.cob_profile.primary_contact
    for (const a of accs || []) {
      if (contactByAccount[a.id]) continue;
      const p = a?.metadata?.cob_profile?.primary_contact;
      if (p?.email) contactByAccount[a.id] = { name: p?.name ?? null, email: p.email };
    }
    setContacts(contactByAccount);
    setLoading(false);
  }, [workspace?.id]);

  useEffect(() => { load(); }, [load]);

  // Sweep overdue on mount + probe Stripe status.
  useEffect(() => {
    if (!workspace?.id) return;
    sweepOverdue(workspace.id).catch(() => {});
    checkPaymentsStatus().then(setPaymentsStatus).catch(() => setPaymentsStatus(null));
  }, [workspace?.id]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (accountFilter !== "__all__" && r.account_id !== accountFilter) return false;
    return true;
  }), [rows, statusFilter, accountFilter]);

  const generate = async (scoped: boolean) => {
    if (!workspace?.id) return;
    setBusy(true);
    try {
      // LOCAL-TIME PARSE: the month picker's YYYY-MM must become the 1st of that
      // month in the user's local zone. UTC parsing was pushing users west of
      // UTC into the previous month.
      const monthDate = parseMonthInputLocal(month);
      const res = await generateDraftsForMonth({
        workspaceId: workspace.id,
        billingPeriod: monthDate,
        accountIdFilter: scoped && accountFilter !== "__all__" ? accountFilter : undefined,
        actorEmail: userEmail ?? null,
      });
      const monthLabel = format(monthDate, "MMM yyyy");
      if (res.created === 0) {
        toast.info(`No new invoices for ${monthLabel} · ${res.skipped} skipped`);
      } else {
        const summary = res.details
          .slice(0, 4)
          .map((d) => `${d.invoice_number} · due ${d.due_date}`)
          .join(" · ");
        toast.success(
          `Generated ${res.created} for ${monthLabel} (skipped ${res.skipped})${summary ? " · " + summary : ""}${res.details.length > 4 ? " · …" : ""}`,
        );
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate");
    } finally { setBusy(false); }
  };

  const doIssueConfirmed = async (inv: Invoice) => {
    if (await issueInvoice({ invoice: inv, actorEmail: userEmail ?? null })) {
      toast.success(`${inv.invoice_number} issued`);
      setIssueDialog(null);
      await load();
    }
  };

  const doMarkPaid = async () => {
    if (!payDialog) return;
    const ok = await markInvoicePaid({
      invoice: payDialog, paidVia, note: paidNote.trim() || undefined,
      actorEmail: userEmail ?? null,
    });
    if (ok) {
      toast.success("Marked paid");
      setPayDialog(null); setPaidNote(""); setPaidVia("bank");
      await load();
    } else toast.error("Failed to mark paid");
  };

  const doVoid = async () => {
    if (!voidDialog || !voidReason.trim()) return;
    const ok = await voidInvoice({
      invoice: voidDialog, reason: voidReason, actorEmail: userEmail ?? null,
    });
    if (ok) {
      toast.success("Voided");
      setVoidDialog(null); setVoidReason("");
      await load();
    } else toast.error("Failed");
  };

  const doPrint = () => window.print();

  const previewAccount = preview ? accounts[preview.account_id] || null : null;
  const previewContact = preview ? contacts[preview.account_id] || null : null;

  const accountList = useMemo(
    () => Object.values(accounts).sort((a, b) => a.name.localeCompare(b.name)),
    [accounts],
  );

  return (
    <div className="flex flex-col h-full print:h-auto">
      <div className="print:hidden">
        <PageHeader
          title="Invoices"
          subtitle="Branded documents · derived from revenue schedules"
          actions={
            <div className="flex items-center gap-2">
              <Input
                type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="w-40"
              />
              <Button variant="outline" size="sm" onClick={() => generate(false)} disabled={busy || !workspace?.id}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Generate for {format(parseMonthInputLocal(month), "MMM yyyy")}
              </Button>
              {accountFilter !== "__all__" && (
                <Button variant="outline" size="sm" onClick={() => generate(true)} disabled={busy}>
                  Generate for account only
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} title="Billing settings">
                <Settings className="w-3.5 h-3.5" />
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-auto print:overflow-visible">
        <div className="p-4 flex items-center gap-2 border-b border-border print:hidden">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(s => (
                <SelectItem key={s} value={s}>{s === "all" ? "all statuses" : invoiceStatusLabel(s as InvoiceStatus)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-56 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">all accounts</SelectItem>
              {accountList.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs font-mono text-muted-foreground">
            {filtered.length} of {rows.length} · next # will be COB-{new Date().getFullYear()}-
            {String(startingNumber).padStart(5, "0")} +
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices"
            description="Generate drafts for a month or wait for scheduled runs."
          />
        ) : (
          <table className="w-full text-sm print:hidden">
            <thead className="bg-muted/30 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Number</th>
                <th className="text-left px-4 py-2">Account</th>
                <th className="text-left px-4 py-2">Period</th>
                <th className="text-right px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">Issue</th>
                <th className="text-left px-4 py-2">Due</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Mode</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const acc = accounts[inv.account_id];
                return (
                  <tr
                    key={inv.id}
                    className="border-t border-border hover:bg-muted/20 cursor-pointer"
                    onClick={() => setPreview(inv)}
                  >
                    <td className="px-4 py-2 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-2">
                      <Link
                        to={`/app/accounts/${inv.account_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="underline decoration-dotted underline-offset-2"
                      >
                        {acc?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {format(parseMonthInputLocal(inv.billing_period.slice(0, 7)), "MMM yyyy")}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {fmtUsd(Number(inv.total))}
                    </td>
                    <td className="px-4 py-2 text-xs">{fmtDate(inv.issue_date)}</td>
                    <td className="px-4 py-2 text-xs">{fmtDate(inv.due_date)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-1.5 py-0.5 text-[10px] font-mono uppercase border rounded ${invoiceStatusTone(inv.status)}`}>
                        {invoiceStatusLabel(inv.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[10px] font-mono uppercase text-muted-foreground">
                      {inv.billing_mode.replace("_", " ")}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {inv.status !== "paid" && inv.status !== "void" && (
                          <Button size="sm" variant="ghost" onClick={() => setEditDialog(inv)} title="Edit">
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                        {(inv.status === "draft" || inv.status === "auto_draft") && (
                          <Button size="sm" variant="outline" onClick={() => setIssueDialog(inv)}>
                            <Send className="w-3 h-3 mr-1" /> Issue
                          </Button>
                        )}
                        {inv.status !== "paid" && inv.status !== "void" && (
                          <Button size="sm" variant="ghost" onClick={() => setPayDialog(inv)} title="Mark paid">
                            <Check className="w-3 h-3" />
                          </Button>
                        )}
                        {inv.status !== "void" && (
                          <Button size="sm" variant="ghost" onClick={() => setVoidDialog(inv)} title="Void">
                            <Ban className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Preview drawer */}
      <Sheet open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <SheetContent side="right" className="w-full sm:max-w-[900px] overflow-y-auto">
          <SheetHeader className="print:hidden">
            <SheetTitle className="flex items-center justify-between">
              <span>{preview?.invoice_number}</span>
              <div className="flex gap-2">
                {preview && preview.status !== "paid" && preview.status !== "void" && (
                  <Button size="sm" variant="outline" onClick={() => setEditDialog(preview)}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={doPrint}>
                  <Printer className="w-3.5 h-3.5 mr-1.5" /> Print / PDF
                </Button>
              </div>
            </SheetTitle>
          </SheetHeader>
          {preview && (
            <div className="mt-4 invoice-print-scope">
              <InvoiceDocument
                invoice={preview}
                account={previewAccount}
                contact={previewContact}
                remittance={remittance}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit dialog */}
      <EditInvoiceDialog
        invoice={editDialog}
        onClose={() => setEditDialog(null)}
        onSaved={async () => { setEditDialog(null); await load(); }}
        actorEmail={userEmail ?? null}
      />

      {/* Issue → email draft dialog */}
      <IssueEmailDialog
        invoice={issueDialog}
        account={issueDialog ? accounts[issueDialog.account_id] ?? null : null}
        contact={issueDialog ? contacts[issueDialog.account_id] ?? null : null}
        workspaceName={workspace?.name ?? null}
        remittance={remittance}
        onCancel={() => setIssueDialog(null)}
        onConfirm={doIssueConfirmed}
      />

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Billing settings</DialogTitle></DialogHeader>
          <SettingsForm
            initialStartingNumber={startingNumber}
            initialRemittance={remittance}
            onSave={async (patch) => {
              const res = await saveSettings({
                invoicing: { ...(settings?.invoicing || {}), ...patch },
              });
              if (res?.error) { toast.error(res.error.message); return false; }
              toast.success("Saved");
              setSettingsOpen(false);
              return true;
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Mark paid dialog */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark {payDialog?.invoice_number} paid</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={paidVia} onValueChange={(v) => setPaidVia(v as PaidVia)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">bank transfer</SelectItem>
                <SelectItem value="stripe">stripe (manual reconcile)</SelectItem>
                <SelectItem value="manual">other · manual</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Note (e.g., 'found it in the bank deposit 7/12')"
              value={paidNote} onChange={(e) => setPaidNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayDialog(null)}>Cancel</Button>
            <Button onClick={doMarkPaid}>Mark paid</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void dialog */}
      <Dialog open={!!voidDialog} onOpenChange={(o) => !o && setVoidDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Void {voidDialog?.invoice_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Reason (required)"
              value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVoidDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doVoid} disabled={!voidReason.trim()}>Void invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Edit dialog ---------------- */

function EditInvoiceDialog({
  invoice, onClose, onSaved, actorEmail,
}: {
  invoice: Invoice | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  actorEmail: string | null;
}) {
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [period, setPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<InvoiceLineItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setIssueDate(invoice.issue_date || "");
    setDueDate(invoice.due_date || "");
    setPeriod((invoice.billing_period || "").slice(0, 7));
    setNotes(invoice.notes || "");
    setLines((invoice.line_items || []).map((l) => ({ ...l })));
  }, [invoice?.id]);

  if (!invoice) return null;
  const financeLocked = invoice.status === "paid" || invoice.status === "void";
  const subtotal = lines.reduce((n, l) => n + Number(l.amount_usd || 0), 0);

  const save = async () => {
    setSaving(true);
    const ok = await updateInvoiceEditable({
      invoice,
      patch: {
        issue_date: issueDate,
        due_date: dueDate,
        billing_period: financeLocked ? undefined : (period ? `${period}-01` : invoice.billing_period),
        notes: financeLocked ? undefined : notes,
        line_items: financeLocked ? undefined : lines,
      },
      actorEmail,
    });
    setSaving(false);
    if (ok) { toast.success("Invoice updated"); await onSaved(); }
    else toast.error("Failed to save");
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit {invoice.invoice_number}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {financeLocked && (
            <div className="text-xs font-mono text-status-amber">
              Status is {invoice.status} · financials locked · dates still editable.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-mono space-y-1">
              <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Issue date</div>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </label>
            <label className="text-xs font-mono space-y-1">
              <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Due date</div>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label className="text-xs font-mono space-y-1">
              <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Billing period</div>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} disabled={financeLocked} />
            </label>
            <div />
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Line items</div>
            <div className="space-y-2 max-h-64 overflow-auto pr-1">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr,110px,110px,32px] gap-2 items-center">
                  <Input
                    value={l.description}
                    onChange={(e) => {
                      const next = [...lines]; next[i] = { ...l, description: e.target.value };
                      setLines(next);
                    }}
                    disabled={financeLocked}
                    placeholder="Description"
                  />
                  <Input
                    type="date" value={l.occurrence_date}
                    onChange={(e) => {
                      const next = [...lines]; next[i] = { ...l, occurrence_date: e.target.value };
                      setLines(next);
                    }}
                    disabled={financeLocked}
                  />
                  <Input
                    type="number" inputMode="decimal" step="0.01" className="text-right font-mono"
                    value={l.amount_usd}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...l, amount_usd: Number(e.target.value) };
                      setLines(next);
                    }}
                    disabled={financeLocked}
                  />
                  <Button variant="ghost" size="sm" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={financeLocked}>
                    <Ban className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {!financeLocked && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => setLines([...lines, { schedule_id: "", occurrence_date: dueDate || format(new Date(), "yyyy-MM-dd"), description: "", amount_usd: 0 }])}
                >
                  + add line
                </Button>
              )}
            </div>
            <div className="text-right text-sm font-mono tabular-nums">
              Subtotal · {fmtMoneyPlain(subtotal)}
            </div>
          </div>

          <label className="text-xs font-mono space-y-1 block">
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Notes</div>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={financeLocked} rows={3} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !issueDate || !dueDate}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Issue → email dialog ---------------- */

function IssueEmailDialog({
  invoice, account, contact, workspaceName, remittance, onCancel, onConfirm,
}: {
  invoice: Invoice | null;
  account: AccountLite | null;
  contact: ContactLite | null;
  workspaceName: string | null;
  remittance: string;
  onCancel: () => void;
  onConfirm: (inv: Invoice) => Promise<void> | void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!invoice) return;
    const draft = buildIssueEmailDraft({
      invoice,
      accountName: account?.name ?? "your account",
      contactName: contact?.name ?? null,
      contactEmail: contact?.email ?? null,
      remittance,
      workspaceName,
    });
    setTo(draft.to);
    setSubject(draft.subject);
    setBody(draft.body);
  }, [invoice?.id, account?.id, contact?.email, remittance, workspaceName]);

  if (!invoice) return null;

  const doCopy = async () => {
    const full = `To: ${to}\nSubject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(full);
      toast.success("Email copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const doMailto = () => {
    window.location.href = mailtoUrl({ to, subject, body });
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4" /> Issue {invoice.invoice_number} · outbound email
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[70px,1fr] gap-2 items-center text-xs font-mono">
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">To</div>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="billing@client.com" />
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Subject</div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className="font-mono text-xs" />
          {!remittance && (
            <div className="text-[11px] font-mono text-status-amber">
              No remittance instructions set · add them in Billing settings so wire details appear here automatically.
            </div>
          )}
          {!to && (
            <div className="text-[11px] font-mono text-status-amber">
              No recipient · add a primary contact email on the account or set metadata.cob_profile.primary_contact.email.
            </div>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="outline" onClick={doCopy}><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy</Button>
          <Button variant="outline" onClick={doMailto} disabled={!to}>
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open in email
          </Button>
          <Button onClick={() => onConfirm(invoice)}>Mark issued</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Settings form ---------------- */

function SettingsForm({
  initialStartingNumber, initialRemittance, onSave,
}: {
  initialStartingNumber: number;
  initialRemittance: string;
  onSave: (patch: { starting_number?: number; remittance?: string }) => Promise<boolean>;
}) {
  const [starting, setStarting] = useState<number>(initialStartingNumber);
  const [remit, setRemit] = useState<string>(initialRemittance);
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-4">
      <label className="text-xs font-mono space-y-1 block">
        <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Invoice starting number</div>
        <Input
          type="number" min={1} value={starting}
          onChange={(e) => setStarting(parseInt(e.target.value || "0", 10) || 0)}
        />
        <div className="text-[10px] text-muted-foreground">
          Preview · COB-{new Date().getFullYear()}-{String(Math.max(1, starting)).padStart(5, "0")}
        </div>
      </label>
      <label className="text-xs font-mono space-y-1 block">
        <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
          Remittance / wiring instructions
        </div>
        <Textarea
          rows={8} value={remit} onChange={(e) => setRemit(e.target.value)}
          placeholder={"Bank name:\nRouting:\nAccount number:\nBeneficiary:\nMemo:"}
        />
        <div className="text-[10px] text-muted-foreground">
          Rendered on printable invoices and prefilled in the Issue email.
        </div>
      </label>
      <DialogFooter>
        <Button
          onClick={async () => {
            setSaving(true);
            await onSave({ starting_number: starting, remittance: remit });
            setSaving(false);
          }}
          disabled={saving}
        >Save</Button>
      </DialogFooter>
    </div>
  );
}
