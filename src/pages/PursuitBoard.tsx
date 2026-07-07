import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { LayoutGrid, User } from "lucide-react";
import { HeatBadge, signalHeat } from "@/components/SignalsPanel";
import { toast } from "sonner";
import { queueAction } from "@/lib/queue-actions";
import { differenceInDays } from "date-fns";
import { pipelineRollup, fmtUsd, type Schedule } from "@/lib/revenue-math";
import { useWorkspaceSettings, stageProbability } from "@/lib/workspace-settings";
import ViewMenu from "@/components/ViewMenu";
import { useViewPref } from "@/lib/view-prefs";
import { changeItemState, maybeQueueAutopilotOrder } from "@/lib/state-transitions";
import { activeWorkOrdersByItem, orderTypeLabel, type WorkOrder } from "@/lib/work-orders";
import PursuitSlideOut from "@/components/PursuitSlideOut";
import DispositionDialog from "@/components/dialogs/DispositionDialog";
import { Switch } from "@/components/ui/switch";


interface State { id: string; name: string; label: string; color: string; sort_order: number; category?: string; }
interface Pursuit {
  id: string; title: string; state_id: string; account_id: string; updated_at: string;
  metadata: any; accounts?: { id: string; name: string; metadata: any } | null;
}

const TERMINAL_STATES = new Set(["case_closed"]);
const DISPOSITION_NAMES = new Set(["case_open", "case_closed"]);

export default function PursuitBoard() {
  const { workspace } = useWorkspace();
  const { settings, save: saveSettings } = useWorkspaceSettings(workspace?.id);
  const workspaceAutopilot = (settings as any)?.autopilot === true;
  const [states, setStates] = useState<State[]>([]);
  const [pursuits, setPursuits] = useState<Pursuit[]>([]);
  const [signalsBySlug, setSignalsBySlug] = useState<Record<string, { ts: string }[]>>({});
  const [schedulesByItem, setSchedulesByItem] = useState<Record<string, Schedule[]>>({});
  const [primaryContactByAccount, setPrimaryContactByAccount] = useState<Record<string, { name: string; email: string | null }>>({});
  const [workOrdersByItem, setWorkOrdersByItem] = useState<Record<string, WorkOrder[]>>({});
  const [loading, setLoading] = useState(true);

  const [dragId, setDragId] = useState<string | null>(null);
  const [openPursuitId, setOpenPursuitId] = useState<string | null>(null);
  const [pendingDisposition, setPendingDisposition] = useState<{ pursuitId: string; targetStateId: string; kind: "case_open" | "case_closed" } | null>(null);
  const [showRaw,      setShowRaw]      = useViewPref("board.showRaw",      true);
  const [showWeighted, setShowWeighted] = useViewPref("board.showWeighted", false);
  const [showContact,  setShowContact]  = useViewPref("board.showContact",  true);

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
    // Only the pursuit ladder appears on this board. client_ops states live on /app/clients.
    const pursuitStates = ((st || []) as any[]).filter(s => (s as any).category !== "client_ops");
    setStates(pursuitStates as any);
    const list = (it || []) as any as Pursuit[];
    setPursuits(list);

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

    const { data: rev } = await (supabase as any)
      .from("revenue_schedules")
      .select("id, workspace_id, account_id, item_id, kind, amount_usd, cadence, status, description, start_date, end_date, next_due, metadata")
      .eq("workspace_id", workspace.id);
    const revMap: Record<string, Schedule[]> = {};
    for (const r of rev || []) {
      if (!r.item_id) continue;
      (revMap[r.item_id] ||= []).push(r as any);
    }
    setSchedulesByItem(revMap);

    // Primary contact per account (oldest by created_at wins, matching AccountDetail ordering)
    const accountIds = Array.from(new Set(list.map(p => p.account_id)));
    if (accountIds.length > 0) {
      const { data: cts } = await supabase
        .from("contacts")
        .select("account_id, name, email, created_at")
        .in("account_id", accountIds)
        .order("created_at", { ascending: true });
      const pMap: Record<string, { name: string; email: string | null }> = {};
      for (const c of cts || []) {
        if (!pMap[(c as any).account_id]) pMap[(c as any).account_id] = { name: (c as any).name, email: (c as any).email };
      }
      setPrimaryContactByAccount(pMap);
    } else {
      setPrimaryContactByAccount({});
    }

    // Active work orders per item · powers the "Queued for COB" chips.
    const woMap = await activeWorkOrdersByItem(list.map(p => p.id));
    setWorkOrdersByItem(woMap);

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

  const applyStateChange = async (pursuitId: string, targetStateId: string, disposition?: { followUpDate?: string; reason: string }) => {
    const pursuit = pursuits.find(p => p.id === pursuitId);
    if (!pursuit) return;
    const target = states.find(s => s.id === targetStateId);
    const prevStateId = pursuit.state_id;

    setPursuits(prev => prev.map(p => p.id === pursuitId ? { ...p, state_id: targetStateId } : p));

    const res = await changeItemState({
      item: { id: pursuitId, account_id: pursuit.account_id, workspace_id: workspace?.id },
      targetStateId,
      states,
      disposition,
    });
    if (!res.ok) {
      setPursuits(prev => prev.map(p => p.id === pursuitId ? { ...p, state_id: prevStateId } : p));
      toast.error(res.error || "Move blocked");
      return;
    }

    const targetName = (target?.name || target?.label || "").toLowerCase();
    if (/agreement/.test(targetName)) {
      try {
        await queueAction({
          itemId: pursuitId,
          type: "internal_task",
          channel: "system",
          source: "system",
          triggerState: target?.name,
          payloadJson: { task: "stand_up_revenue", note: "Stand up revenue schedule + Stripe links for this pursuit." },
          idempotencyKey: `stand_up_revenue:${pursuitId}`,
        });
      } catch (err) { console.warn("queue stand_up_revenue task failed", err); }
    }

    // Autopilot: pre-queue the intelligence work order tied to the newly-entered state.
    if (workspace?.id && res.state?.name) {
      try {
        const ap = await maybeQueueAutopilotOrder({
          item: { id: pursuitId, account_id: pursuit.account_id, workspace_id: workspace.id, metadata: pursuit.metadata },
          newStateName: res.state.name,
          workspaceAutopilot,
        });
        if (ap.queued && ap.orderType) toast.info(`Autopilot queued · ${orderTypeLabel(ap.orderType)}`);
      } catch (e) { console.warn("autopilot queue failed", e); }
    }

    toast.success("Moved");
    // Refresh so client_ops mirror + WO chips reflect everywhere.
    load();
  };


  const onDrop = async (e: React.DragEvent, stateId: string) => {
    e.preventDefault();
    const id = dragId; setDragId(null);
    if (!id) return;
    const pursuit = pursuits.find(p => p.id === id);
    if (!pursuit || pursuit.state_id === stateId) return;
    const target = states.find(s => s.id === stateId);
    if (!target) return;
    // Disposition states require a dialog (date + reason for case_open, reason for case_closed).
    if (target.name === "case_open" || target.name === "case_closed") {
      setPendingDisposition({ pursuitId: id, targetStateId: stateId, kind: target.name });
      return;
    }
    await applyStateChange(id, stateId);
  };

  const stateNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of states) m[s.id] = s.name;
    return m;
  }, [states]);

  const rollup = useMemo(() => pipelineRollup({
    pursuits: pursuits.map(p => ({ id: p.id, state_id: p.state_id, state_name: stateNameById[p.state_id], metadata: p.metadata })),
    schedulesByItem,
    stageProbabilityByStateName: (name) => stageProbability(settings, name),
    stateNameById: (id) => stateNameById[id] ?? null,
  }), [pursuits, schedulesByItem, stateNameById, settings]);

  const rollupLines = states
    .filter(s => rollup[s.id] && (rollup[s.id].oneTime > 0 || rollup[s.id].monthly > 0))
    .map(s => {
      const r = rollup[s.id];
      const raw: string[] = [];
      if (r.oneTime > 0) raw.push(`${fmtUsd(r.oneTime)} one-time`);
      if (r.monthly > 0) raw.push(`${fmtUsd(r.monthly)}/mo`);
      const weighted: string[] = [];
      if (r.weightedOneTime > 0) weighted.push(`${fmtUsd(r.weightedOneTime)}`);
      if (r.weightedMonthly > 0) weighted.push(`${fmtUsd(r.weightedMonthly)}/mo`);
      const suffix = r.fromFallback ? " · seed" : "";
      const rawText = showRaw ? raw.join(" + ") : "";
      const weightedText = showWeighted && weighted.length ? `${showRaw ? " → " : ""}weighted ${weighted.join(" + ")}` : "";
      const body = `${rawText}${weightedText}${suffix}`.trim();
      if (!body) return null;
      return `${s.label}: ${body}`;
    })
    .filter(Boolean) as string[];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Pursuit Board"
        subtitle="Drag pursuits between states"
        actions={
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground cursor-pointer">
              <span>Autopilot</span>
              <Switch
                checked={workspaceAutopilot}
                onCheckedChange={async (v) => {
                  await saveSettings({ autopilot: v } as any);
                  toast.success(`Autopilot ${v ? "ON" : "OFF"} · workspace default`);
                }}
              />
              <span className={workspaceAutopilot ? "text-dossier-brass" : ""}>{workspaceAutopilot ? "on" : "off"}</span>
            </label>
            <ViewMenu toggles={[
              { label: "Show raw pipeline",   value: showRaw,      onChange: setShowRaw },
              { label: "Show weighted",       value: showWeighted, onChange: setShowWeighted },
              { label: "Show primary contact", value: showContact,  onChange: setShowContact },
            ]} />
          </div>
        }
      />

      {rollupLines.length > 0 && (showRaw || showWeighted) && (
        <div className="px-6 py-2 border-b border-border text-[11px] font-mono text-muted-foreground bg-muted/10 overflow-x-auto whitespace-nowrap">
          Pipeline · {rollupLines.join(" · ")}
        </div>
      )}
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
                    const stateName = stateNameById[p.state_id];
                    const followUp = stateName === "case_open" ? md.follow_up_date as string | undefined : undefined;
                    const resurface = followUp ? new Date(followUp) <= new Date() : false;
                    const dnc = p.accounts?.metadata?.do_not_contact === true;
                    const wos = workOrdersByItem[p.id] || [];
                    return (

                      <button
                        key={p.id}
                        type="button"
                        draggable
                        onDragStart={() => setDragId(p.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setOpenPursuitId(p.id)}
                        className={`w-full text-left block bg-background border rounded p-3 transition-colors cursor-grab active:cursor-grabbing ${resurface ? "border-dossier-brass ring-1 ring-dossier-brass/40" : "border-border hover:border-dossier-brass/50"}`}
                      >
                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate">{accountName}</div>
                        <div className="text-sm font-medium mt-0.5 line-clamp-2">{p.title}</div>
                        {showContact && primaryContactByAccount[p.account_id] && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] font-mono text-muted-foreground truncate">
                            <User size={10} />
                            <span className="truncate">{primaryContactByAccount[p.account_id].name}</span>
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                          {md.score != null && <span className="px-1.5 py-0.5 border border-border rounded">score {md.score}</span>}
                          {md.cohort && <span className="px-1.5 py-0.5 border border-border rounded truncate max-w-[14ch]">{md.cohort}</span>}
                          <span className="px-1.5 py-0.5 border border-border rounded text-muted-foreground">{days}d</span>
                          <HeatBadge heat={heat} />
                          {md.subdomain_slug && <span className="px-1.5 py-0.5 border border-border rounded text-muted-foreground">/{md.subdomain_slug}</span>}
                          {followUp && (
                            <span className={`px-1.5 py-0.5 border rounded ${resurface ? "border-dossier-brass text-dossier-brass" : "border-border text-muted-foreground"}`}>
                              revisit · {followUp}
                            </span>
                          )}
                          {dnc && <span className="px-1.5 py-0.5 border border-destructive/60 text-destructive rounded">DNC</span>}
                        </div>
                      </button>
                    );
                  })}
                  {items.length === 0 && <div className="text-[10px] font-mono text-muted-foreground px-1">empty</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <PursuitSlideOut
        pursuitId={openPursuitId}
        open={!!openPursuitId}
        onOpenChange={(v) => { if (!v) setOpenPursuitId(null); }}
        states={states}
        onChanged={load}
      />
      {pendingDisposition && (
        <DispositionDialog
          open={!!pendingDisposition}
          onOpenChange={(v) => { if (!v) setPendingDisposition(null); }}
          disposition={pendingDisposition.kind}
          onConfirm={async (args) => {
            const { pursuitId, targetStateId } = pendingDisposition;
            setPendingDisposition(null);
            await applyStateChange(pursuitId, targetStateId, args);
          }}
        />
      )}
    </div>
  );
}
