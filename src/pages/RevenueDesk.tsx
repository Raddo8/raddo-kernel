import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { DollarSign, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  addMonths, format, isBefore, isSameMonth, parseISO, startOfMonth,
} from "date-fns";

type Kind = "one_time" | "subscription";
type Cadence = "once" | "monthly";
type Status = "expected" | "agreement_pending" | "invoiced" | "active" | "paid" | "overdue" | "cancelled";

interface Schedule {
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
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_link: string | null;
  metadata: any;
  accounts?: { id: string; name: string } | null;
}

const COMMITTED: Status[] = ["active", "invoiced", "paid"];
const EXPECTED: Status[] = ["expected", "agreement_pending"];

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function amt(s: Schedule): number {
  const v = typeof s.amount_usd === "string" ? parseFloat(s.amount_usd) : s.amount_usd;
  return Number.isFinite(v) ? v : 0;
}

function monthBuckets(schedules: Schedule[], monthsAhead = 6) {
  const now = new Date();
  const buckets = Array.from({ length: monthsAhead }, (_, i) => startOfMonth(addMonths(now, i)));
  return buckets.map((bStart) => {
    const bEnd = startOfMonth(addMonths(bStart, 1));
    let committed = 0;
    let expected = 0;
    const rows: { s: Schedule; when: Date }[] = [];

    for (const s of schedules) {
      if (s.status === "cancelled") continue;
      const anchorRaw = s.start_date ?? s.next_due;
      if (!anchorRaw) continue;
      const anchor = parseISO(anchorRaw);
      const endBound = s.end_date ? parseISO(s.end_date) : null;

      if (s.kind === "one_time") {
        if (isSameMonth(anchor, bStart)) {
          rows.push({ s, when: anchor });
          if (COMMITTED.includes(s.status)) committed += amt(s);
          else if (EXPECTED.includes(s.status)) expected += amt(s);
        }
        continue;
      }

      // subscription (monthly)
      if (isBefore(anchor, bEnd) && (!endBound || !isBefore(endBound, bStart))) {
        rows.push({ s, when: bStart });
        if (COMMITTED.includes(s.status)) committed += amt(s);
        else if (EXPECTED.includes(s.status)) expected += amt(s);
      }
    }

    return { bStart, committed, expected, rows };
  });
}

function statusTone(status: Status): string {
  switch (status) {
    case "paid":
    case "active":
      return "border-status-green/40 text-status-green";
    case "invoiced":
      return "border-dossier-brass/50 text-dossier-brass";
    case "overdue":
      return "border-status-red/50 text-status-red";
    case "cancelled":
      return "border-border text-muted-foreground line-through";
    case "agreement_pending":
      return "border-dossier-brass/40 text-dossier-brass";
    default:
      return "border-border text-muted-foreground";
  }
}

export default function RevenueDesk() {
  const { workspace } = useWorkspace();
  const [rows, setRows] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("revenue_schedules")
      .select("*, accounts(id, name)")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as any);
    setLoading(false);
  }, [workspace]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("stripe-payments-admin", { body: { action: "status" } });
        setStripeConnected(Boolean(data?.connected));
      } catch {
        setStripeConnected(false);
      }
    })();
  }, []);

  const buckets = useMemo(() => monthBuckets(rows, 6), [rows]);

  const mrrActive = useMemo(
    () => rows.filter(r => r.kind === "subscription" && r.status === "active").reduce((a, r) => a + amt(r), 0),
    [rows]
  );
  const mrrPending = useMemo(
    () => rows.filter(r => r.kind === "subscription" && (r.status === "expected" || r.status === "agreement_pending" || r.status === "invoiced")).reduce((a, r) => a + amt(r), 0),
    [rows]
  );

  const stripeAction = async (row: Schedule, action: "create_payment_link" | "create_subscription") => {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-payments-admin", {
        body: { action, schedule_id: row.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Stripe object created");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Stripe action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Revenue"
        subtitle="Expected money in · engagement revenue (separate from platform usage)"
        actions={
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw size={14} className="mr-1" /> Refresh
          </Button>
        }
      />

      {loading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={DollarSign} title="No revenue tracked" description="Add expected fees to see the timeline." />
      ) : (
        <div className="p-6 space-y-6">
          {/* MRR strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-border rounded p-4 bg-muted/20">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Active MRR</div>
              <div className="text-2xl font-mono mt-1">{fmtUsd(mrrActive)}</div>
            </div>
            <div className="border border-border rounded p-4 bg-muted/20">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Pending MRR</div>
              <div className="text-2xl font-mono mt-1 text-dossier-brass">{fmtUsd(mrrPending)}</div>
            </div>
            <div className="border border-border rounded p-4 bg-muted/20 flex flex-col justify-center">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Stripe</div>
              <div className="text-sm font-mono mt-1">
                {stripeConnected === null ? "Checking…" :
                 stripeConnected ? <span className="text-status-green">Connected</span> :
                 <span className="text-muted-foreground">Not connected · expected money tracked manually</span>}
              </div>
            </div>
          </div>

          {/* Expected timeline */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Expected timeline · next 6 months</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {buckets.map(({ bStart, committed, expected, rows: bRows }) => (
                <div key={bStart.toISOString()} className="border border-border rounded p-3 bg-muted/10 min-h-[110px]">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    {format(bStart, "MMM yyyy")}
                  </div>
                  <div className="mt-1 text-sm font-mono">{fmtUsd(committed + expected)}</div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    <span className="text-status-green">{fmtUsd(committed)}</span>
                    <span className="mx-1">·</span>
                    <span className="text-dossier-brass">{fmtUsd(expected)}</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {bRows.slice(0, 4).map(({ s }) => (
                      <div key={s.id + bStart.toISOString()} className="text-[10px] font-mono text-muted-foreground truncate">
                        {s.accounts?.name?.split(" ")[0] ?? "—"} · {fmtUsd(amt(s))}
                      </div>
                    ))}
                    {bRows.length > 4 && (
                      <div className="text-[10px] font-mono text-muted-foreground">+{bRows.length - 4} more</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ledger */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Ledger</div>
            <div className="border border-border rounded overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Account</th>
                    <th className="text-left px-3 py-2">Description</th>
                    <th className="text-left px-3 py-2">Kind</th>
                    <th className="text-right px-3 py-2">Amount</th>
                    <th className="text-left px-3 py-2">Cadence</th>
                    <th className="text-left px-3 py-2">Next due</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Stripe</th>
                    <th className="text-right px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <Link to={`/app/accounts/${r.account_id}`} className="hover:text-dossier-brass">
                          {r.accounts?.name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{r.description}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.kind === "one_time" ? "one-time" : "sub"}</td>
                      <td className="px-3 py-2 text-right">{fmtUsd(amt(r))}{r.cadence === "monthly" ? "/mo" : ""}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.cadence}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.next_due ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 border rounded ${statusTone(r.status)}`}>
                          {r.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.stripe_payment_link ? (
                          <a href={r.stripe_payment_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-dossier-brass hover:underline">
                            <Link2 size={12} /> link
                          </a>
                        ) : r.stripe_subscription_id ? (
                          <span className="text-status-green">sub {r.stripe_subscription_id.slice(-6)}</span>
                        ) : r.stripe_price_id ? (
                          <span className="text-muted-foreground">price ready</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {stripeConnected && !r.stripe_price_id && r.kind === "one_time" && (
                          <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => stripeAction(r, "create_payment_link")}>
                            <ExternalLink size={12} className="mr-1" /> Create payment link
                          </Button>
                        )}
                        {stripeConnected && !r.stripe_subscription_id && r.kind === "subscription" && (
                          <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => stripeAction(r, "create_subscription")}>
                            <ExternalLink size={12} className="mr-1" /> Create subscription
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
