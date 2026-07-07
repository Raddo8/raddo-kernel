import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { User, ExternalLink, Pencil, AlertTriangle, Plus, ShieldCheck, MailCheck } from "lucide-react";
import { format } from "date-fns";
import {
  NEXT_STATE_ACTION,
  GATED_STATES,
  changeItemState,
  accountHasDecisionMakerEmail,
} from "@/lib/state-transitions";
import ContactEditDialog, { type ContactRow } from "@/components/dialogs/ContactEditDialog";
import DoNotContactBanner from "@/components/DoNotContactBanner";
import { fmtUsd, expandOccurrences, indexOverrides, type Schedule, type OccurrenceOverride } from "@/lib/revenue-math";
import OccurrenceEditorDialog from "@/components/dialogs/OccurrenceEditorDialog";
import FilesPanel from "@/components/FilesPanel";

interface Props {
  pursuitId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  states: { id: string; name: string; label: string; color: string }[];
  onChanged: () => void;
  actorEmail?: string | null;
}

export default function PursuitSlideOut({ pursuitId, open, onOpenChange, states, onChanged, actorEmail }: Props) {
  const [item, setItem] = useState<any>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [overrides, setOverrides] = useState<OccurrenceOverride[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [layers, setLayers] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [editContact, setEditContact] = useState<ContactRow | null>(null);
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addDm, setAddDm] = useState(false);
  const [occEdit, setOccEdit] = useState<{
    schedule: Schedule; baseDate: Date; amount: number; date: Date; existing: OccurrenceOverride | null;
  } | null>(null);

  const load = async () => {
    if (!pursuitId) return;
    const { data: it } = await supabase
      .from("items")
      .select("id, title, state_id, account_id, workspace_id, metadata, updated_at, accounts(id, name, metadata), item_states(id, name, label, color)")
      .eq("id", pursuitId).maybeSingle();
    setItem(it);
    if (!it) return;

    const [{ data: cts }, { data: rev }, { data: tl }] = await Promise.all([
      supabase.from("contacts").select("*").eq("account_id", (it as any).account_id).order("created_at", { ascending: true }),
      (supabase as any).from("revenue_schedules").select("*").eq("item_id", pursuitId).order("start_date", { ascending: true }),
      supabase.from("timeline_events").select("id, summary, body, raw_json, occurred_at, channel, direction").eq("item_id", pursuitId).order("occurred_at", { ascending: false }).limit(50),
    ]);
    setContacts((cts as any) || []);
    setSchedules((rev || []) as Schedule[]);
    if (rev && rev.length > 0) {
      const ids = (rev as any[]).map(r => r.id);
      const { data: ovs } = await (supabase as any)
        .from("revenue_occurrence_overrides").select("*").in("schedule_id", ids);
      setOverrides((ovs || []) as OccurrenceOverride[]);
    } else {
      setOverrides([]);
    }
    setTimeline(tl || []);
    const byLayer: Record<string, any> = {};
    for (const row of tl || []) {
      const layer = (row as any).raw_json?.layer;
      if (layer && !byLayer[layer]) byLayer[layer] = row;
    }
    setLayers(byLayer);

    const slug = (it as any).accounts?.metadata?.utm_slug;
    if (slug) {
      const { data: se } = await supabase.from("site_events")
        .select("id, ts, event, route").eq("utm_source", slug)
        .order("ts", { ascending: false }).limit(10);
      setSignals(se || []);
    } else {
      setSignals([]);
    }
  };

  useEffect(() => { if (open && pursuitId) load(); }, [open, pursuitId]);

  const currentState = item?.item_states;
  const nextAction = currentState ? NEXT_STATE_ACTION[currentState.name] : null;
  const targetStateRow = nextAction ? states.find(s => s.name === nextAction.target) : null;
  const isPastQualified = currentState ? Array.from(GATED_STATES).includes(currentState.name) : false;
  const primary = contacts[0];
  const dmWithEmail = contacts.find(c => c.is_decision_maker && (c.email ?? "").trim());
  const needsDmBanner = isPastQualified && !dmWithEmail;

  const primaryTitle = primary?.title ?? primary?.role ?? null;

  const doAdvance = async () => {
    if (!item || !targetStateRow) return;
    setBusy(true);
    const res = await changeItemState({ item, targetStateId: targetStateRow.id, states });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Blocked"); return; }
    toast.success(`Moved to ${res.state?.label}`);
    await load();
    onChanged();
  };

  const addContact = async () => {
    if (!item || !addName.trim() || !addEmail.trim()) return;
    const { error } = await supabase.from("contacts").insert({
      account_id: item.account_id,
      name: addName.trim(),
      email: addEmail.trim(),
      title: addTitle.trim() || null,
      role: addTitle.trim() || null,
      is_decision_maker: addDm,
    } as any);
    if (error) { toast.error(error.message); return; }
    setAddName(""); setAddEmail(""); setAddTitle(""); setAddDm(false); setAddOpen(false);
    load();
  };

  const scheduleTotal = useMemo(() => {
    let one = 0, mo = 0;
    for (const s of schedules) {
      if ((s as any).counted === false) continue;
      if (s.cadence === "monthly") mo += Number(s.amount_usd || 0);
      else one += Number(s.amount_usd || 0);
    }
    return { one, mo };
  }, [schedules]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {!item ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-6">
            <SheetHeader>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {item.accounts?.name}
              </div>
              <SheetTitle className="text-lg leading-snug">{item.title}</SheetTitle>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                {currentState && (
                  <span className="px-1.5 py-0.5 rounded border" style={{ borderColor: currentState.color, color: currentState.color }}>
                    {currentState.label}
                  </span>
                )}
                {item.metadata?.score != null && <span className="px-1.5 py-0.5 border border-border rounded">score {item.metadata.score}</span>}
                {item.metadata?.cohort && <span className="px-1.5 py-0.5 border border-border rounded">{item.metadata.cohort}</span>}
              </div>
            </SheetHeader>

            {/* Contact block */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Primary contact</h3>
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setAddOpen(v => !v)}>
                  <Plus size={12} className="mr-1" /> add
                </Button>
              </div>
              {item.accounts?.metadata?.do_not_contact === true && (
                <div className="mb-2">
                  <DoNotContactBanner reason={item.accounts?.metadata?.do_not_contact_reason || null} />
                </div>
              )}
              {needsDmBanner && (
                <div className="mb-2 flex items-start gap-2 border border-destructive/50 bg-destructive/10 text-destructive rounded p-2 text-xs">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>Contact incomplete · decision-maker email required for this stage.</span>
                </div>
              )}
              {primary ? (
                <div className="border border-border rounded p-3 text-sm space-y-1 group relative">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-muted-foreground" />
                    <span className="font-medium">{primary.name}</span>
                    {primary.is_decision_maker && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-dossier-brass/60 text-dossier-brass flex items-center gap-1">
                        <ShieldCheck size={9} /> DM
                      </span>
                    )}
                    {primary.email_verified && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-status-green/60 text-status-green flex items-center gap-1">
                        <MailCheck size={9} /> verified
                      </span>
                    )}
                    <Button variant="ghost" size="sm" className="ml-auto h-6 opacity-0 group-hover:opacity-100"
                            onClick={() => { setEditContact(primary); setEditContactOpen(true); }}>
                      <Pencil size={11} />
                    </Button>
                  </div>
                  {primaryTitle && <div className="text-[11px] font-mono text-muted-foreground">{primaryTitle}</div>}
                  {primary.email && <div className="text-[11px] font-mono text-muted-foreground">{primary.email}</div>}
                  {primary.phone && <div className="text-[11px] font-mono text-muted-foreground">{primary.phone}</div>}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground border border-dashed border-border rounded p-3">No contact on file.</div>
              )}
              {contacts.length > 1 && (
                <div className="mt-2 space-y-1">
                  {contacts.slice(1).map(c => (
                    <div key={c.id} className="text-[11px] font-mono text-muted-foreground flex items-center gap-2 group">
                      <span>{c.name}</span>
                      {c.is_decision_maker && <span className="text-dossier-brass">· DM</span>}
                      {c.email && <span>· {c.email}</span>}
                      <Button variant="ghost" size="sm" className="ml-auto h-5 opacity-0 group-hover:opacity-100"
                              onClick={() => { setEditContact(c); setEditContactOpen(true); }}>
                        <Pencil size={10} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {addOpen && (
                <div className="mt-2 border border-border rounded p-2 space-y-2">
                  <input className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
                         placeholder="Name" value={addName} onChange={e => setAddName(e.target.value)} />
                  <input className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
                         placeholder="Title" value={addTitle} onChange={e => setAddTitle(e.target.value)} />
                  <input className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
                         placeholder="Email" value={addEmail} onChange={e => setAddEmail(e.target.value)} />
                  <label className="text-[11px] font-mono flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={addDm} onChange={e => setAddDm(e.target.checked)} /> decision-maker
                  </label>
                  <Button size="sm" className="w-full" onClick={addContact} disabled={!addName.trim() || !addEmail.trim()}>Save contact</Button>
                </div>
              )}
            </section>

            {/* Next-state action */}
            {nextAction && targetStateRow && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Next</h3>
                <Button className="w-full justify-start" onClick={doAdvance} disabled={busy}>
                  → {nextAction.label}
                </Button>
                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                  Advances to <strong>{targetStateRow.label}</strong>. Writes a timeline event.
                </p>
              </section>
            )}

            {/* Dossier summary */}
            <section>
              <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Dossier</h3>
              {layers.L2 ? (
                <div className="text-sm border border-border rounded p-2 whitespace-pre-wrap line-clamp-6">
                  {layers.L2.body || layers.L2.summary}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No L2 opener yet.</div>
              )}
              {item.metadata?.dossier_ref && (
                <div className="mt-1 text-[10px] font-mono text-muted-foreground truncate">
                  ref · {item.metadata.dossier_ref}
                </div>
              )}
            </section>

            {/* Signals */}
            <section>
              <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Signals · last {signals.length}
              </h3>
              {signals.length === 0 ? (
                <div className="text-xs text-muted-foreground">No signals yet.</div>
              ) : (
                <div className="space-y-1">
                  {signals.slice(0, 3).map(e => (
                    <div key={e.id} className="text-[11px] font-mono flex gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">{format(new Date(e.ts), "MMM d HH:mm")}</span>
                      <span className="w-20 shrink-0">{e.event}</span>
                      <span className="flex-1 truncate text-muted-foreground">{e.route}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Timeline */}
            <section>
              <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Recent events</h3>
              {timeline.length === 0 ? (
                <div className="text-xs text-muted-foreground">No events.</div>
              ) : (
                <div className="space-y-1.5">
                  {timeline.slice(0, 3).map(e => (
                    <div key={e.id} className="text-xs border-l-2 border-border pl-2">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium truncate">{e.summary}</span>
                        <span className="text-[10px] font-mono text-muted-foreground ml-auto shrink-0">
                          {format(new Date(e.occurred_at), "MMM d HH:mm")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Revenue */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Revenue schedules</h3>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {scheduleTotal.one > 0 && `${fmtUsd(scheduleTotal.one)} one-time`}
                  {scheduleTotal.one > 0 && scheduleTotal.mo > 0 && " · "}
                  {scheduleTotal.mo > 0 && `${fmtUsd(scheduleTotal.mo)}/mo`}
                </span>
              </div>
              {schedules.length === 0 ? (
                <div className="text-xs text-muted-foreground">No schedules linked.</div>
              ) : (
                <div className="space-y-2">
                  {schedules.map(s => {
                    const idx = indexOverrides(overrides);
                    const from = new Date();
                    const to = new Date(); to.setMonth(to.getMonth() + 6);
                    const occs = expandOccurrences(s, from, to, idx[s.id] || []).slice(0, 3);
                    return (
                      <div key={s.id} className={`border border-border rounded p-2 space-y-1 ${(s as any).counted === false ? "opacity-50" : ""}`}>
                        <div className="text-[11px] font-mono flex justify-between">
                          <span className="truncate">
                            {s.description || s.kind}
                            {(s as any).counted === false && <span className="ml-1 text-[9px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1">excluded</span>}
                          </span>
                          <span className={(s as any).counted === false ? "line-through" : ""}>{fmtUsd(Number(s.amount_usd || 0))}{s.cadence === "monthly" ? "/mo" : ""}</span>
                        </div>
                        {occs.length > 0 && (
                          <div className="space-y-0.5">
                            {occs.map((o, i) => (
                              <button
                                key={i}
                                onClick={() => setOccEdit({
                                  schedule: s, baseDate: o.baseDate, amount: o.amount, date: o.date, existing: o.override,
                                })}
                                className="w-full text-left text-[10px] font-mono text-muted-foreground flex justify-between hover:text-dossier-brass"
                              >
                                <span>
                                  {format(o.date, "MMM d")}
                                  {o.override && <span className="text-dossier-brass"> · {o.override.override_kind}</span>}
                                </span>
                                <span>{fmtUsd(o.amount)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Files */}
            {item.accounts?.id && (
              <FilesPanel
                workspaceId={(item as any).workspace_id}
                accountId={item.accounts.id}
                itemId={item.id}
                actorEmail={actorEmail}
                compact
              />
            )}

            <div>
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link to={`/app/items/${item.id}`}>
                  Open full record <ExternalLink size={12} className="ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        )}
        <ContactEditDialog
          contact={editContact}
          open={editContactOpen}
          onOpenChange={setEditContactOpen}
          onSaved={load}
          actorEmail={actorEmail}
        />
        <OccurrenceEditorDialog
          open={!!occEdit}
          onOpenChange={(v) => { if (!v) setOccEdit(null); }}
          onSaved={load}
          schedule={occEdit?.schedule ?? null}
          baseDate={occEdit?.baseDate ?? null}
          currentAmount={occEdit?.amount ?? 0}
          currentDate={occEdit?.date ?? null}
          existingOverride={occEdit?.existing ?? null}
          actorEmail={actorEmail}
          workspaceId={occEdit?.schedule?.workspace_id ?? ""}
        />
      </SheetContent>
    </Sheet>
  );
}
