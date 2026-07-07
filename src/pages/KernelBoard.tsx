/**
 * Kernel Build Board · /app/onboarding/kernel
 *
 * One card per onboarding CLIENT (client_ops item). Columns = fixed kernel
 * phases (Agreement & Access → LIVE). Each card carries per-phase checklists
 * seeded on first entry to the onboarding state.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Boxes, Check, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  KERNEL_PHASES, PHASE_KEYS, LIVE_PHASE, phaseIndex,
  loadChecklistForAccounts, seedChecklist, toggleChecklistItem,
  addChecklistItem, deleteChecklistItem, setKernelPhase,
  type ChecklistRow, progress,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link } from "react-router-dom";

interface OpsItem {
  id: string;
  workspace_id: string;
  account_id: string;
  metadata: any;
  accounts?: { id: string; name: string } | null;
}

export default function KernelBoard() {
  const { workspace, userEmail } = useWorkspace();
  const [items, setItems] = useState<OpsItem[]>([]);
  const [checklist, setChecklist] = useState<Record<string, ChecklistRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addLabel, setAddLabel] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const { data } = await supabase.from("items")
      .select("id, workspace_id, account_id, metadata, accounts(id, name)")
      .eq("workspace_id", workspace.id)
      .eq("type", "client_ops");
    const list = ((data || []) as any as OpsItem[]);
    setItems(list);
    // Ensure checklists exist (idempotent) for any accounts missing rows.
    const accountIds = Array.from(new Set(list.map(i => i.account_id)));
    if (accountIds.length > 0) {
      await Promise.all(accountIds.map(id => seedChecklist(workspace.id, id)));
      const map = await loadChecklistForAccounts(accountIds);
      setChecklist(map);
    } else {
      setChecklist({});
    }
    setLoading(false);
  }, [workspace]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => {
    const grouped: Record<string, OpsItem[]> = {};
    for (const i of items) {
      const phase = (i.metadata?.kernel_phase as string) || PHASE_KEYS[0];
      (grouped[phase] ||= []).push(i);
    }
    return KERNEL_PHASES.map(p => ({ phase: p, items: grouped[p.key] || [] }));
  }, [items]);

  const applyMove = async (item: OpsItem, phase: string) => {
    const prev = (item.metadata?.kernel_phase as string) || PHASE_KEYS[0];
    if (prev === phase) return;
    setItems(list => list.map(i => i.id === item.id
      ? { ...i, metadata: { ...(i.metadata || {}), kernel_phase: phase } }
      : i));
    const res = await setKernelPhase({
      itemId: item.id, accountId: item.account_id,
      workspaceId: item.workspace_id, phase,
    });
    if (!res.ok) {
      setItems(list => list.map(i => i.id === item.id
        ? { ...i, metadata: { ...(i.metadata || {}), kernel_phase: prev } }
        : i));
      toast.error(res.error || "Move blocked");
      return;
    }
    if (phase === LIVE_PHASE) toast.success("Kernel LIVE · client marked Active");
    else toast.success(`Phase → ${KERNEL_PHASES.find(p => p.key === phase)?.label}`);
    load();
  };

  const onDrop = async (e: React.DragEvent, phase: string) => {
    e.preventDefault();
    const id = dragId; setDragId(null);
    if (!id) return;
    const item = items.find(i => i.id === id);
    if (!item) return;
    await applyMove(item, phase);
  };

  const openItem = openId ? items.find(i => i.id === openId) : null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Kernel Build Board"
        subtitle="One card per onboarding client · membership driven by pursuit → onboarding"
      />
      {loading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No onboarding clients"
          description="Cards appear here when a pursuit reaches state=onboarding."
        />
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-3 h-full min-w-max">
            {columns.map(({ phase, items: colItems }) => (
              <div
                key={phase.key}
                className="w-64 shrink-0 flex flex-col bg-muted/30 border border-border rounded"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, phase.key)}
              >
                <div className="px-3 py-2 border-b border-border sticky top-0 bg-muted/50 backdrop-blur">
                  <div className="text-xs font-mono uppercase tracking-wider truncate">{phase.label}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{colItems.length}</div>
                </div>
                <div className="p-2 space-y-2 overflow-y-auto">
                  {colItems.map(i => {
                    const rows = checklist[i.account_id] || [];
                    const p = progress(rows);
                    const designation = (i.metadata?.designation as string) || null;
                    const preSig = !!i.metadata?.pre_signature;
                    return (
                      <button
                        key={i.id}
                        type="button"
                        draggable
                        onDragStart={() => setDragId(i.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setOpenId(i.id)}
                        className="w-full text-left block bg-background border border-border rounded p-3 hover:border-dossier-brass/50 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <div className="text-sm font-medium truncate">{i.accounts?.name || "—"}</div>
                        <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-mono uppercase tracking-wider">
                          {designation === "regulated" && (
                            <>
                              <span className="px-1 py-0.5 border border-dossier-brass/60 text-dossier-brass rounded">regulated</span>
                              <span className="px-1 py-0.5 border border-border rounded text-muted-foreground">no customer-NPI</span>
                            </>
                          )}
                          {designation === "standard" && (
                            <span className="px-1 py-0.5 border border-border rounded text-muted-foreground">standard</span>
                          )}
                          {preSig && (
                            <span className="px-1 py-0.5 border border-border rounded text-muted-foreground">pre-signature</span>
                          )}
                        </div>
                        <div className="mt-2 h-1 bg-muted rounded overflow-hidden">
                          <div className="h-full bg-dossier-brass" style={{ width: `${p.pct}%` }} />
                        </div>
                        <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                          {p.done}/{p.total} · {p.pct}%
                        </div>
                      </button>
                    );
                  })}
                  {colItems.length === 0 && <div className="text-[10px] font-mono text-muted-foreground px-1">empty</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Sheet open={!!openItem} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {openItem && (
            <div className="space-y-4">
              <SheetHeader>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Kernel</div>
                <SheetTitle className="text-lg">
                  <Link to={`/app/accounts/${openItem.account_id}`} className="hover:text-dossier-brass">
                    {openItem.accounts?.name}
                  </Link>
                </SheetTitle>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                  <span className="text-muted-foreground uppercase tracking-wider">Designation:</span>
                  {(["standard","regulated"] as const).map(d => {
                    const active = ((openItem.metadata?.designation as string) || "standard") === d;
                    return (
                      <button key={d} type="button"
                        onClick={async () => {
                          const meta = { ...(openItem.metadata || {}), designation: d };
                          await supabase.from("items").update({ metadata: meta }).eq("id", openItem.id);
                          load();
                        }}
                        className={cn("px-1.5 py-0.5 rounded border uppercase tracking-wider",
                          active ? "border-dossier-brass text-dossier-brass" : "border-border text-muted-foreground hover:border-dossier-brass/40")}>
                        {d}
                      </button>
                    );
                  })}
                  {openItem.metadata?.designation === "regulated" && (
                    <span className="px-1.5 py-0.5 rounded border border-border text-muted-foreground">no customer-NPI</span>
                  )}
                  {openItem.metadata?.pre_signature && (
                    <span className="px-1.5 py-0.5 rounded border border-border text-muted-foreground">pre-signature</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                  {KERNEL_PHASES.map(p => {
                    const active = (openItem.metadata?.kernel_phase || PHASE_KEYS[0]) === p.key;
                    return (
                      <button key={p.key} type="button" onClick={() => applyMove(openItem, p.key)}
                        className={cn("px-1.5 py-0.5 rounded border",
                          active ? "border-dossier-brass text-dossier-brass" : "border-border text-muted-foreground hover:border-dossier-brass/40")}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </SheetHeader>

              <div className="space-y-3">
                {KERNEL_PHASES.filter(p => p.key !== LIVE_PHASE).map(p => {
                  const rows = (checklist[openItem.account_id] || []).filter(r => r.phase === p.key);
                  const currentPhaseIdx = phaseIndex(openItem.metadata?.kernel_phase || PHASE_KEYS[0]);
                  const thisIdx = phaseIndex(p.key);
                  return (
                    <div key={p.key} className={cn(
                      "border rounded p-3",
                      thisIdx === currentPhaseIdx ? "border-dossier-brass/60" : "border-border",
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-mono uppercase tracking-wider">{p.label}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {rows.filter(r => r.done).length}/{rows.length}
                        </div>
                      </div>
                      <div className="space-y-1">
                        {rows.map(r => (
                          <div key={r.id} className="flex items-center gap-2 group">
                            <button type="button"
                              onClick={async () => {
                                await toggleChecklistItem(r, !r.done, userEmail);
                                load();
                              }}
                              className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                r.done ? "bg-dossier-brass border-dossier-brass text-background" : "border-border")}>
                              {r.done && <Check size={10} />}
                            </button>
                            <span className={cn("text-xs flex-1 truncate", r.done && "line-through text-muted-foreground")}>
                              {r.label}
                            </span>
                            <button type="button"
                              onClick={async () => { await deleteChecklistItem(r.id); load(); }}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-1">
                        <Input
                          className="h-7 text-xs"
                          placeholder="Add item…"
                          value={addLabel[p.key] || ""}
                          onChange={(e) => setAddLabel(a => ({ ...a, [p.key]: e.target.value }))}
                          onKeyDown={async (e) => {
                            if (e.key !== "Enter") return;
                            const v = (addLabel[p.key] || "").trim();
                            if (!v) return;
                            await addChecklistItem({
                              workspaceId: openItem.workspace_id,
                              accountId: openItem.account_id,
                              phase: p.key, label: v,
                            });
                            setAddLabel(a => ({ ...a, [p.key]: "" }));
                            load();
                          }}
                        />
                        <Button variant="ghost" size="sm" className="h-7" onClick={async () => {
                          const v = (addLabel[p.key] || "").trim();
                          if (!v) return;
                          await addChecklistItem({
                            workspaceId: openItem.workspace_id,
                            accountId: openItem.account_id,
                            phase: p.key, label: v,
                          });
                          setAddLabel(a => ({ ...a, [p.key]: "" }));
                          load();
                        }}>
                          <Plus size={12} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
