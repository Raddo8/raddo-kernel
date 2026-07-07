import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, ExternalLink, Link2, RefreshCw, Plus, Pencil, X, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, addMonths, isSameMonth, isSameDay, parseISO } from "date-fns";
import RevenueScheduleDialog, { softCancelSchedule } from "@/components/dialogs/RevenueScheduleDialog";
import OccurrenceEditorDialog from "@/components/dialogs/OccurrenceEditorDialog";
import ViewMenu from "@/components/ViewMenu";
import { useViewPref } from "@/lib/view-prefs";
import { useTableSort, sortIndicator } from "@/lib/table-sort";
import {
  Schedule, Status, amt, fmtUsd, monthColumns, weekColumns, bucketize,
  fiscalQuarterOf, shiftFiscalQuarter, scheduleInstances,
  indexOverrides, type OccurrenceOverride, type OverrideIndex,
} from "@/lib/revenue-math";
import { useWorkspaceSettings, DEFAULT_STAGE_PROBABILITIES, stageProbability } from "@/lib/workspace-settings";
import RibbonChart, { BandBy } from "@/components/revenue/RibbonChart";

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

type ViewMode = "quarter" | "month" | "custom";

export default function RevenueDesk() {
  const { workspace, userEmail } = useWorkspace();
  const { settings, save } = useWorkspaceSettings(workspace?.id);
  const [rows, setRows] = useState<Schedule[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [pursuits, setPursuits] = useState<{ id: string; title: string; account_id: string; state_id: string }[]>([]);
  const [stateNameById, setStateNameById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("quarter");
  const [qOffset, setQOffset] = useState(0);
  const [customFrom, setCustomFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(addMonths(new Date(), 1), "yyyy-MM-dd"));
  const [overrides, setOverrides] = useState<OccurrenceOverride[]>([]);
  const overridesByScheduleId: OverrideIndex = useMemo(() => indexOverrides(overrides), [overrides]);
  const [occEdit, setOccEdit] = useState<{
    schedule: Schedule; baseDate: Date; amount: number; date: Date; existing: OccurrenceOverride | null;
  } | null>(null);
  const openOccEdit = useCallback((payload: { schedule: Schedule; baseDate: Date; amount: number; date: Date; override: OccurrenceOverride | null }) => {
    setOccEdit({ schedule: payload.schedule, baseDate: payload.baseDate, amount: payload.amount, date: payload.date, existing: payload.override });
  }, []);

  // Primary visual switcher · Ribbon is the new default.
  type Primary = "ribbon" | "cards" | "ledger";
  const [primaryMode, setPrimaryMode] = useState<Primary>(() => {
    try { return (localStorage.getItem("revenue.primaryMode") as Primary) || "ribbon"; } catch { return "ribbon"; }
  });
  useEffect(() => { try { localStorage.setItem("revenue.primaryMode", primaryMode); } catch { /* noop */ } }, [primaryMode]);
  const [band, setBand] = useState<BandBy>("account");

  // Segment click → filter ledger by series + week window.
  const [segFilter, setSegFilter] = useState<{ seriesKey: string; seriesLabel: string; band: BandBy; start: Date; end: Date } | null>(null);

  // View preferences · forecast overlays are OPT-IN.
  const [showCommitted, setShowCommitted] = useViewPref("revenue.showCommitted", true);
  const [showExpected,  setShowExpected]  = useViewPref("revenue.showExpected",  true);
  const [showForecast,  setShowForecast]  = useViewPref("revenue.showForecast",  false);
  const [showByStage,   setShowByStage]   = useViewPref("revenue.showByStage",   false);

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const [{ data: schedules }, { data: accs }, { data: purs }, { data: states }, { data: ovs }] = await Promise.all([
      (supabase as any).from("revenue_schedules")
        .select("*, accounts(id, name)")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: true }),
      supabase.from("accounts").select("id, name").eq("workspace_id", workspace.id).order("name"),
      supabase.from("items").select("id, title, account_id, state_id").eq("workspace_id", workspace.id).eq("type", "pursuit"),
      supabase.from("item_states").select("id, name").eq("workspace_id", workspace.id),
      (supabase as any).from("revenue_occurrence_overrides")
        .select("*")
        .eq("workspace_id", workspace.id),
    ]);
    setRows((schedules ?? []) as any);
    setAccounts((accs ?? []) as any);
    setPursuits((purs ?? []) as any);
    setOverrides((ovs ?? []) as any);
    const nameMap: Record<string, string> = {};
    for (const s of states || []) nameMap[(s as any).id] = (s as any).name;
    setStateNameById(nameMap);
    setLoading(false);
  }, [workspace]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("stripe-payments-admin", { body: { action: "status" } });
        setStripeConnected(Boolean(data?.connected));
      } catch { setStripeConnected(false); }
    })();
  }, []);

  const fiscalMonth = settings?.fiscal_year_start ?? 1;
  const stageProbForItem = useCallback((itemId: string | null) => {
    if (!itemId) return 0;
    const p = pursuits.find(x => x.id === itemId);
    if (!p) return 0;
    return stageProbability(settings, stateNameById[p.state_id]);
  }, [pursuits, stateNameById, settings]);

  const mrrActive = useMemo(
    () => rows.filter(r => r.kind === "subscription" && r.status === "active").reduce((a, r) => a + amt(r), 0),
    [rows]
  );
  const mrrPending = useMemo(
    () => rows.filter(r => r.kind === "subscription" && (r.status === "expected" || r.status === "agreement_pending" || r.status === "invoiced")).reduce((a, r) => a + amt(r), 0),
    [rows]
  );

  /* ---------- Calendar buckets ---------- */
  const now = new Date();
  const { qStart: currentQStart, fyLabel: currentFy } = fiscalQuarterOf(now, fiscalMonth);
  const activeQStart = shiftFiscalQuarter(currentQStart, qOffset);
  const activeQMeta = fiscalQuarterOf(activeQStart, fiscalMonth);

  const buckets = useMemo(() => {
    if (view === "quarter") {
      const cols = weekColumns(activeQStart, 13);
      return cols.map((c, i) => {
        const b = bucketize(rows, { start: c.start, end: c.end }, stageProbForItem, overridesByScheduleId);
        return { key: `w${i}`, label: c.label, sub: format(c.start, "MMM d"), start: c.start, end: c.end, ...b };
      });
    }
    if (view === "month") {
      const cols = monthColumns(now, 6);
      return cols.map((c, i) => {
        const b = bucketize(rows, { start: c.start, end: c.end }, stageProbForItem, overridesByScheduleId);
        return { key: `m${i}`, label: format(c.start, "MMM"), sub: format(c.start, "yyyy"), start: c.start, end: c.end, ...b };
      });
    }
    // custom
    const from = parseISO(customFrom);
    const to = parseISO(customTo);
    const b = bucketize(rows, { start: from, end: to }, stageProbForItem, overridesByScheduleId);
    return [{ key: "custom", label: format(from, "MMM d"), sub: `→ ${format(to, "MMM d")}`, start: from, end: to, ...b }];
  }, [view, rows, activeQStart, customFrom, customTo, stageProbForItem, overridesByScheduleId]);

  const totals = useMemo(() => {
    const t = { committed: 0, expected: 0, forecast: 0 };
    for (const b of buckets) { t.committed += b.committed; t.expected += b.expected; t.forecast += b.forecast; }
    return t;
  }, [buckets]);

  /* ---------- Cash flow by stage (mini chart) ---------- */
  const byStage = useMemo(() => {
    const per: Record<string, { total: number }> = {};
    for (const s of rows) {
      if (s.status === "cancelled") continue;
      const p = s.item_id ? pursuits.find(x => x.id === s.item_id) : null;
      const stateName = p ? (stateNameById[p.state_id] || "unlinked") : "unlinked";
      const bucket = per[stateName] ||= { total: 0 };
      bucket.total += amt(s);
    }
    return Object.entries(per).sort((a, b) => b[1].total - a[1].total);
  }, [rows, pursuits, stateNameById]);
  const byStageMax = byStage.reduce((m, [, v]) => Math.max(m, v.total), 0);

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
    } finally { setBusyId(null); }
  };

  const openEdit = (s: Schedule) => { setEditSchedule(s); setDialogOpen(true); };
  const cancelSchedule = async (s: Schedule) => {
    if (!window.confirm(`Cancel this schedule? (soft-delete · status → cancelled)`)) return;
    if (await softCancelSchedule(s, userEmail)) load();
  };

  const shiftQ = (delta: number) => setQOffset(qOffset + delta);

  const ledgerRows = useMemo(() => {
    if (!segFilter) return rows;
    return rows.filter(r => {
      if (r.status === "cancelled") return false;
      if (segFilter.band === "account" && r.account_id !== segFilter.seriesKey) return false;
      if (segFilter.band === "stage") {
        const p = r.item_id ? pursuits.find(x => x.id === r.item_id) : null;
        const stage = p ? (stateNameById[p.state_id] || "unlinked") : "unlinked";
        if (stage !== segFilter.seriesKey) return false;
      }
      if (segFilter.band === "status") {
        const isCommitted = ["active","invoiced","paid"].includes(r.status);
        const isExpected = ["expected","agreement_pending"].includes(r.status);
        if (segFilter.seriesKey === "committed" && !isCommitted) return false;
        if ((segFilter.seriesKey === "expected" || segFilter.seriesKey === "forecast") && !isExpected) return false;
      }
      return scheduleInstances(r, segFilter.start, segFilter.end, overridesByScheduleId[r.id] || []).length > 0;
    });
  }, [rows, segFilter, pursuits, stateNameById, overridesByScheduleId]);


  return (
    <div>
      <PageHeader
        title="Revenue"
        subtitle="Expected money in · engagement revenue (separate from platform usage)"
        actions={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => { setEditSchedule(null); setDialogOpen(true); }}>
              <Plus size={14} className="mr-1" /> Add
            </Button>
            <ViewMenu toggles={[
              { label: "Show committed",       value: showCommitted, onChange: setShowCommitted },
              { label: "Show expected",        value: showExpected,  onChange: setShowExpected },
              { label: "Show forecast",        value: showForecast,  onChange: setShowForecast },
              { label: "Show cash by stage",   value: showByStage,   onChange: setShowByStage },
            ]} />
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
              <Settings size={14} className="mr-1" /> Settings
            </Button>
            <Button size="sm" variant="ghost" onClick={load}>
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
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

          {/* Primary view + calendar controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex border border-border rounded overflow-hidden text-xs font-mono">
              {(["ribbon","cards","ledger"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setPrimaryMode(m)}
                  className={`px-3 py-1 ${primaryMode === m ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
                >{m === "ledger" ? "Ledger-only" : m.charAt(0).toUpperCase() + m.slice(1)}</button>
              ))}
            </div>
            {primaryMode !== "ledger" && (
              <div className="inline-flex border border-border rounded overflow-hidden text-xs font-mono">
                {(["quarter","month","custom"] as ViewMode[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1 ${view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
                  >{v === "quarter" ? "Quarter (13 wks)" : v}</button>
                ))}
              </div>
            )}
            {primaryMode === "ribbon" && (
              <div className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground">
                <span>Band by</span>
                <div className="inline-flex border border-border rounded overflow-hidden">
                  {(["account","stage","status"] as BandBy[]).map(b => (
                    <button
                      key={b}
                      onClick={() => setBand(b)}
                      className={`px-2 py-1 ${band === b ? "bg-muted text-foreground" : "hover:bg-muted/50"}`}
                    >{b}</button>
                  ))}
                </div>
              </div>
            )}
            {primaryMode !== "ledger" && view === "quarter" && (
              <div className="inline-flex items-center gap-1 text-xs font-mono">
                <Button size="sm" variant="ghost" onClick={() => shiftQ(-1)}><ChevronLeft size={14} /></Button>
                <span className="px-2">{activeQMeta.qLabel}</span>
                <Button size="sm" variant="ghost" onClick={() => shiftQ(+1)}><ChevronRight size={14} /></Button>
                {qOffset !== 0 && <Button size="sm" variant="ghost" onClick={() => setQOffset(0)}>today</Button>}
                <span className="ml-2 text-muted-foreground">FY starts {format(new Date(2000, fiscalMonth - 1, 1), "MMMM")}</span>
              </div>
            )}
            {primaryMode !== "ledger" && view === "custom" && (
              <div className="inline-flex items-center gap-2 text-xs font-mono">
                <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-40" />
                <span>→</span>
                <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-40" />
              </div>
            )}
            <div className="ml-auto text-xs font-mono text-muted-foreground">
              {showCommitted && <span className="text-status-green">committed {fmtUsd(totals.committed)}</span>}
              {showCommitted && showExpected && <span className="mx-1">·</span>}
              {showExpected && <span className="text-dossier-brass">expected {fmtUsd(totals.expected)}</span>}
              {(showCommitted || showExpected) && showForecast && <span className="mx-1">·</span>}
              {showForecast && <span>forecast {fmtUsd(totals.forecast)}</span>}
            </div>
          </div>

          {/* PRIMARY VISUAL · Ribbon chart (default) */}
          {primaryMode === "ribbon" && (
            <RibbonChart
              buckets={buckets.map(b => ({ key: b.key, label: b.label, sub: b.sub, start: b.start, end: b.end }))}
              schedules={rows}
              band={band}
              showForecast={showForecast}
              overridesByScheduleId={overridesByScheduleId}
              itemStateName={(id) => {
                const p = id ? pursuits.find(x => x.id === id) : null;
                return p ? (stateNameById[p.state_id] || "unlinked") : "unlinked";
              }}
              itemStageProb={(id) => stageProbForItem(id) / 100}
              accountName={(id) => accounts.find(a => a.id === id)?.name || "—"}
              onSegmentClick={({ seriesKey, seriesLabel, bucket }) =>
                setSegFilter({ seriesKey, seriesLabel, band, start: bucket.start, end: bucket.end })}
              onOccurrenceEdit={openOccEdit}
            />
          )}

          {/* Calendar grid · Cards mode */}
          {primaryMode === "cards" && (
            <div className={view === "custom" ? "" : "overflow-x-auto"}>
              <div className={
                view === "quarter" ? "grid grid-cols-13 gap-1 min-w-max" :
                view === "month" ? "grid grid-cols-6 gap-2" :
                "grid grid-cols-1 gap-2"
              } style={view === "quarter" ? { gridTemplateColumns: "repeat(13, minmax(120px, 1fr))" } : undefined}>
                {buckets.map(b => (
                  <div key={b.key} className="border border-border rounded p-2 bg-muted/10 min-h-[140px]">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{b.label}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{b.sub}</div>
                    <div className="mt-1 space-y-0.5">
                      {showCommitted && <div className="text-xs font-mono text-status-green">{fmtUsd(b.committed)}</div>}
                      {showExpected && <div className="text-xs font-mono text-dossier-brass">{fmtUsd(b.expected)}</div>}
                      {showForecast && (
                        <div
                          className="text-xs font-mono text-foreground"
                          title="forecast = committed + (expected × stage probability)"
                          style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent 0 4px, hsl(var(--muted-foreground) / .1) 4px 5px)" }}
                        >
                          {fmtUsd(b.forecast)}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {b.rows.slice(0, 4).map(({ schedule: s, when, amount, override, baseDate }) => (
                        <button
                          key={s.id + when.toISOString()}
                          onClick={() => openOccEdit({ schedule: s, baseDate, amount, date: when, override })}
                          className="w-full text-left text-[10px] font-mono text-muted-foreground truncate hover:text-dossier-brass"
                          title="Edit this month"
                        >
                          {s.accounts?.name?.split(" ")[0] ?? "—"} · {fmtUsd(amount)}
                          {s.kind === "subscription" && "/mo"}
                          {override && <span className="text-dossier-brass"> ·</span>}
                        </button>
                      ))}
                      {b.rows.length > 4 && (
                        <div className="text-[10px] font-mono text-muted-foreground">+{b.rows.length - 4} more</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cash flow by stage mini chart */}
          {showByStage && byStage.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Cash flow by stage</div>
              <div className="border border-border rounded p-3 bg-muted/10 space-y-1.5">
                {byStage.map(([stage, v]) => {
                  const pct = byStageMax > 0 ? (v.total / byStageMax) * 100 : 0;
                  return (
                    <div key={stage} className="flex items-center gap-2 text-xs font-mono">
                      <span className="w-28 truncate text-muted-foreground">{stage.replace(/_/g," ")}</span>
                      <div className="flex-1 h-2 bg-muted/30 rounded">
                        <div className="h-full bg-dossier-brass/60 rounded" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-20 text-right">{fmtUsd(v.total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Segment filter chip + per-occurrence editor list */}
          {segFilter && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-muted-foreground">Ledger filtered:</span>
                <span className="px-2 py-0.5 border border-dossier-brass/40 rounded text-dossier-brass">
                  {segFilter.band} · {segFilter.seriesLabel} · {format(segFilter.start, "MMM d")} → {format(segFilter.end, "MMM d")}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setSegFilter(null)}>clear</Button>
              </div>
              <div className="border border-border rounded bg-muted/10 divide-y divide-border">
                {ledgerRows.flatMap(r => {
                  const occs = bucketize([r], { start: segFilter.start, end: segFilter.end }, stageProbForItem, overridesByScheduleId).rows;
                  return occs.map(o => (
                    <div key={r.id + o.when.toISOString()} className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono">
                      <span className="text-muted-foreground w-24 shrink-0">{format(o.when, "MMM d")}</span>
                      <span className="flex-1 truncate">
                        <Link to={`/app/accounts/${r.account_id}`} className="hover:text-dossier-brass">{r.accounts?.name ?? "—"}</Link>
                        <span className="mx-1 text-muted-foreground">·</span>
                        {r.description}
                        {o.override && <span className="ml-1 text-dossier-brass">· override ({o.override.override_kind})</span>}
                      </span>
                      <span className="w-20 text-right">{fmtUsd(o.amount)}{r.cadence === "monthly" ? "/mo" : ""}</span>
                      <Button size="sm" variant="ghost" className="h-6"
                              onClick={() => openOccEdit({ schedule: r, baseDate: o.baseDate, amount: o.amount, date: o.when, override: o.override })}>
                        <Pencil size={11} />
                      </Button>
                    </div>
                  ));
                })}
              </div>
            </div>
          )}

          {/* Ledger · sortable + filterable, persisted per surface */}
          <LedgerTable
            rows={ledgerRows}
            onEdit={openEdit}
            onCancel={cancelSchedule}
            stripeConnected={stripeConnected}
            stripeAction={stripeAction}
            busyId={busyId}
            pursuits={pursuits}
          />
        </div>
      )}

      {/* Single dialog · schedule=null → INSERT, schedule=row → UPDATE by id.
          Consolidated to eliminate any ambiguity that produced duplicate rows. */}
      <RevenueScheduleDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditSchedule(null); }}
        onSaved={load}
        workspaceId={workspace?.id || ""}
        actorEmail={userEmail}
        schedule={editSchedule}
        accounts={accounts}
        pursuits={pursuits}
      />

      {/* Per-occurrence override editor */}
      <OccurrenceEditorDialog
        open={!!occEdit}
        onOpenChange={(v) => { if (!v) setOccEdit(null); }}
        onSaved={load}
        schedule={occEdit?.schedule ?? null}
        baseDate={occEdit?.baseDate ?? null}
        currentAmount={occEdit?.amount ?? 0}
        currentDate={occEdit?.date ?? null}
        existingOverride={occEdit?.existing ?? null}
        actorEmail={userEmail}
        workspaceId={workspace?.id || ""}
      />

      {/* Settings dialog */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        fiscalMonth={fiscalMonth}
        settings={settings}
        onSave={async (patch) => { await save(patch); }}
      />
    </div>
  );
}

/* ---------- Settings dialog: fiscal year start + stage close rates ---------- */

function SettingsDialog({
  open, onOpenChange, fiscalMonth, settings, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fiscalMonth: number;
  settings: any;
  onSave: (patch: any) => Promise<void>;
}) {
  const [fm, setFm] = useState(String(fiscalMonth));
  const [rates, setRates] = useState<Record<string, string>>({});

  useEffect(() => {
    setFm(String(fiscalMonth));
    const merged = { ...DEFAULT_STAGE_PROBABILITIES, ...(settings?.stage_probabilities || {}) };
    const asStrings: Record<string, string> = {};
    for (const [k, v] of Object.entries(merged)) asStrings[k] = String(v);
    setRates(asStrings);
  }, [open, fiscalMonth, settings]);

  const save = async () => {
    const parsedRates: Record<string, number> = {};
    for (const [k, v] of Object.entries(rates)) {
      const n = parseFloat(v);
      if (Number.isFinite(n)) parsedRates[k] = Math.max(0, Math.min(100, n));
    }
    await onSave({ fiscal_year_start: parseInt(fm, 10), stage_probabilities: parsedRates });
    onOpenChange(false);
    toast.success("Settings saved");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Revenue settings</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-mono text-muted-foreground">Fiscal year starts</label>
            <Select value={fm} onValueChange={setFm}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <SelectItem key={m} value={String(m)}>
                    {format(new Date(2000, m - 1, 1), "MMMM")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground">Stage close rates (%)</label>
            <div className="mt-1 border border-border rounded divide-y divide-border">
              {Object.entries(rates).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 px-2 py-1 text-xs font-mono">
                  <span className="w-32 truncate">{k}</span>
                  <Input
                    type="number"
                    className="h-7 w-24"
                    value={v}
                    onChange={e => setRates(prev => ({ ...prev, [k]: e.target.value }))}
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Forecast = committed + (expected × stage probability).
            </p>
          </div>
          <Button className="w-full" onClick={save}>Save settings</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Sortable/filterable ledger table ---------- */

function LedgerTable({
  rows, onEdit, onCancel, stripeConnected, stripeAction, busyId, pursuits,
}: {
  rows: Schedule[];
  onEdit: (s: Schedule) => void;
  onCancel: (s: Schedule) => void;
  stripeConnected: boolean | null;
  stripeAction: (s: Schedule, action: "create_payment_link" | "create_subscription") => void;
  busyId: string | null;
  pursuits: { id: string; title: string; account_id: string; state_id: string }[];
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");

  const filtered = useMemo(() => rows.filter(r =>
    (statusFilter === "all" || r.status === statusFilter) &&
    (kindFilter === "all" || r.kind === kindFilter)
  ), [rows, statusFilter, kindFilter]);

  const { sort, toggle, filter, setFilter, sorted } = useTableSort(filtered, {
    storageKey: "revenue.ledger",
    defaultSort: { key: "next_due", dir: "asc" },
    getters: {
      account:     (r) => r.accounts?.name ?? "",
      description: (r) => r.description,
      kind:        (r) => r.kind,
      amount:      (r) => Number(r.amount_usd),
      next_due:    (r) => r.next_due ?? "",
      status:      (r) => r.status,
    },
    filterFn: (r, needle) =>
      (r.accounts?.name ?? "").toLowerCase().includes(needle) ||
      (r.description ?? "").toLowerCase().includes(needle),
  });

  const H = ({ k, label, align = "left" }: { k: string; label: string; align?: "left"|"right" }) => (
    <th className={`px-3 py-2 select-none cursor-pointer hover:text-foreground text-${align}`} onClick={() => toggle(k)}>
      {label} <span className="text-muted-foreground/60">{sortIndicator(sort.key === k, sort.dir)}</span>
    </th>
  );

  if (rows.length === 0) {
    return (
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Ledger</div>
        <EmptyState icon={DollarSign} title="No revenue tracked" description="Add an expected fee to get started." />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-2">Ledger</div>
        <Input
          placeholder="Filter account or description…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 w-64 text-xs font-mono"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-7 w-40 text-xs font-mono"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all statuses</SelectItem>
            {["expected","agreement_pending","invoiced","active","paid","overdue","cancelled"].map(s => (
              <SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="h-7 w-32 text-xs font-mono"><SelectValue placeholder="Kind" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all kinds</SelectItem>
            <SelectItem value="one_time">one-time</SelectItem>
            <SelectItem value="subscription">subscription</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{sorted.length} row(s)</span>
      </div>
      <div className="border border-border rounded overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <H k="account" label="Account" />
              <H k="description" label="Description" />
              <H k="kind" label="Kind" />
              <H k="amount" label="Amount" align="right" />
              <H k="next_due" label="Next due" />
              <H k="status" label="Status" />
              <th className="text-left px-3 py-2">Stripe</th>
              <th className="text-right px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map(r => (
              <tr key={r.id} className="hover:bg-muted/20">
                <td className="px-3 py-2">
                  <Link to={`/app/accounts/${r.account_id}`} className="hover:text-dossier-brass">
                    {r.accounts?.name ?? "—"}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    <span>{r.description}</span>
                    {r.item_id && (() => {
                      const p = pursuits.find(x => x.id === r.item_id);
                      return p ? (
                        <Link to={`/app/items/${p.id}`} className="text-[10px] text-muted-foreground hover:text-dossier-brass truncate max-w-[24ch]">
                          ↳ {p.title}
                        </Link>
                      ) : null;
                    })()}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.kind === "one_time" ? "one-time" : "sub"}</td>
                <td className="px-3 py-2 text-right">{fmtUsd(amt(r))}{r.cadence === "monthly" ? "/mo" : ""}</td>
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
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(r)} title="Edit">
                    <Pencil size={12} />
                  </Button>
                  {r.status !== "cancelled" && (
                    <Button size="sm" variant="ghost" onClick={() => onCancel(r)} title="Cancel (soft delete)">
                      <X size={12} />
                    </Button>
                  )}
                  {stripeConnected && !r.stripe_price_id && r.kind === "one_time" && (
                    <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => stripeAction(r, "create_payment_link")}>
                      <ExternalLink size={12} className="mr-1" /> Link
                    </Button>
                  )}
                  {stripeConnected && !r.stripe_subscription_id && r.kind === "subscription" && (
                    <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => stripeAction(r, "create_subscription")}>
                      <ExternalLink size={12} className="mr-1" /> Sub
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
