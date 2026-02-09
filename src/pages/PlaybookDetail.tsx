import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, ArrowDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLabels } from "@/lib/labels-context";

export default function PlaybookDetail() {
  const labels = useLabels();
  const { id } = useParams();
  const { workspace } = useWorkspace();
  const [playbook, setPlaybook] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  // Step form
  const [triggerState, setTriggerState] = useState("");
  const [actionType, setActionType] = useState("send_message");
  const [channel, setChannel] = useState("email");
  const [templateId, setTemplateId] = useState("");
  const [delayMinutes, setDelayMinutes] = useState("0");
  const [requiresApproval, setRequiresApproval] = useState(false);

  const fetchData = async () => {
    if (!id || !workspace) return;
    const [pbRes, stepsRes, tmplRes, statesRes] = await Promise.all([
      supabase.from("playbooks").select("*").eq("id", id).maybeSingle(),
      supabase.from("playbook_steps").select("*, templates(subject)").eq("playbook_id", id).order("step_order"),
      supabase.from("templates").select("id, subject, template_type").eq("workspace_id", workspace.id),
      supabase.from("item_states").select("*").eq("workspace_id", workspace.id).order("sort_order"),
    ]);
    setPlaybook(pbRes.data);
    setSteps(stepsRes.data || []);
    setTemplates(tmplRes.data || []);
    setStates(statesRes.data || []);
  };

  useEffect(() => { fetchData(); }, [id, workspace]);

  const addStep = async () => {
    if (!id || !triggerState) return;
    const { error } = await supabase.from("playbook_steps").insert({
      playbook_id: id,
      step_order: steps.length,
      trigger_state: triggerState,
      action_type: actionType,
      channel,
      template_id: templateId || null,
      delay_minutes: parseInt(delayMinutes) || 0,
      requires_approval: requiresApproval,
    });
    if (error) { toast.error(error.message); return; }
    setOpen(false);
    fetchData();
    toast.success("Step added");
  };

  const deleteStep = async (stepId: string) => {
    await supabase.from("playbook_steps").delete().eq("id", stepId);
    fetchData();
  };

  if (!playbook) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader
        title={playbook.name}
        subtitle={`${playbook.item_type} playbook · ${steps.length} steps`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus size={16} className="mr-1" /> Add Step</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Step</DialogTitle></DialogHeader>
              <div className="space-y-3">
                {states.length > 0 ? (
                  <Select value={triggerState} onValueChange={setTriggerState}>
                    <SelectTrigger><SelectValue placeholder="Trigger state" /></SelectTrigger>
                    <SelectContent>
                      {states.map(s => <SelectItem key={s.id} value={s.name}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input placeholder="Trigger state name" value={triggerState} onChange={e => setTriggerState(e.target.value)} />
                )}
                <Input placeholder="Action type" value={actionType} onChange={e => setActionType(e.target.value)} />
                <Input placeholder="Channel" value={channel} onChange={e => setChannel(e.target.value)} />
                {templates.length > 0 && (
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger><SelectValue placeholder="Template (optional)" /></SelectTrigger>
                    <SelectContent>
                      {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.subject || t.template_type}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Input placeholder="Delay (minutes)" type="number" value={delayMinutes} onChange={e => setDelayMinutes(e.target.value)} />
                <div className="flex items-center gap-2">
                  <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} />
                  <span className="text-sm">Requires approval</span>
                </div>
                <Button onClick={addStep} className="w-full">Add Step</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {steps.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">No steps defined yet.</div>
      ) : (
        <div className="p-6 space-y-2">
          {steps.map((s, i) => (
            <div key={s.id}>
              <div className="flex items-center justify-between p-3 rounded border border-border bg-card">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                    <span className="text-sm font-medium">When state = <span className="font-mono">{s.trigger_state}</span></span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{s.action_type}</span>
                    <span>via {s.channel}</span>
                    {s.delay_minutes > 0 && <span>+{s.delay_minutes}min delay</span>}
                    {s.requires_approval && <span className="text-status-amber">⚑ approval required</span>}
                    {s.templates?.subject && <span>→ {s.templates.subject}</span>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteStep(s.id)}>
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </div>
              {i < steps.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown size={14} className="text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
