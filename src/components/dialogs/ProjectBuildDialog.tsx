/**
 * Dialog to create a new project build.
 * Optionally link to an existing revenue_schedule for the selected account.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BUILD_KINDS, createBuild, type ProjectBuildKind } from "@/lib/project-builds";
import { fmtUsd } from "@/lib/revenue-math";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultAccountId?: string;
  onCreated?: () => void;
}

export default function ProjectBuildDialog({ open, onOpenChange, defaultAccountId, onCreated }: Props) {
  const { workspace } = useWorkspace();
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [schedules, setSchedules] = useState<{ id: string; description: string; amount: number; status: string }[]>([]);
  const [accountId, setAccountId] = useState<string>(defaultAccountId || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ProjectBuildKind>("mini_site");
  const [scheduleId, setScheduleId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !workspace) return;
    supabase.from("accounts").select("id, name").eq("workspace_id", workspace.id).order("name")
      .then(({ data }) => setAccounts((data as any) || []));
  }, [open, workspace]);

  useEffect(() => {
    if (!accountId) { setSchedules([]); return; }
    (supabase as any).from("revenue_schedules")
      .select("id, description, amount_usd, status")
      .eq("account_id", accountId)
      .then(({ data }: any) => setSchedules((data || []).map((s: any) => ({
        id: s.id, description: s.description || "milestone",
        amount: Number(s.amount_usd || 0), status: s.status,
      }))));
  }, [accountId]);

  useEffect(() => { if (open && defaultAccountId) setAccountId(defaultAccountId); }, [open, defaultAccountId]);

  const submit = async () => {
    if (!workspace || !accountId || !title.trim()) return;
    setBusy(true);
    const res = await createBuild({
      workspaceId: workspace.id,
      accountId,
      title,
      description,
      kind,
      revenue_schedule_id: scheduleId || null,
    });
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Build created");
    setTitle(""); setDescription(""); setKind("mini_site"); setScheduleId("");
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New project build</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!defaultAccountId && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Account</label>
              <select className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
                      value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">Select account…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <Input placeholder="Build title" value={title} onChange={e => setTitle(e.target.value)} />
          <Textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Kind</label>
            <select className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
                    value={kind} onChange={e => setKind(e.target.value as ProjectBuildKind)}>
              {BUILD_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Milestone payment (optional)</label>
            <select className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
                    value={scheduleId} onChange={e => setScheduleId(e.target.value)} disabled={!accountId}>
              <option value="">None</option>
              {schedules.map(s => (
                <option key={s.id} value={s.id}>{s.description} · {fmtUsd(s.amount)} · {s.status}</option>
              ))}
            </select>
          </div>
          <Button className="w-full" onClick={submit} disabled={busy || !accountId || !title.trim()}>
            Create build
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
