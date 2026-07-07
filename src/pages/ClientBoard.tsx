import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Users, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";
import { fmtUsd } from "@/lib/revenue-math";
import { changeItemState } from "@/lib/state-transitions";
import { loadChecklistForAccounts, progress } from "@/lib/onboarding";

interface State { id: string; name: string; label: string; color: string; sort_order: number; category?: string; }
interface ClientItem {
  id: string; title: string; state_id: string; account_id: string; updated_at: string;
  metadata: any; accounts?: { id: string; name: string; metadata: any } | null;
  item_states?: { name: string } | null;
}

export default function ClientBoard() {
  const { workspace } = useWorkspace();
  const [states, setStates] = useState<State[]>([]);
  const [items, setItems] = useState<ClientItem[]>([]);
  const [mrrByAccount, setMrrByAccount] = useState<Record<string, number>>({});
  const [signalsByAccount, setSignalsByAccount] = useState<Record<string, number>>({});
  const [onboardingPctByAccount, setOnboardingPctByAccount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const [{ data: st }, { data: it }] = await Promise.all([
      supabase.from("item_states").select("*").eq("workspace_id", workspace.id).order("sort_order"),
      supabase.from("items")
        .select("id, title, state_id, account_id, updated_at, metadata, accounts(id, name, metadata), item_states(name)")
        .eq("workspace_id", workspace.id)
        .eq("type", "client_ops"),
    ]);
    const opsStates = ((st || []) as any[]).filter(s => (s as any).category === "client_ops");
    setStates(opsStates as any);
    const list = (it || []) as any as ClientItem[];
    setItems(list);

    const accountIds = Array.from(new Set(list.map(i => i.account_id)));
    if (accountIds.length > 0) {
      const { data: rev } = await (supabase as any)
        .from("revenue_schedules")
        .select("account_id, amount_usd, cadence, status, counted")
        .in("account_id", accountIds);
      const map: Record<string, number> = {};
      for (const r of rev || []) {
        if (r.counted === false) continue;
        if (r.cadence === "monthly" && (r.status === "active" || r.status === "invoiced" || r.status === "paid")) {
          map[r.account_id] = (map[r.account_id] || 0) + Number(r.amount_usd || 0);
        }
      }
      setMrrByAccount(map);

      const slugs = list.map(i => i.accounts?.metadata?.utm_slug).filter(Boolean) as string[];
      if (slugs.length > 0) {
        const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
        const { data: se } = await supabase
          .from("site_events")
          .select("utm_source")
          .in("utm_source", slugs)
          .gte("ts", cutoff)
          .limit(1000);
        const slugCount: Record<string, number> = {};
        for (const e of se || []) {
          const s = (e as any).utm_source as string;
          slugCount[s] = (slugCount[s] || 0) + 1;
        }
        const acctSignal: Record<string, number> = {};
        for (const i of list) {
          const slug = i.accounts?.metadata?.utm_slug;
          if (slug && slugCount[slug]) acctSignal[i.account_id] = slugCount[slug];
        }
        setSignalsByAccount(acctSignal);
      } else {
        setSignalsByAccount({});
      }
    } else {
      setMrrByAccount({});
      setSignalsByAccount({});
    }

    // Onboarding progress for accounts currently in client_onboarding state.
    const onboardingAccountIds = list
      .filter(i => (i.item_states as any)?.name === "client_onboarding")
      .map(i => i.account_id);
    if (onboardingAccountIds.length > 0) {
      const cl = await loadChecklistForAccounts(onboardingAccountIds);
      const pctMap: Record<string, number> = {};
      for (const [aid, rows] of Object.entries(cl)) pctMap[aid] = progress(rows).pct;
      setOnboardingPctByAccount(pctMap);
    } else {
      setOnboardingPctByAccount({});
    }
    setLoading(false);
  }, [workspace]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => {
    const grouped: Record<string, ClientItem[]> = {};
    for (const i of items) (grouped[i.state_id] ||= []).push(i);
    return states.map(s => ({ state: s, items: grouped[s.id] || [] }));
  }, [states, items]);

  const onDrop = async (e: React.DragEvent, stateId: string) => {
    e.preventDefault();
    const id = dragId; setDragId(null);
    if (!id) return;
    const item = items.find(p => p.id === id);
    if (!item || item.state_id === stateId) return;
    const prev = item.state_id;
    setItems(list => list.map(p => p.id === id ? { ...p, state_id: stateId } : p));
    const res = await changeItemState({
      item: { id, account_id: item.account_id, workspace_id: workspace!.id },
      targetStateId: stateId,
      states,
    });
    if (!res.ok) {
      setItems(list => list.map(p => p.id === id ? { ...p, state_id: prev } : p));
      toast.error(res.error || "Move blocked");
      return;
    }
    toast.success("Moved");
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Client Board"
        subtitle="Post-agreement operations · membership driven by pursuit reaching client"
      />
      {loading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : columns.length === 0 ? (
        <EmptyState icon={Users} title="No client states" description="Client operations ladder not configured for this workspace." />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Cards appear here automatically when a pursuit reaches state=client."
        />
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-3 h-full min-w-max">
            {columns.map(({ state, items: colItems }) => (
              <div
                key={state.id}
                className="w-72 shrink-0 flex flex-col bg-muted/30 border border-border rounded"
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => onDrop(e, state.id)}
              >
                <div className="px-3 py-2 border-b border-border flex items-center gap-2 sticky top-0 bg-muted/50 backdrop-blur">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: state.color }} />
                  <span className="text-xs font-mono uppercase tracking-wider">{state.label}</span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{colItems.length}</span>
                </div>
                <div className="p-2 space-y-2 overflow-y-auto">
                  {colItems.map(p => {
                    const md = p.accounts?.metadata || {};
                    const mrr = mrrByAccount[p.account_id] || 0;
                    const signalCt = signalsByAccount[p.account_id] || 0;
                    const days = differenceInDays(new Date(), new Date(p.updated_at));
                    const dnc = md.do_not_contact === true;
                    const fleet = md.fleet_status as string | undefined;
                    const onboardingPct = (p.item_states as any)?.name === "client_onboarding"
                      ? onboardingPctByAccount[p.account_id] : undefined;
                    return (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={() => setDragId(p.id)}
                        onDragEnd={() => setDragId(null)}
                        className="w-full text-left block bg-background border border-border rounded p-3 hover:border-dossier-brass/50 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <div className="text-sm font-medium truncate">{p.accounts?.name || "—"}</div>
                        {onboardingPct != null && (
                          <div className="mt-1.5">
                            <div className="h-1 bg-muted rounded overflow-hidden">
                              <div className="h-full bg-dossier-brass" style={{ width: `${onboardingPct}%` }} />
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">onboarding · {onboardingPct}%</div>
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                          {mrr > 0 && <span className="px-1.5 py-0.5 border border-dossier-brass/40 text-dossier-brass rounded">{fmtUsd(mrr)}/mo</span>}
                          {signalCt > 0 && <span className="px-1.5 py-0.5 border border-border rounded">{signalCt} signals · 7d</span>}
                          <span className="px-1.5 py-0.5 border border-border rounded text-muted-foreground">{days}d</span>
                          {fleet && <span className="px-1.5 py-0.5 border border-status-green/50 text-status-green rounded uppercase">fleet · {fleet}</span>}
                          {dnc && (
                            <span className="px-1.5 py-0.5 border border-destructive/60 text-destructive rounded flex items-center gap-1">
                              <AlertTriangle size={9} /> DNC
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {colItems.length === 0 && <div className="text-[10px] font-mono text-muted-foreground px-1">empty</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
