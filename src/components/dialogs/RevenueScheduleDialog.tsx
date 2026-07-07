import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { writeAuditEvent } from "@/lib/audit";
import type { Schedule } from "@/lib/revenue-math";

const STATUSES = ["expected","agreement_pending","invoiced","active","paid","overdue","cancelled"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  workspaceId: string;
  actorEmail?: string | null;
  schedule?: Schedule | null;              // present = edit
  accounts?: { id: string; name: string }[];   // required for create
  pursuits?: { id: string; title: string; account_id: string }[]; // optional link
}

export default function RevenueScheduleDialog({
  open, onOpenChange, onSaved, workspaceId, actorEmail, schedule, accounts = [], pursuits = [],
}: Props) {
  const editing = !!schedule;
  const [accountId, setAccountId] = useState("");
  const [itemId, setItemId] = useState<string>("");
  const [kind, setKind] = useState<"one_time"|"subscription">("one_time");
  const [cadence, setCadence] = useState<"once"|"monthly">("once");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [next, setNext] = useState("");
  const [status, setStatus] = useState<string>("expected");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (schedule) {
      setAccountId(schedule.account_id);
      setItemId(schedule.item_id ?? "");
      setKind(schedule.kind);
      setCadence(schedule.cadence);
      setDescription(schedule.description);
      setAmount(String(schedule.amount_usd ?? ""));
      setStart(schedule.start_date ?? "");
      setEnd(schedule.end_date ?? "");
      setNext(schedule.next_due ?? "");
      setStatus(schedule.status);
    } else {
      setAccountId(""); setItemId(""); setKind("one_time"); setCadence("once");
      setDescription(""); setAmount(""); setStart(""); setEnd(""); setNext("");
      setStatus("expected");
    }
  }, [schedule?.id, open]);

  const canSave = accountId && description.trim() && amount !== "" && Number(amount) >= 0;

  const save = async () => {
    if (!canSave) return;
    // Insert-vs-update invariant: branch STRICTLY on presence of schedule.id.
    // If the dialog was opened in edit mode, we must UPDATE by id — never insert.
    if (editing && !schedule?.id) {
      toast.error("Edit target lost. Reopen the row to edit.");
      return;
    }
    setSaving(true);
    const payload: any = {
      workspace_id: workspaceId,
      account_id: accountId,
      item_id: itemId || null,
      kind,
      cadence: kind === "subscription" ? "monthly" : "once",
      description: description.trim(),
      amount_usd: Number(amount),
      start_date: start || null,
      end_date: end || null,
      next_due: next || null,
      status,
    };
    if (editing && schedule) {
      const { error } = await (supabase as any)
        .from("revenue_schedules")
        .update(payload)
        .eq("id", schedule.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      await writeAuditEvent({
        accountId: schedule.account_id,
        itemId: schedule.item_id ?? undefined,
        subject: "revenue schedule updated",
        actorEmail: actorEmail ?? null,
        changes: [
          { field: "description", before: schedule.description, after: payload.description },
          { field: "amount_usd", before: schedule.amount_usd, after: payload.amount_usd },
          { field: "kind", before: schedule.kind, after: payload.kind },
          { field: "cadence", before: schedule.cadence, after: payload.cadence },
          { field: "start_date", before: schedule.start_date, after: payload.start_date },
          { field: "end_date", before: schedule.end_date, after: payload.end_date },
          { field: "next_due", before: schedule.next_due, after: payload.next_due },
          { field: "status", before: schedule.status, after: payload.status },
        ],
      });
    } else {
      const { data, error } = await (supabase as any)
        .from("revenue_schedules")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (error) { toast.error(error.message); setSaving(false); return; }
      await writeAuditEvent({
        accountId,
        itemId: itemId || undefined,
        subject: "revenue schedule added",
        actorEmail: actorEmail ?? null,
        extra: { schedule_id: data?.id },
        changes: [
          { field: "description", before: null, after: payload.description },
          { field: "amount_usd", before: null, after: payload.amount_usd },
          { field: "kind", before: null, after: payload.kind },
        ],
      });
    }
    setSaving(false);
    onOpenChange(false);
    onSaved();
    toast.success(editing ? "Schedule updated" : "Schedule added");
  };

  const filteredPursuits = pursuits.filter(p => !accountId || p.account_id === accountId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Edit revenue schedule" : "Add revenue schedule"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!editing && (
            <>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={itemId || "__none__"} onValueChange={(v) => setItemId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Link to pursuit (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {filteredPursuits.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
          <Input placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="Amount (USD)" value={amount} onChange={e => setAmount(e.target.value)} />
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">one-time</SelectItem>
                <SelectItem value="subscription">subscription (monthly)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-mono text-muted-foreground">Start</label>
              <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-mono text-muted-foreground">Next due</label>
              <Input type="date" value={next} onChange={e => setNext(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-mono text-muted-foreground">End</label>
              <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={save} className="w-full" disabled={!canSave || saving}>
            {editing ? "Save changes" : "Add schedule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export async function softCancelSchedule(schedule: Schedule, actorEmail?: string | null) {
  const { error } = await (supabase as any)
    .from("revenue_schedules")
    .update({ status: "cancelled" })
    .eq("id", schedule.id);
  if (error) { toast.error(error.message); return false; }
  await writeAuditEvent({
    accountId: schedule.account_id,
    itemId: schedule.item_id ?? undefined,
    subject: "revenue schedule cancelled",
    actorEmail: actorEmail ?? null,
    changes: [{ field: "status", before: schedule.status, after: "cancelled" }],
  });
  toast.success("Schedule cancelled");
  return true;
}
