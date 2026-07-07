import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
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
import { DollarSign, FileText, Printer, Copy, RefreshCw, Ban, Check, Send } from "lucide-react";
import { fmtUsd } from "@/lib/revenue-math";
import {
  generateDraftsForMonth, invoiceStatusTone, invoiceStatusLabel, fmtDate,
  markInvoicePaid, voidInvoice, issueInvoice, sweepOverdue,
  type Invoice, type InvoiceStatus, type PaidVia,
} from "@/lib/invoices";
import InvoiceDocument from "@/components/invoice/InvoiceDocument";

const STATUS_FILTERS: (InvoiceStatus | "all")[] = [
  "all", "draft", "auto_draft", "issued", "sent", "paid", "overdue", "void",
];

export default function InvoicesList() {
  const { workspace, userEmail } = useWorkspace();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [accounts, setAccounts] = useState<Record<string, { id: string; name: string; billing_mode?: any }>>({});
  const [contacts, setContacts] = useState<Record<string, { name: string | null; email: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM"));
  const [accountFilter, setAccountFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [payDialog, setPayDialog] = useState<Invoice | null>(null);
  const [voidDialog, setVoidDialog] = useState<Invoice | null>(null);
  const [paidVia, setPaidVia] = useState<PaidVia>("bank");
  const [paidNote, setPaidNote] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const load = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    const [{ data: invs }, { data: accs }] = await Promise.all([
      (supabase as any).from("invoices")
        .select("*, accounts!inner(id, name, billing_mode, primary_contact_id)")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false }),
      (supabase as any).from("accounts")
        .select("id, name, billing_mode, primary_contact_id")
        .eq("workspace_id", workspace.id),
    ]);
    setRows((invs || []) as Invoice[]);
    const accMap: Record<string, any> = {};
    for (const a of accs || []) accMap[a.id] = a;
    setAccounts(accMap);
    // Load primary contacts for preview quality.
    const contactIds = (accs || []).map((a: any) => a.primary_contact_id).filter(Boolean);
    if (contactIds.length) {
      const { data: cs } = await (supabase as any).from("contacts")
        .select("id, name, email").in("id", contactIds);
      const cMap: Record<string, any> = {};
      for (const c of cs || []) cMap[c.id] = c;
      // reindex by account_id via accs
      const contactByAccount: Record<string, any> = {};
      for (const a of accs || []) {
        if (a.primary_contact_id && cMap[a.primary_contact_id]) {
          contactByAccount[a.id] = cMap[a.primary_contact_id];
        }
      }
      setContacts(contactByAccount);
    }
    setLoading(false);
  }, [workspace?.id]);

  useEffect(() => { load(); }, [load]);

  // Sweep overdue on mount.
  useEffect(() => {
    if (!workspace?.id) return;
    sweepOverdue(workspace.id).catch(() => {});
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
      const monthDate = new Date(month + "-01T00:00:00Z");
      const res = await generateDraftsForMonth({
        workspaceId: workspace.id,
        billingPeriod: monthDate,
        accountIdFilter: scoped && accountFilter !== "__all__" ? accountFilter : undefined,
        actorEmail: userEmail ?? null,
      });
      toast.success(`Created ${res.created} · skipped ${res.skipped}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate");
    } finally { setBusy(false); }
  };

  const doIssue = async (inv: Invoice) => {
    if (await issueInvoice({ invoice: inv, actorEmail: userEmail ?? null })) {
      toast.success(`${inv.invoice_number} issued`);
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

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => toast.success("Payment link copied"));
  };

  const doPrint = () => {
    // Uses the dedicated print CSS: hides chrome, prints the .invoice-doc block only.
    window.print();
  };

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
                Generate for {format(new Date(month + "-01"), "MMM yyyy")}
              </Button>
              {accountFilter !== "__all__" && (
                <Button variant="outline" size="sm" onClick={() => generate(true)} disabled={busy}>
                  Generate for account only
                </Button>
              )}
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
            {filtered.length} of {rows.length}
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
                <th className="text-left px-4 py-2">Due</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Mode</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const acc = accounts[inv.account_id];
                const isPending = acc?.billing_mode === "manual"; // just for badge decoration if pursuit still agreement_pending
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
                      {format(new Date(inv.billing_period), "MMM yyyy")}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {fmtUsd(Number(inv.total))}
                    </td>
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
                        {(inv.status === "draft" || inv.status === "auto_draft") && (
                          <Button size="sm" variant="outline" onClick={() => doIssue(inv)}>
                            <Send className="w-3 h-3 mr-1" /> Issue
                          </Button>
                        )}
                        {inv.stripe_payment_link && (
                          <Button size="sm" variant="ghost" onClick={() => copyLink(inv.stripe_payment_link!)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                        {inv.status !== "paid" && inv.status !== "void" && (
                          <Button size="sm" variant="ghost" onClick={() => setPayDialog(inv)}>
                            <Check className="w-3 h-3" />
                          </Button>
                        )}
                        {inv.status !== "void" && (
                          <Button size="sm" variant="ghost" onClick={() => setVoidDialog(inv)}>
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
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

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
