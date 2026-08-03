import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, isSameDay, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, LayoutGrid } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/** Shapes mirror the read-only RPC contracts; the page never writes. */
interface BlueprintRow {
  id: string;
  title: string;
  intent: string | null;
  status: string | null;
  owner: string | null;
  loop_cadence: string | null;
  current_state: string | null;
  next_action: string | null;
  milestones: unknown;
  version: number | null;
  updated_at: string | null;
}

interface ScheduledRow {
  id: string;
  blueprint_id: string | null;
  program: string | null;
  title: string | null;
  detail: string | null;
  run_at: string | null;
  cadence: string | null;
  seq: number | null;
  status: string | null;
  outcome: string | null;
  spec_status: string | null;
  gates_total: number | null;
  gates_passed: number | null;
  owner: string | null;
  build_spec?: unknown;
}

type Selection =
  | { kind: "scheduled"; row: ScheduledRow }
  | { kind: "blueprint"; row: BlueprintRow }
  | null;

const MONO = "font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground";

const READ_ONLY_NOTE =
  "Builds are created, scheduled, and moved through your COB Connector · just ask your COB.";

function notifyReadOnly() {
  toast(READ_ONLY_NOTE);
}

function milestonesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((m) => (typeof m === "string" ? m : JSON.stringify(m)));
  return [];
}

/** Board stage derivation · order matters, first match wins. */
function stageOf(row: ScheduledRow): string {
  const status = (row.status ?? "").toLowerCase();
  const spec = (row.spec_status ?? "").toUpperCase();
  if (status === "completed") return "Done";
  if (row.gates_total != null && (row.gates_passed ?? 0) < row.gates_total) return "In Audit";
  if (status === "running") return "In Motion";
  if (spec === "READY" || spec === "PROPOSED") return "Awaiting GO";
  if (status === "scheduled") return "Scheduled";
  if (status === "parked" || spec === "DRAFT") return "Queued";
  return "Queued";
}

const STAGES = ["Queued", "Scheduled", "Awaiting GO", "In Motion", "In Audit", "Done"] as const;

/** Project grouping derived from the blueprint title prefix. */
function projectOf(title: string): string {
  const t = title ?? "";
  if (t.includes("★")) return "Command";
  if (t.startsWith("AUTHORITY & CID")) return "Authority & CID";
  if (t.startsWith("BUDDY")) return "BUDDY & Load";
  if (t.startsWith("HQ · BLUEPRINTS-OS")) return "Blueprints OS";
  if (/^HQ · \d\d /.test(t)) return "HQ Pages";
  if (t.startsWith("HQ ·")) return "HQ Program";
  if (/^P\d/.test(t)) return "Platform Programs";
  if (t.startsWith("ENTITLEMENTS")) return "Entitlements";
  return "Other";
}

function gatesLabel(row: ScheduledRow): string | null {
  if (row.gates_total == null) return null;
  return `gates ${row.gates_passed ?? 0}/${row.gates_total}`;
}

function MonoLabel({ children }: { children: React.ReactNode }) {
  return <div className={MONO}>{children}</div>;
}

function ScheduledCard({ row, onOpen }: { row: ScheduledRow; onOpen: () => void }) {
  const gates = gatesLabel(row);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-none border border-border bg-card p-3 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="text-sm font-medium leading-snug">{row.title ?? "Untitled"}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {row.program && (
          <Badge variant="secondary" className="rounded-none font-mono text-[10px] uppercase tracking-wider">
            {row.program}
          </Badge>
        )}
        {gates && <span className={MONO}>{gates}</span>}
      </div>
      {row.run_at && (
        <div className={cn(MONO, "mt-2")}>
          {format(new Date(row.run_at), "dd MMM yyyy")} · {format(new Date(row.run_at), "HH:mm")}
        </div>
      )}
    </button>
  );
}

export default function BlueprintsOS() {
  const [selection, setSelection] = useState<Selection>(null);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));

  // Tenant is resolved server-side from the caller's session; these RPCs take no arguments.
  const blueprintsQuery = useQuery({
    queryKey: ["hq-blueprints"],
    enabled: true,
    queryFn: async (): Promise<BlueprintRow[]> => {
      const { data, error } = await supabase.rpc("hq_blueprints_read");
      if (error) throw error;
      return (data ?? []) as unknown as BlueprintRow[];
    },
  });

  const scheduledQuery = useQuery({
    queryKey: ["hq-scheduled"],
    enabled: true,
    queryFn: async (): Promise<ScheduledRow[]> => {
      const { data, error } = await supabase.rpc("hq_scheduled_read");
      if (error) throw error;
      return (data ?? []) as unknown as ScheduledRow[];
    },
  });

  const blueprints = blueprintsQuery.data ?? [];
  const scheduled = scheduledQuery.data ?? [];

  const byStage = useMemo(() => {
    const map: Record<string, ScheduledRow[]> = Object.fromEntries(STAGES.map((s) => [s, [] as ScheduledRow[]]));
    for (const row of scheduled) map[stageOf(row)].push(row);
    return map;
  }, [scheduled]);

  const portfolio = useMemo(() => {
    const map = new Map<string, BlueprintRow[]>();
    for (const bp of blueprints) {
      const key = projectOf(bp.title ?? "");
      map.set(key, [...(map.get(key) ?? []), bp]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [blueprints]);

  const today = useMemo(() => {
    const now = new Date();
    const soonLimit = addDays(now, 7);
    return {
      attention: scheduled.filter((r) => {
        const spec = (r.spec_status ?? "").toUpperCase();
        return spec === "DRAFT" || stageOf(r) === "Awaiting GO";
      }),
      soon: scheduled.filter((r) => r.run_at && new Date(r.run_at) >= now && new Date(r.run_at) <= soonLimit),
      done: scheduled
        .filter((r) => (r.status ?? "").toLowerCase() === "completed")
        .slice(0, 12),
    };
  }, [scheduled]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 });
    const days: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
  }, [monthCursor]);




  const isLoading = blueprintsQuery.isLoading || scheduledQuery.isLoading;
  const isError = blueprintsQuery.isError || scheduledQuery.isError;
  const isEmpty = !isLoading && !isError && blueprints.length === 0 && scheduled.length === 0;

  const refetchAll = () => {
    void blueprintsQuery.refetch();
    void scheduledQuery.refetch();
  };

  const linkedBlueprint =
    selection?.kind === "scheduled" && selection.row.blueprint_id
      ? blueprints.find((b) => b.id === selection.row.blueprint_id) ?? null
      : selection?.kind === "blueprint"
        ? selection.row
        : null;

  return (
    <main className="min-h-screen bg-background">
      <PageHeader
        title="Blueprints"
        subtitle="Your build plan · from intent to done"
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/hq">HQ</Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-none" onClick={refetchAll}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
            </Button>
            <Button size="sm" className="rounded-none" onClick={notifyReadOnly}>
              Kick it off
            </Button>
          </div>
        }
      />

      <div className="space-y-6 p-6">
        {isError && (
          <Alert variant="destructive" className="rounded-none">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not load your plan</AlertTitle>
            <AlertDescription className="flex items-center gap-3">
              <span>The read failed. Nothing was changed.</span>
              <Button variant="outline" size="sm" className="rounded-none" onClick={refetchAll}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading your plan...</p>}

        {isEmpty && (
          <EmptyState
            icon={LayoutGrid}
            title="No plans yet"
            description="No plans yet · ask your COB to start one."
          />
        )}

        {!isLoading && !isError && !isEmpty && (
          <Tabs defaultValue="board">
            <TabsList className="rounded-none">
              <TabsTrigger value="board" className="rounded-none font-mono text-xs uppercase tracking-wider">Board</TabsTrigger>
              <TabsTrigger value="today" className="rounded-none font-mono text-xs uppercase tracking-wider">Today</TabsTrigger>
              <TabsTrigger value="month" className="rounded-none font-mono text-xs uppercase tracking-wider">Month</TabsTrigger>
              <TabsTrigger value="portfolio" className="rounded-none font-mono text-xs uppercase tracking-wider">Portfolio</TabsTrigger>
            </TabsList>

            {/* BOARD */}
            <TabsContent value="board" className="mt-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {STAGES.map((stage) => (
                  <div key={stage} className="border border-border bg-secondary/30">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <MonoLabel>{stage}</MonoLabel>
                      <span className={MONO}>{byStage[stage].length}</span>
                    </div>
                    <div className="space-y-2 p-2">
                      {byStage[stage].length === 0 ? (
                        <p className="px-1 py-3 text-xs text-muted-foreground">Nothing here.</p>
                      ) : (
                        byStage[stage].map((row) => (
                          <ScheduledCard key={row.id} row={row} onOpen={() => setSelection({ kind: "scheduled", row })} />
                        ))
                      )}
                      <button
                        type="button"
                        onClick={notifyReadOnly}
                        className="w-full border border-dashed border-border px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:border-accent"
                      >
                        + Add to {stage}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* TODAY */}
            <TabsContent value="today" className="mt-6">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {[
                  { label: "Needs attention", rows: today.attention },
                  { label: "Scheduled soon", rows: today.soon },
                  { label: "Recently done", rows: today.done },
                ].map((col) => (
                  <Card key={col.label} className="rounded-none">
                    <CardHeader className="border-b border-border py-3">
                      <CardTitle className={cn(MONO, "text-foreground")}>
                        {col.label} · {col.rows.length}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 p-3">
                      {col.rows.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nothing here.</p>
                      ) : (
                        col.rows.map((row) => (
                          <ScheduledCard key={row.id} row={row} onOpen={() => setSelection({ kind: "scheduled", row })} />
                        ))
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* MONTH */}
            <TabsContent value="month" className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <MonoLabel>{format(monthCursor, "MMMM yyyy")}</MonoLabel>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-none" onClick={() => setMonthCursor(addMonths(monthCursor, -1))} aria-label="Previous month">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-none" onClick={() => setMonthCursor(addMonths(monthCursor, 1))} aria-label="Next month">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-7 border-l border-t border-border">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className={cn(MONO, "border-b border-r border-border px-2 py-1")}>{d}</div>
                ))}
                {monthDays.map((day) => {
                  const events = scheduled.filter((r) => r.run_at && isSameDay(new Date(r.run_at), day));
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "min-h-[104px] border-b border-r border-border p-1.5",
                        !isSameMonth(day, monthCursor) && "bg-secondary/40",
                        isSameDay(day, new Date()) && "ring-1 ring-inset ring-accent"
                      )}
                    >
                      <div className={cn(MONO, "mb-1")}>{format(day, "d")}</div>
                      <div className="space-y-1">
                        {events.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => setSelection({ kind: "scheduled", row })}
                            className="block w-full truncate border border-border bg-card px-1.5 py-1 text-left text-[11px] hover:border-accent"
                          >
                            <span className="font-mono">{format(new Date(row.run_at as string), "HH:mm")}</span>{" "}
                            {row.title ?? "Untitled"}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* PORTFOLIO */}
            <TabsContent value="portfolio" className="mt-6 space-y-4">
              {portfolio.map(([project, rows]) => (
                <Card key={project} className="rounded-none">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-border py-3">
                    <CardTitle className={cn(MONO, "text-foreground")}>{project}</CardTitle>
                    <span className={MONO}>{rows.length} records</span>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Owner</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((bp) => (
                          <TableRow
                            key={bp.id}
                            className="cursor-pointer"
                            onClick={() => setSelection({ kind: "blueprint", row: bp })}
                          >
                            <TableCell className="font-medium">{bp.title}</TableCell>
                            <TableCell className="text-muted-foreground">{bp.owner ?? "·"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="rounded-none font-mono text-[10px] uppercase tracking-wider">
                                {bp.status ?? "unknown"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* DRAWER */}
      <Sheet open={!!selection} onOpenChange={(open) => !open && setSelection(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selection && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">
                  {selection.kind === "scheduled" ? selection.row.title ?? "Untitled" : selection.row.title}
                </SheetTitle>
                <SheetDescription className="text-left">Build packet · read only</SheetDescription>
              </SheetHeader>

              {selection.kind === "scheduled" && (
                <div className="mt-6 space-y-4">
                  <dl className="grid grid-cols-2 gap-4">
                    <div><MonoLabel>Program</MonoLabel><dd className="text-sm">{selection.row.program ?? "·"}</dd></div>
                    <div><MonoLabel>Run at</MonoLabel><dd className="text-sm">{selection.row.run_at ? format(new Date(selection.row.run_at), "dd MMM yyyy · HH:mm") : "·"}</dd></div>
                    <div><MonoLabel>Cadence</MonoLabel><dd className="text-sm">{selection.row.cadence ?? "·"}</dd></div>
                    <div><MonoLabel>Spec status</MonoLabel><dd className="text-sm">{selection.row.spec_status ?? "·"}</dd></div>
                    <div><MonoLabel>Gates</MonoLabel><dd className="text-sm">{gatesLabel(selection.row) ?? "·"}</dd></div>
                    <div><MonoLabel>Stage</MonoLabel><dd className="text-sm">{stageOf(selection.row)}</dd></div>
                  </dl>
                  {selection.row.detail && (
                    <div><MonoLabel>Detail</MonoLabel><p className="mt-1 whitespace-pre-wrap text-sm">{selection.row.detail}</p></div>
                  )}
                  {selection.row.build_spec != null && (
                    <div>
                      <MonoLabel>Build spec</MonoLabel>
                      <pre className="mt-1 overflow-x-auto border border-border bg-secondary/40 p-3 font-mono text-[11px]">
                        {typeof selection.row.build_spec === "string"
                          ? selection.row.build_spec
                          : JSON.stringify(selection.row.build_spec, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {linkedBlueprint && (
                <div className="mt-6 space-y-4">
                  {selection.kind === "scheduled" && <Separator />}
                  <MonoLabel>Blueprint</MonoLabel>
                  <div className="space-y-3">
                    <div className="text-sm font-medium">{linkedBlueprint.title}</div>
                    <dl className="grid grid-cols-2 gap-4">
                      <div><MonoLabel>Status</MonoLabel><dd className="text-sm">{linkedBlueprint.status ?? "·"}</dd></div>
                      <div><MonoLabel>Owner</MonoLabel><dd className="text-sm">{linkedBlueprint.owner ?? "·"}</dd></div>
                    </dl>
                    {linkedBlueprint.intent && (
                      <div><MonoLabel>Intent</MonoLabel><p className="mt-1 text-sm">{linkedBlueprint.intent}</p></div>
                    )}
                    {linkedBlueprint.current_state && (
                      <div><MonoLabel>Current state</MonoLabel><p className="mt-1 text-sm">{linkedBlueprint.current_state}</p></div>
                    )}
                    {linkedBlueprint.next_action && (
                      <div><MonoLabel>Next action</MonoLabel><p className="mt-1 text-sm">{linkedBlueprint.next_action}</p></div>
                    )}
                    {milestonesOf(linkedBlueprint.milestones).length > 0 && (
                      <div>
                        <MonoLabel>Milestones</MonoLabel>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                          {milestonesOf(linkedBlueprint.milestones).map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-8">
                <Button className="w-full rounded-none" onClick={notifyReadOnly}>
                  Kick it off
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
