import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { writeAuditEvent } from "@/lib/audit";
import { toast } from "sonner";
import { Schedule, amt, fmtUsd } from "@/lib/revenue-math";

interface Props {
  rows: Schedule[];
  onEdit: (s: Schedule) => void;
  onCancel: (s: Schedule) => void;
  onChanged: () => void;
  pursuits: { id: string; title: string; account_id: string; state_id: string }[];
  actorEmail?: string | null;
}

const STORE = "revenue.ledger.expanded";

function statusChip(status: string): string {
  if (status === "paid" || status === "active") return "text-status-green border-status-green/40";
  if (status === "overdue") return "text-status-red border-status-red/40";
  if (status === "invoiced" || status === "agreement_pending") return "text-dossier-brass border-dossier-brass/40";
  if (status === "cancelled") return "text-muted-foreground border-border line-through";
  return "text-muted-foreground border-border";
}

export default function GroupedLedger({ rows, onEdit, onCancel, onChanged, pursuits, actorEmail }: Props) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(expanded)); } catch { /* noop */ }
  }, [expanded]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const bucket = new Map<string, { name: string; account_id: string; rows: Schedule[] }>();
    for (const r of rows) {
      if (needle) {
        const hay = `${r.accounts?.name ?? ""} ${r.description ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      const key = r.account_id;
      const name = r.accounts?.name ?? "—";
      let g = bucket.get(key);
      if (!g) { g = { name, account_id: key, rows: [] }; bucket.set(key, g); }
      g.rows.push(r);
    }
    return Array.from(bucket.values()).sort((a, z) => a.name.localeCompare(z.name));
  }, [rows, filter]);

  const setAllExpanded = (v: boolean) => {
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.account_id] = v;
    setExpanded(next);
  };
  const isOpen = (id: string) => expanded[id] !== false; // default open

  const toggleCounted = async (s: Schedule, next: boolean) => {
    setPendingId(s.id);
    const { error } = await (supabase as any)
      .from("revenue_schedules")
      .update({ counted: next })
      .eq("id", s.id);
    if (error) { toast.error(error.message); setPendingId(null); return; }
    await writeAuditEvent({
      accountId: s.account_id,
      itemId: s.item_id ?? undefined,
      subject: next ? "revenue schedule counted" : "revenue schedule excluded",
      changes: [{ field: "counted", before: !next, after: next }],
      actorEmail,
      extra: { schedule_id: s.id, description: s.description, amount_usd: s.amount_usd, kind: s.kind },
    });
    setPendingId(null);
    onChanged();
  };

  const toggleAccount = async (g: { account_id: string; rows: Schedule[] }, next: boolean) => {
    const targets = g.rows.filter(r => (r.counted !== false) !== next);
    if (targets.length === 0) return;
    setPendingId(g.account_id);
    const { error } = await (supabase as any)
      .from("revenue_schedules")
      .update({ counted: next })
      .in("id", targets.map(r => r.id));
    if (error) { toast.error(error.message); setPendingId(null); return; }
    await writeAuditEvent({
      accountId: g.account_id,
      subject: next ? "all account schedules counted" : "all account schedules excluded",
      changes: [{ field: "counted", before: !next, after: next }],
      actorEmail,
      extra: { schedule_ids: targets.map(r => r.id) },
    });
    setPendingId(null);
    onChanged();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-2">Ledger · grouped by account</div>
        <Input
          placeholder="Filter account or description…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="h-7 w-64 text-xs font-mono"
        />
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => setAllExpanded(true)}>Expand all</Button>
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => setAllExpanded(false)}>Collapse all</Button>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{groups.length} account(s)</span>
      </div>

      <div className="border border-border rounded overflow-hidden">
        {groups.map(g => {
          const open = isOpen(g.account_id);
          const counted = g.rows.filter(r => r.counted !== false && r.status !== "cancelled");
          const oneTime = counted.filter(r => r.kind === "one_time").reduce((a, r) => a + amt(r), 0);
          const mrr = counted.filter(r => r.kind === "subscription").reduce((a, r) => a + amt(r), 0);
          const nextDue = counted
            .map(r => r.next_due).filter(Boolean).sort()[0] as string | undefined;
          const allCounted = g.rows.every(r => r.counted !== false);
          const noneCounted = g.rows.every(r => r.counted === false);
          const master: boolean | "indeterminate" = allCounted ? true : noneCounted ? false : "indeterminate";
          const excludedCount = g.rows.filter(r => r.counted === false).length;

          return (
            <div key={g.account_id} className="border-b border-border last:border-b-0">
              <button
                onClick={() => setExpanded(prev => ({ ...prev, [g.account_id]: !open }))}
                className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 text-xs font-mono text-left"
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Link to={`/control/desk/accounts/${g.account_id}`} onClick={e => e.stopPropagation()}
                      className="font-medium hover:text-dossier-brass truncate">{g.name}</Link>
                <span className="text-muted-foreground">· {g.rows.length} schedule(s){excludedCount > 0 && <span className="ml-1 text-dossier-brass">· {excludedCount} excluded</span>}</span>
                <span className="ml-auto flex items-center gap-3">
                  {oneTime > 0 && <span>{fmtUsd(oneTime)} <span className="text-muted-foreground">one-time</span></span>}
                  {mrr > 0 && <span className="text-dossier-brass">{fmtUsd(mrr)}/mo</span>}
                  {nextDue && <span className="text-muted-foreground">next {nextDue}</span>}
                  <span
                    className="inline-flex items-center gap-1 pl-3 border-l border-border"
                    onClick={e => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={master}
                      onCheckedChange={(v) => toggleAccount(g, Boolean(v))}
                      disabled={pendingId === g.account_id}
                      aria-label="Count all schedules in this account"
                    />
                    <span className="text-[10px] text-muted-foreground">count all</span>
                  </span>
                </span>
              </button>

              {open && (
                <table className="w-full text-xs font-mono">
                  <tbody className="divide-y divide-border">
                    {g.rows.map(r => {
                      const excluded = r.counted === false;
                      const p = r.item_id ? pursuits.find(x => x.id === r.item_id) : null;
                      return (
                        <tr key={r.id} className={`hover:bg-muted/10 ${excluded ? "opacity-60" : ""}`}>
                          <td className="pl-8 pr-2 py-1.5 w-8">
                            <Checkbox
                              checked={!excluded}
                              onCheckedChange={(v) => toggleCounted(r, Boolean(v))}
                              disabled={pendingId === r.id}
                              aria-label="Count in revenue"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className={`flex items-center gap-2 ${excluded ? "line-through" : ""}`}>
                              <span>{r.description}</span>
                              {excluded && <span className="text-[9px] uppercase tracking-wider text-dossier-brass border border-dossier-brass/40 rounded px-1 no-underline">excluded</span>}
                            </div>
                            {p && (
                              <Link to={`/control/desk/items/${p.id}`} className="text-[10px] text-muted-foreground hover:text-dossier-brass">
                                ↳ {p.title}
                              </Link>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground w-20">{r.kind === "one_time" ? "one-time" : "sub"}</td>
                          <td className={`px-2 py-1.5 text-right w-32 ${excluded ? "line-through" : ""}`}>
                            {fmtUsd(amt(r))}{r.cadence === "monthly" ? "/mo" : ""}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground w-24">{r.next_due ?? "—"}</td>
                          <td className="px-2 py-1.5 w-32">
                            <span className={`px-1.5 py-0.5 border rounded ${statusChip(r.status)}`}>
                              {r.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right w-24 whitespace-nowrap">
                            <Button size="sm" variant="ghost" onClick={() => onEdit(r)} title="Edit">
                              <Pencil size={12} />
                            </Button>
                            {r.status !== "cancelled" && (
                              <Button size="sm" variant="ghost" onClick={() => onCancel(r)} title="Cancel (soft delete)">
                                <X size={12} />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <div className="p-6 text-center text-xs font-mono text-muted-foreground">No accounts match.</div>
        )}
      </div>
    </div>
  );
}
