import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { writeAuditEvent } from "@/lib/audit";
import { fmtUsd, type Schedule, type OccurrenceOverride, type OverrideKind, monthKey } from "@/lib/revenue-math";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  schedule: Schedule | null;
  /** The occurrence being edited (baseDate = date pre-move used for month key). */
  baseDate: Date | null;
  currentAmount: number;
  currentDate: Date | null;
  existingOverride: OccurrenceOverride | null;
  actorEmail?: string | null;
  workspaceId: string;
}

const KINDS: { key: OverrideKind; label: string; help: string }[] = [
  { key: "adjust_amount", label: "Adjust this month's amount", help: "Only this month · series unchanged." },
  { key: "move",          label: "Move this occurrence's date", help: "Slide this month to a different day." },
  { key: "skip",          label: "Skip this month",              help: "Drops from calendar / ribbon / totals." },
  { key: "mark_paid",     label: "Mark paid",                    help: "Counts as committed this month only." },
];

export default function OccurrenceEditorDialog(props: Props) {
  const { open, onOpenChange, schedule, baseDate, existingOverride, workspaceId, actorEmail, onSaved, currentAmount, currentDate } = props;
  const [kind, setKind] = useState<OverrideKind>("adjust_amount");
  const [newAmount, setNewAmount] = useState<string>("");
  const [newDate, setNewDate] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existingOverride) {
      setKind(existingOverride.override_kind);
      setNewAmount(existingOverride.new_amount_usd != null ? String(existingOverride.new_amount_usd) : String(currentAmount));
      setNewDate(existingOverride.new_date ?? (currentDate ? format(currentDate, "yyyy-MM-dd") : ""));
      setNote(existingOverride.note ?? "");
    } else {
      setKind("adjust_amount");
      setNewAmount(String(currentAmount));
      setNewDate(currentDate ? format(currentDate, "yyyy-MM-dd") : "");
      setNote("");
    }
  }, [open, existingOverride?.id, currentAmount, currentDate]);

  if (!schedule || !baseDate) return null;
  const key = monthKey(baseDate);
  const monthLabel = format(baseDate, "MMMM yyyy");

  const save = async () => {
    setBusy(true);
    const payload: any = {
      schedule_id: schedule.id,
      workspace_id: workspaceId,
      occurrence_month: key,
      override_kind: kind,
      new_date: kind === "move" ? (newDate || null) : null,
      new_amount_usd: kind === "adjust_amount" ? (newAmount === "" ? null : Number(newAmount)) : null,
      note: note.trim() || null,
    };
    let action = "added";
    let error: any = null;
    if (existingOverride) {
      const { error: e } = await (supabase as any)
        .from("revenue_occurrence_overrides")
        .update(payload)
        .eq("id", existingOverride.id);
      error = e; action = "updated";
    } else {
      const { error: e } = await (supabase as any)
        .from("revenue_occurrence_overrides")
        .insert(payload);
      error = e;
    }
    if (error) { toast.error(error.message); setBusy(false); return; }

    const humanKind =
      kind === "skip" ? "skipped" :
      kind === "move" ? `moved to ${newDate}` :
      kind === "adjust_amount" ? `adjusted to ${fmtUsd(Number(newAmount) || 0)}` :
      "marked paid";
    await writeAuditEvent({
      accountId: schedule.account_id,
      itemId: schedule.item_id ?? undefined,
      subject: `${monthLabel} occurrence of ${schedule.description} ${humanKind}`,
      actorEmail: actorEmail ?? null,
      extra: { schedule_id: schedule.id, occurrence_month: key, override_kind: kind, note: note.trim() || null, action },
      changes: [{ field: "override", before: existingOverride?.override_kind ?? null, after: kind }],
    });
    setBusy(false);
    onOpenChange(false);
    onSaved();
    toast.success("Occurrence override saved");
  };

  const remove = async () => {
    if (!existingOverride) return;
    if (!window.confirm(`Remove override for ${monthLabel}?`)) return;
    setBusy(true);
    const { error } = await (supabase as any)
      .from("revenue_occurrence_overrides")
      .delete()
      .eq("id", existingOverride.id);
    if (error) { toast.error(error.message); setBusy(false); return; }
    await writeAuditEvent({
      accountId: schedule.account_id,
      itemId: schedule.item_id ?? undefined,
      subject: `${monthLabel} occurrence override removed`,
      actorEmail: actorEmail ?? null,
      extra: { schedule_id: schedule.id, occurrence_month: key },
      changes: [{ field: "override", before: existingOverride.override_kind, after: null }],
    });
    setBusy(false);
    onOpenChange(false);
    onSaved();
    toast.success("Override removed");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit occurrence · {monthLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="text-xs font-mono text-muted-foreground border border-border rounded p-2">
            <div>{schedule.description || schedule.kind}</div>
            <div>Base · {fmtUsd(Number(schedule.amount_usd) || 0)}{schedule.cadence === "monthly" ? "/mo" : ""}</div>
            <div className="mt-1 text-[10px]">This month only. To change the whole schedule, edit it from the ledger.</div>
          </div>

          <div className="space-y-1">
            {KINDS.map(k => (
              <label key={k.key} className="flex items-start gap-2 cursor-pointer text-xs font-mono">
                <input type="radio" name="okind" checked={kind === k.key} onChange={() => setKind(k.key)} className="mt-0.5" />
                <span>
                  <span className="text-foreground">{k.label}</span>
                  <span className="block text-[10px] text-muted-foreground">{k.help}</span>
                </span>
              </label>
            ))}
          </div>

          {kind === "adjust_amount" && (
            <div>
              <label className="text-[10px] font-mono text-muted-foreground">New amount (USD)</label>
              <Input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} />
            </div>
          )}
          {kind === "move" && (
            <div>
              <label className="text-[10px] font-mono text-muted-foreground">New date</label>
              <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
            </div>
          )}

          <div>
            <label className="text-[10px] font-mono text-muted-foreground">Note (optional)</label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Why this month is different" />
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={save} disabled={busy}>
              {existingOverride ? "Save changes" : "Apply override"}
            </Button>
            {existingOverride && (
              <Button variant="outline" onClick={remove} disabled={busy}>Remove</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
