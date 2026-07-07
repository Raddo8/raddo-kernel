import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { LayoutGrid } from "lucide-react";
import { HeatBadge, signalHeat } from "@/components/SignalsPanel";
import { toast } from "sonner";
import { writeTimelineEvent } from "@/lib/timeline-events";
import { queueAction } from "@/lib/queue-actions";
import { differenceInDays } from "date-fns";

interface State { id: string; name: string; label: string; color: string; sort_order: number; }
interface Pursuit {
  id: string; title: string; state_id: string; account_id: string; updated_at: string;
  metadata: any; accounts?: { id: string; name: string; metadata: any } | null;
}

const TERMINAL_STATES = new Set(["lost", "parked"]);

interface RevRow { item_id: string | null; kind: string; amount_usd: number | string; cadence: string; status: string; }

export default function PursuitBoard() {
  const { workspace } = useWorkspace();
  const [states, setStates] = useState<State[]>([]);
  const [pursuits, setPursuits] = useState<Pursuit[]>([]);
  const [signalsBySlug, setSignalsBySlug] = useState<Record<string, { ts: string }[]>>({});
  const [revByItem, setRevByItem] = useState<Record<string, RevRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const [{ data: st }, { data: it }] = await Promise.all([
      supabase.from("item_states").select("*").eq("workspace_id", workspace.id).order("sort_order"),
      supabase.from("items")
        .select("id, title, state_id, account_id, updated_at, metadata, accounts(id, name, metadata)")
        .eq("workspace_id", workspace.id)
        .eq("type", "pursuit"),
    ]);
    setStates((st || []) as any);
    const list = (it || []) as any as Pursuit[];
    setPursuits(list);

    // Gather utm slugs & fetch signals in one round-trip
    const slugs = Array.from(new Set(
      list.map(p => p.accounts?.metadata?.utm_slug).filter(Boolean)
    )) as string[];
    if (slugs.length > 0) {
      const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data: se } = await supabase
        .from("site_events")
        .select("ts, utm_source")
        .in("utm_source", slugs)
        .gte("ts", cutoff)
        .limit(1000);
      const map: Record<string, { ts: string }[]> = {};
      for (const e of se || []) {
        const s = (e as any).utm_source as string;
        (map[s] ||= []).push({ ts: (e as any).ts });
      }
      setSignalsBySlug(map);
    } else {
      setSignalsBySlug({});
    }

    // Fetch revenue schedules for rollup
    const { data: rev } = await (supabase as any)
      .from("revenue_schedules")
      .select("item_id, kind, amount_usd, cadence, status")
      .eq("workspace_id", workspace.id);
    const revMap: Record<string, RevRow[]> = {};
    for (const r of rev || []) {
      if (!r.item_id) continue;
      (revMap[r.item_id] ||= []).push(r as RevRow);
    }
    setRevByItem(revMap);

    setLoading(false);
  }, [workspace]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => {
    const grouped: Record<string, Pursuit[]> = {};
    for (const p of pursuits) (grouped[p.state_id] ||= []).push(p);
    return states
      .filter(s => !TERMINAL_STATES.has(s.name) || (grouped[s.id] && grouped[s.id].length > 0))
      .map(s => ({ state: s, items: grouped[s.id] || [] }));
  }, [states, pursuits]);

  const onDrop = async (e: React.DragEvent, stateId: string) => {
    e.preventDefault();
    const id = dragId; setDragId(null);
    if (!id) return;
    const pursuit = pursuits.find(p => p.id === id);
    if (!pursuit || pursuit.state_id === stateId) return;
    const target = states.find(s => s.id === stateId);

    // Optimistic update
    setPursuits(prev => prev.map(p => p.id === id ? { ...p, state_id: stateId } : p));

    const { error } = await supabase.from("items").update({ state_id: stateId }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    await writeTimelineEvent({
      accountId: pursuit.account_id,
      itemId: id,
      direction: "system",
      channel: "system",
      summary: `State changed to ${target?.label || "unknown"}`,
    });

    // Playbook hook: pursuit → agreement fires an internal task.
    const targetName = (target?.name || target?.label || "").toLowerCase();
    if (/agreement/.test(targetName)) {
      try {
        await queueAction({
          itemId: id,
          type: "internal_task",
          channel: "system",
          source: "system",
          triggerState: target?.name,
          payloadJson: { task: "stand_up_revenue", note: "Stand up revenue schedule + Stripe links for this pursuit." },
          idempotencyKey: `stand_up_revenue:${id}`,
        });
      } catch (err) {
        console.warn("queue stand_up_revenue task failed", err);
      }
    }

    toast.success("Moved");
  };

  const rollup = useMemo(() => {
    const per: Record<string, { oneTime: number; monthly: number }> = {};
    for (const p of pursuits) {
      const rows = revByItem[p.id] || [];
      const bucket = per[p.state_id] ||= { oneTime: 0, monthly: 0 };
      for (const r of rows) {
        if (r.status === "cancelled") continue;
        const v = typeof r.amount_usd === "string" ? parseFloat(r.amount_usd) : r.amount_usd;
        if (!Number.isFinite(v)) continue;
        if (r.kind === "one_time") bucket.oneTime += v;
        else if (r.kind === "subscription") bucket.monthly += v;
      }
    }
    return per;
  }, [pursuits, revByItem]);

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  const rollupLine = states
    .filter(s => rollup[s.id] && (rollup[s.id].oneTime > 0 || rollup[s.id].monthly > 0))
    .map(s => {
      const r = rollup[s.id];
      const parts: string[] = [];
      if (r.oneTime > 0) parts.push(`${fmt(r.oneTime)} one-time`);
      if (r.monthly > 0) parts.push(`${fmt(r.monthly)}/mo`);
      return `${s.label}: ${parts.join(" + ")}`;
    })
    .join(" · ");

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Pursuit Board" subtitle="Drag pursuits between states" />
      {loading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : columns.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="No states" description="Configure item states for this workspace." />
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-3 h-full min-w-max">
            {columns.map(({ state, items }) => (
              <div
                key={state.id}
                className="w-72 shrink-0 flex flex-col bg-muted/30 border border-border rounded"
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => onDrop(e, state.id)}
              >
                <div className="px-3 py-2 border-b border-border flex items-center gap-2 sticky top-0 bg-muted/50 backdrop-blur">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: state.color }} />
                  <span className="text-xs font-mono uppercase tracking-wider">{state.label}</span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{items.length}</span>
                </div>
                <div className="p-2 space-y-2 overflow-y-auto">
                  {items.map(p => {
                    const md = p.metadata || {};
                    const accountName = p.accounts?.name || "—";
                    const slug = p.accounts?.metadata?.utm_slug;
                    const heat = slug ? signalHeat(signalsBySlug[slug] || []) : "cold";
                    const days = differenceInDays(new Date(), new Date(p.updated_at));
                    return (
                      <Link
                        key={p.id}
                        to={`/app/items/${p.id}`}
                        draggable
                        onDragStart={() => setDragId(p.id)}
                        onDragEnd={() => setDragId(null)}
                        className="block bg-background border border-border rounded p-3 hover:border-dossier-brass/50 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate">{accountName}</div>
                        <div className="text-sm font-medium mt-0.5 line-clamp-2">{p.title}</div>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                          {md.score != null && <span className="px-1.5 py-0.5 border border-border rounded">score {md.score}</span>}
                          {md.cohort && <span className="px-1.5 py-0.5 border border-border rounded truncate max-w-[14ch]">{md.cohort}</span>}
                          <span className="px-1.5 py-0.5 border border-border rounded text-muted-foreground">{days}d</span>
                          <HeatBadge heat={heat} />
                          {md.subdomain_slug && <span className="px-1.5 py-0.5 border border-border rounded text-muted-foreground">/{md.subdomain_slug}</span>}
                        </div>
                      </Link>
                    );
                  })}
                  {items.length === 0 && <div className="text-[10px] font-mono text-muted-foreground px-1">empty</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
